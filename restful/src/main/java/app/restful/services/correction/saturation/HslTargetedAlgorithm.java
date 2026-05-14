package app.restful.services.correction.saturation;

import java.util.Map;

import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Per-hue-band saturation adjustment across 6 colour bands (Red, Yellow,
 * Green, Cyan, Blue, Magenta). A Gaussian weight feathers the bands together
 * so adjustments transition smoothly and pixels near band boundaries receive
 * a blended contribution from both neighbours.
 *
 * <p>Pairs directly with the {@code Oversaturated_<Colour>} classifier issues
 * so the agent can pull a single colour down without affecting the rest of the
 * frame — e.g. {@code redSat=-0.3} targets an over-saturated red cast while
 * leaving greens and blues untouched.</p>
 *
 * <p>Per-pixel gain is {@code 1 + Σ δᵢ · wᵢ(h)} where {@code δᵢ} is the band's
 * saturation delta and {@code wᵢ(h) = exp(-d(h, cᵢ)² / 2σ²)}, with {@code σ}
 * chosen so neighbouring bands meet near {@code w ≈ 0.3}.</p>
 */
@Component
public class HslTargetedAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "hsl_targeted";

    // OpenCV 8-bit hue: 0..179 maps to 0..360°. Band centres in 8-bit units.
    private static final double[] BAND_CENTERS = {0, 30, 60, 90, 120, 150};
    private static final String[] BAND_PARAMS  = {
            "redSat", "yellowSat", "greenSat", "cyanSat", "blueSat", "magentaSat"
    };

    // σ = 10 in 8-bit hue units (≈20° actual). Neighbour bands (30 apart) meet
    // at w = exp(-4.5) ≈ 0.011 from the far band and add up smoothly in between.
    private static final double SIGMA = 10.0;
    private static final double TWO_SIGMA_SQ = 2.0 * SIGMA * SIGMA;
    private static final int HUE_WRAP = 180;

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double[] deltas = new double[6];
        for (int i = 0; i < 6; i++) {
            double v = ParamUtils.getDouble(params, BAND_PARAMS[i], 0.0);
            if (v < -1.0) v = -1.0;
            if (v >  1.0) v =  1.0;
            deltas[i] = v;
        }
        return applyCore(bgr, deltas);
    }

    public static Mat applyCore(Mat bgr, double[] bandDeltas) {
        if (bandDeltas == null || bandDeltas.length != 6) {
            throw new IllegalArgumentException("bandDeltas must be length 6 (R,Y,G,C,B,M)");
        }

        // Identity shortcut — keeps downstream pixel comparisons exact.
        if (isAllZero(bandDeltas)) return bgr.clone();

        // Precompute per-hue gain (all 180 possible 8-bit H values). A single
        // exp() per hue beats re-evaluating inside the pixel loop: a 12 MP
        // image would otherwise cost ~72 M exp() calls.
        double[] gainLut = new double[HUE_WRAP];
        for (int hu = 0; hu < HUE_WRAP; hu++) {
            double gain = 1.0;
            for (int i = 0; i < 6; i++) {
                double d = hueDist(hu, BAND_CENTERS[i]);
                double w = Math.exp(-(d * d) / TWO_SIGMA_SQ);
                gain += bandDeltas[i] * w;
            }
            if (gain < 0) gain = 0;
            gainLut[hu] = gain;
        }

        Mat hsv = new Mat();
        opencv_imgproc.cvtColor(bgr, hsv, opencv_imgproc.COLOR_BGR2HSV);

        MatVector channels = new MatVector(3);
        opencv_core.split(hsv, channels);

        Mat h = channels.get(0);
        Mat s = channels.get(1);
        Mat v = channels.get(2);

        int rows = s.rows();
        int cols = s.cols();
        UByteIndexer hIdx = h.createIndexer();
        UByteIndexer sIdx = s.createIndexer();

        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                int hu = hIdx.get(y, x);
                int sv = sIdx.get(y, x);
                int ns = (int) Math.round(sv * gainLut[hu]);
                if (ns < 0)   ns = 0;
                if (ns > 255) ns = 255;
                sIdx.put(y, x, ns);
            }
        }
        hIdx.release();
        sIdx.release();

        MatVector merged = new MatVector(h, s, v);
        Mat hsvOut = new Mat();
        opencv_core.merge(merged, hsvOut);

        Mat result = new Mat();
        opencv_imgproc.cvtColor(hsvOut, result, opencv_imgproc.COLOR_HSV2BGR);

        channels.close();
        merged.close();
        hsvOut.release();
        hsv.release();

        return result;
    }

    /** Shortest circular distance between two hues on the 0..179 ring. */
    private static double hueDist(double a, double b) {
        double d = Math.abs(a - b);
        return Math.min(d, HUE_WRAP - d);
    }

    private static boolean isAllZero(double[] a) {
        for (double v : a) if (v != 0.0) return false;
        return true;
    }
}
