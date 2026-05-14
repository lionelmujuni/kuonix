package app.restful.services.correction.saturation;

import java.util.Map;

import org.bytedeco.javacpp.indexer.FloatIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * ACES-style soft gamut compression.
 *
 * <p>Pulls over-saturated chroma (channel values that exceed the image's
 * achromatic axis by more than {@code threshold}) back toward neutral using
 * the Parametric Reinhard soft-knee used in the Academy ACES Gamut Compress
 * LMT. Hue is preserved — the compression is applied to the per-channel
 * distance-from-achromatic, not to saturation in HSV.</p>
 *
 * <p>Pipeline per pixel:
 * <ol>
 *   <li>Let {@code ac = max(R, G, B)} (the achromatic component).</li>
 *   <li>For each channel c: {@code d = (ac - c) / ac}. {@code d == 0} at {@code c == ac} (the in-gamut axis); larger {@code d} = more colourful.</li>
 *   <li>Beyond {@code threshold}, compress {@code d} with a soft knee so the value approaches the asymptote {@code limit} (but never exceeds it).</li>
 *   <li>Reconstruct {@code c' = ac * (1 - d')}.</li>
 * </ol>
 *
 * <p>Defaults match ACES Gamut Compress LMT v1.0: threshold=0.8, limit=1.2.</p>
 *
 * <p>Reference: Academy Colour Encoding System, "Gamut Compress LMT",
 * ampas-tac / output-transforms-dev (2020).</p>
 */
@Component
public class GamutCompressAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "gamut_compress";

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double threshold = ParamUtils.getDouble(params, "threshold", 0.8);
        double limit     = ParamUtils.getDouble(params, "limit", 1.2);
        return applyCore(bgr, threshold, limit);
    }

    public static Mat applyCore(Mat bgr, double threshold, double limit) {
        threshold = Math.max(0.01, Math.min(0.999, threshold));
        // `limit` is the asymptote; must sit above `threshold`, else no room for the knee.
        limit = Math.max(threshold + 0.05, Math.min(2.0, limit));

        Mat bgrF = new Mat();
        bgr.convertTo(bgrF, opencv_core.CV_32F, 1.0 / 255.0, 0.0);   // normalise to [0, 1]

        int rows = bgrF.rows();
        int cols = bgrF.cols();
        FloatIndexer idx = bgrF.createIndexer();
        float[] px = new float[3];

        // Distance beyond threshold we can still travel before hitting the asymptote.
        double span = limit - threshold;

        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                idx.get(y, x, px);
                float b = px[0], g = px[1], r = px[2];
                float ac = Math.max(b, Math.max(g, r));
                if (ac <= 1e-5f) continue;                         // pure black — nothing to do

                for (int c = 0; c < 3; c++) {
                    double v = px[c];
                    double d = (ac - v) / ac;                      // in [0, ∞) for out-of-gamut
                    double dPrime;
                    if (d < threshold) {
                        dPrime = d;                                // in-gamut region untouched
                    } else {
                        double s = (d - threshold) / span;         // 0 at threshold
                        // Reinhard-like knee bounded at (limit - threshold):
                        //   compressed = threshold + span * s / sqrt(1 + s^2)
                        double compressed = threshold + span * s / Math.sqrt(1.0 + s * s);
                        dPrime = compressed;
                    }
                    double vPrime = ac * (1.0 - dPrime);
                    if (vPrime < 0) vPrime = 0;
                    if (vPrime > 1) vPrime = 1;
                    px[c] = (float) vPrime;
                }
                idx.put(y, x, px);
            }
        }
        idx.release();

        Mat out = new Mat();
        bgrF.convertTo(out, opencv_core.CV_8U, 255.0, 0.0);
        bgrF.release();
        return out;
    }
}
