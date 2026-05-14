package app.restful.services.correction.dehaze;

import java.util.Map;

import org.bytedeco.javacpp.indexer.FloatIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Point;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.bytedeco.opencv.opencv_core.Size;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Single-image dehazing using the dark-channel prior
 * (He, Sun &amp; Tang — CVPR 2009).
 *
 * <p>Most haze-free outdoor patches contain at least one channel whose
 * intensity is near zero. The dark channel — the per-patch min across the
 * three colour channels — is therefore a strong prior for hazy regions:
 * where it is high, the scene is foggy.</p>
 *
 * <p>Pipeline:</p>
 * <ol>
 *   <li>Compute the per-pixel dark channel via per-channel min, then a local
 *       erosion (min filter) over a 15×15 window.</li>
 *   <li>Estimate atmospheric light {@code A}: average the original pixels at
 *       the top 0.1% brightest dark-channel locations.</li>
 *   <li>Estimate transmission {@code t̂(x) = 1 − ω · darkChannel(I / A)}.</li>
 *   <li>Soften the transmission map with a Gaussian blur (cheap stand-in for
 *       guided-filter refinement — keeps edges acceptable on most scenes).</li>
 *   <li>Recover scene radiance {@code J(x) = (I(x) − A) / max(t(x), t0) + A}.</li>
 * </ol>
 *
 * <p>Parameters:</p>
 * <ul>
 *   <li>{@code omega} (default 0.95, range [0.8, 1.0]) — haze removal strength.
 *       Lower values keep more atmospheric haze for a natural look.</li>
 *   <li>{@code t0} (default 0.1, range [0.05, 0.3]) — minimum transmission
 *       floor. Prevents division noise where the scene is genuinely opaque.</li>
 * </ul>
 */
