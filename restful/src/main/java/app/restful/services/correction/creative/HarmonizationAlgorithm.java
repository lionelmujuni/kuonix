package app.restful.services.correction.creative;

import java.util.Map;

import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Cohen-Or colour harmonization (SIGGRAPH 2006, simplified).
 *
 * <p>Snaps each pixel's hue toward the nearest sector of a classical harmony
 * template. The Cohen-Or templates partition the hue wheel into one or two
 * narrow bands (and one wide complementary band for a few of them); pixels
 * whose hue falls outside the template are rotated to the closest allowed
 * hue. Saturated, brightly-coloured pixels are shifted more aggressively
 * than near-neutral ones (weighted by HSV S × V).</p>
 *
 * <p>Templates (single letter ids — Cohen-Or notation):</p>
 * <ul>
 *   <li>{@code i} — single 18° sector</li>
 *   <li>{@code V} — single 94° sector</li>
 *   <li>{@code L} — 18° + 80° at 90° apart</li>
 *   <li>{@code I} — 18° at 0° + 18° at 180° (complementary pair)</li>
 *   <li>{@code T} — single 180° sector (half wheel)</li>
 *   <li>{@code Y} — 18° at 0° + 94° at 180°</li>
 *   <li>{@code X} — 94° at 0° + 94° at 180°</li>
 *   <li>{@code N} — no constraint (identity)</li>
 * </ul>
 *
 * <p>Parameters:</p>
 * <ul>
 *   <li>{@code template} (string, default {@code "I"}) — see list above.</li>
 *   <li>{@code offsetDeg} (default 0.0, range [0, 360]) — rotation of the
 *       template on the hue wheel.</li>
 * </ul>
 */
@Component
public class HarmonizationAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "harmonization";

    /** Hue band: centre and full angular width, both in degrees. */
    private record Band(double centerDeg, double widthDeg) {}

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        String template  = ParamUtils.getString(params, "template", "I");
        double offsetDeg = ParamUtils.getDouble(params, "offsetDeg", 0.0);
        return applyCore(bgr, template, offsetDeg);
    }

    public static Mat applyCore(Mat bgr, String template, double offsetDeg) {
        if (bgr.channels() != 3) {
            throw new IllegalArgumentException("harmonization requires a 3-channel BGR image");
        }
        Band[] bands = templateBands(template, offsetDeg);
        if (bands.length == 0) {
            // 'N' — no constraint; copy and return.
            Mat out = new Mat();
            bgr.copyTo(out);
            return out;
        }

        Mat hsv = new Mat();
        opencv_imgproc.cvtColor(bgr, hsv, opencv_imgproc.COLOR_BGR2HSV);

        int rows = hsv.rows();
        int cols = hsv.cols();
        UByteIndexer idx = hsv.createIndexer();
        int[] px = new int[3];
        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                idx.get(y, x, px);
                double hueDeg = px[0] * 2.0;       // OpenCV H in [0, 179] → degrees [0, 358]
                double sat    = px[1] / 255.0;
                double val    = px[2] / 255.0;
                double weight = sat * val;          // skip near-neutral pixels
                if (weight < 0.05) continue;

                double targetDeg = nearestHueInTemplate(hueDeg, bands);
                double newHueDeg = lerpHueDeg(hueDeg, targetDeg, weight);
                int newH = (int) Math.round(newHueDeg / 2.0) % 180;
                if (newH < 0) newH += 180;
                px[0] = newH;
                idx.put(y, x, px);
            }
        }
        idx.release();

        Mat out = new Mat();
        opencv_imgproc.cvtColor(hsv, out, opencv_imgproc.COLOR_HSV2BGR);
        hsv.release();
        return out;
    }

    // -------------------------------------------------------------------------
    // Template bands & hue arithmetic
    // -------------------------------------------------------------------------

    private static Band[] templateBands(String template, double offsetDeg) {
        if (template == null) template = "I";
        return switch (template.trim()) {
            case "i" -> new Band[] { new Band(offsetDeg, 18.0) };
            case "V" -> new Band[] { new Band(offsetDeg, 94.0) };
            case "L" -> new Band[] {
                    new Band(offsetDeg, 18.0),
                    new Band(offsetDeg + 90.0, 80.0)
            };
            case "I" -> new Band[] {
                    new Band(offsetDeg, 18.0),
                    new Band(offsetDeg + 180.0, 18.0)
            };
            case "T" -> new Band[] { new Band(offsetDeg, 180.0) };
            case "Y" -> new Band[] {
                    new Band(offsetDeg, 18.0),
                    new Band(offsetDeg + 180.0, 94.0)
            };
            case "X" -> new Band[] {
                    new Band(offsetDeg, 94.0),
                    new Band(offsetDeg + 180.0, 94.0)
            };
            case "N" -> new Band[0];
            default  -> new Band[] { new Band(offsetDeg, 18.0), new Band(offsetDeg + 180.0, 18.0) };
        };
    }

    /**
     * Nearest in-template hue to {@code h}. If {@code h} already falls inside a
     * band, returns {@code h}; otherwise returns the closer band edge.
     */
    private static double nearestHueInTemplate(double h, Band[] bands) {
        double best = bands[0].centerDeg();
        double bestDist = Double.POSITIVE_INFINITY;
        for (Band b : bands) {
            double half = b.widthDeg() / 2.0;
            double d = circularDelta(h, b.centerDeg());
            if (Math.abs(d) <= half) return h;     // inside band — leave alone
            // Closest edge candidate.
            double edge = b.centerDeg() + Math.signum(d) * half;
            double distToEdge = Math.abs(circularDelta(h, edge));
            if (distToEdge < bestDist) {
                bestDist = distToEdge;
                best = edge;
            }
        }
        return best;
    }

    /** Linearly interpolate between two hue angles along the shorter arc. */
    private static double lerpHueDeg(double from, double to, double t) {
        double d = circularDelta(to, from);
        return wrap360(from + d * t);
    }

    /** Signed shortest-arc delta from {@code a} to {@code b}, in (-180, 180]. */
    private static double circularDelta(double b, double a) {
        double d = ((b - a) % 360.0 + 540.0) % 360.0 - 180.0;
        return d == -180.0 ? 180.0 : d;
    }

    private static double wrap360(double d) {
        double r = d % 360.0;
        return r < 0 ? r + 360.0 : r;
    }
}