@Component
public class DarkChannelDehazeAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "dark_channel_dehaze";

    /** Local-window size for the dark-channel min filter. */
    private static final int PATCH = 15;

    /** Top-N fraction (of total pixels) used to estimate atmospheric light. */
    private static final double ATMOSPHERIC_TOP_FRACTION = 0.001;

    /** Gaussian σ (fraction of image dimension) for transmission softening. */
    private static final double TRANSMISSION_BLUR_SIGMA = 0.012;

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double omega = ParamUtils.getDouble(params, "omega", 0.95);
        double t0    = ParamUtils.getDouble(params, "t0",    0.10);
        return applyCore(bgr, omega, t0);
    }

    public static Mat applyCore(Mat bgr, double omega, double t0) {
        if (bgr.channels() != 3) {
            throw new IllegalArgumentException("dark_channel_dehaze requires a 3-channel BGR image");
        }
        omega = clamp(omega, 0.5, 1.0);
        t0    = clamp(t0,    0.01, 0.5);

        // Convert to float [0, 1].
        Mat bgrF = new Mat();
        bgr.convertTo(bgrF, opencv_core.CV_32F, 1.0 / 255.0, 0.0);

        Mat dark = darkChannel(bgrF);
        double[] atmos = estimateAtmosphericLight(bgrF, dark);

        // Transmission estimate via dark channel of I / A.
        Mat normalised = divideByAtmosphere(bgrF, atmos);
        Mat darkNorm = darkChannel(normalised);
        normalised.release();

        Mat transmission = new Mat(darkNorm.size(), opencv_core.CV_32F);
        // t = 1 - omega * darkNorm
        opencv_core.subtract(
                new Mat(darkNorm.size(), opencv_core.CV_32F, new Scalar(1.0)),
                muls(darkNorm, omega),
                transmission);
        darkNorm.release();
        dark.release();

        // Soften transmission boundaries — guided filter would be better but
        // a Gaussian blur is good enough for most natural scenes.
        Size kSize = new Size(0, 0);
        double sigma = TRANSMISSION_BLUR_SIGMA * Math.max(bgr.rows(), bgr.cols());
        opencv_imgproc.GaussianBlur(transmission, transmission, kSize, sigma);
        kSize.close();

        // Floor transmission at t0 then recover radiance per channel.
        Mat radianceF = recoverRadiance(bgrF, transmission, atmos, t0);
        transmission.release();
        bgrF.release();

        Mat out = new Mat();
        radianceF.convertTo(out, opencv_core.CV_8U, 255.0, 0.0);
        radianceF.release();
        return out;
    }

    // -------------------------------------------------------------------------
    // Stages
    // -------------------------------------------------------------------------

    /** Per-pixel min across channels followed by a local 15×15 min (erode). */
    private static Mat darkChannel(Mat bgrF) {
        MatVector ch = new MatVector(3);
        opencv_core.split(bgrF, ch);
        Mat minBG = new Mat();
        Mat min3  = new Mat();
        opencv_core.min(ch.get(0), ch.get(1), minBG);
        opencv_core.min(minBG, ch.get(2), min3);
        minBG.release();
        ch.close();

        Mat kernel = opencv_imgproc.getStructuringElement(
                opencv_imgproc.MORPH_RECT, new Size(PATCH, PATCH));
        Mat dark = new Mat();
        opencv_imgproc.erode(min3, dark, kernel,
                new Point(-1, -1), 1, opencv_core.BORDER_REFLECT, opencv_imgproc.morphologyDefaultBorderValue());
        min3.release();
        kernel.release();
        return dark;
    }

    /**
     * Atmospheric light estimate: average BGR of the top {@code 0.1%} brightest
     * dark-channel pixels. Returns {@code [B, A, R]} in {@code [0, 1]}.
     */
    private static double[] estimateAtmosphericLight(Mat bgrF, Mat dark) {
        int rows = dark.rows();
        int cols = dark.cols();
        int total = rows * cols;
        int topN = Math.max(1, (int) Math.round(total * ATMOSPHERIC_TOP_FRACTION));

        // Find the threshold by quick partial sort on a flat copy.
        FloatIndexer di = dark.createIndexer();
        float[] flat = new float[total];
        int idx = 0;
        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                flat[idx++] = di.get(y, x);
            }
        }
        di.release();
        // Threshold = the (total - topN)-th order statistic.
        float[] copy = flat.clone();
        java.util.Arrays.sort(copy);
        float threshold = copy[Math.max(0, total - topN)];

        // Average the BGR values at those positions.
        FloatIndexer bi = bgrF.createIndexer();
        FloatIndexer di2 = dark.createIndexer();
        double sumB = 0, sumG = 0, sumR = 0;
        int count = 0;
        float[] px = new float[3];
        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                if (di2.get(y, x) >= threshold) {
                    bi.get(y, x, px);
                    sumB += px[0]; sumG += px[1]; sumR += px[2];
                    count++;
                }
            }
        }
        bi.release();
        di2.release();
        if (count == 0) return new double[] { 1.0, 1.0, 1.0 };
        return new double[] { sumB / count, sumG / count, sumR / count };
    }

    /** Per-channel divide of {@code bgrF} by atmosphere, clamped to a sane upper bound. */
    private static Mat divideByAtmosphere(Mat bgrF, double[] atmos) {
        MatVector ch = new MatVector(3);
        opencv_core.split(bgrF, ch);
        for (int i = 0; i < 3; i++) {
            double a = Math.max(1e-3, atmos[i]);
            Mat scaled = new Mat();
            ch.get(i).convertTo(scaled, opencv_core.CV_32F, 1.0 / a, 0.0);
            ch.put(i, scaled);
        }
        Mat merged = new Mat();
        opencv_core.merge(ch, merged);
        ch.close();
        return merged;
    }

    /** {@code J = (I − A) / max(t, t0) + A} per channel. */
    private static Mat recoverRadiance(Mat bgrF, Mat transmission, double[] atmos, double t0) {
        int rows = bgrF.rows();
        int cols = bgrF.cols();
        Mat out = new Mat(rows, cols, opencv_core.CV_32FC3);
        FloatIndexer in  = bgrF.createIndexer();
        FloatIndexer ti  = transmission.createIndexer();
        FloatIndexer oi  = out.createIndexer();
        float[] px = new float[3];
        float[] op = new float[3];
        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                in.get(y, x, px);
                double t = Math.max(ti.get(y, x), t0);
                for (int c = 0; c < 3; c++) {
                    double v = (px[c] - atmos[c]) / t + atmos[c];
                    if (v < 0) v = 0;
                    if (v > 1) v = 1;
                    op[c] = (float) v;
                }
                oi.put(y, x, op);
            }
        }
        in.release();
        ti.release();
        oi.release();
        return out;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static Mat muls(Mat src, double scalar) {
        Mat out = new Mat();
        src.convertTo(out, opencv_core.CV_32F, scalar, 0.0);
        return out;
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
