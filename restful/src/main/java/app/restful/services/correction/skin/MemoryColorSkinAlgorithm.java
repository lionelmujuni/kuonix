package app.restful.services.correction.skin;

import java.util.Map;

import org.bytedeco.javacpp.indexer.FloatIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;
import app.restful.services.correction.primitives.SkinMask;

/**
 * Memory-colour skin correction in CIE L*C*h°.
 *
 * <p>Uses {@link SkinMask} to identify skin pixels, then shifts their chroma
 * vector (a*, b*) toward a preferred "memory-colour" centroid — without
 * touching luminance. The shift is blended by the soft mask so non-skin
 * pixels are untouched.</p>
 *
 * <p>Why L*C*h° — a, b shift direction encodes both saturation (C) and hue
 * (h°); moving skin toward a fixed (a*, b*) target is equivalent to setting
 * a preferred chroma/hue. Reference skin for preferred rendering (Hunt /
 * CIE TC 8-08) is approximately L*=68, a*=18, b*=22 for mid-tone Caucasian
 * skin. The default {@code targetLch} of {@code "68,28,38"} matches the
 * existing knowledge graph entry; values are converted here from L*C*h° to
 * Lab on load.</p>
 *
 * <p>Parameters:</p>
 * <ul>
 *   <li>{@code adaptationStrength} (default 0.6, range [0, 1]) — how far
 *       to pull skin chroma toward the target. 0 = no change, 1 = full snap.</li>
 *   <li>{@code targetLch} — CSV {@code "L,C,h"} where h is in degrees.
 *       Only the chroma vector (C, h) is used; L is ignored (luminance preserved).</li>
 * </ul>
 */
@Component
public class MemoryColorSkinAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "memory_color_skin";

    // OpenCV Lab for CV_8U encodes:
    //   L* in [0, 255]  (scale factor 255/100)
    //   a* in [0, 255]  (offset +128, so a*∈[-128,+127])
    //   b* in [0, 255]  (offset +128)
    // We do arithmetic in CV_32F where OpenCV emits L∈[0,100], a/b∈[-128,+127] natively.

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double strength = ParamUtils.getDouble(params, "adaptationStrength", 0.6);
        String targetStr = ParamUtils.getString(params, "targetLch", "68,28,38");
        double[] lch = parseLch(targetStr);
        double targetA = lch[1] * Math.cos(Math.toRadians(lch[2]));
        double targetB = lch[1] * Math.sin(Math.toRadians(lch[2]));
        return applyCore(bgr, strength, targetA, targetB);
    }

    public static Mat applyCore(Mat bgr, double strength, double targetA, double targetB) {
        strength = Math.max(0.0, Math.min(1.0, strength));

        // Soft skin mask in [0, 1] — blur enough to feather transitions.
        Mat mask1 = SkinMask.compute(bgr, 9);

        // Convert BGR → Lab (float; OpenCV native Lab units).
        Mat bgrF = new Mat();
        bgr.convertTo(bgrF, opencv_core.CV_32F, 1.0 / 255.0, 0.0);
        Mat lab = new Mat();
        opencv_imgproc.cvtColor(bgrF, lab, opencv_imgproc.COLOR_BGR2Lab);
        bgrF.release();

        int rows = lab.rows();
        int cols = lab.cols();
        FloatIndexer labIdx = lab.createIndexer();
        FloatIndexer mIdx   = mask1.createIndexer();
        float[] px = new float[3];

        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                float w = mIdx.get(y, x);
                if (w < 1e-3f) continue;
                double t = w * strength;                   // effective pull for this pixel
                labIdx.get(y, x, px);
                // px = [L, a, b]. Move a,b toward target; leave L alone.
                px[1] = (float) (px[1] + t * (targetA - px[1]));
                px[2] = (float) (px[2] + t * (targetB - px[2]));
                labIdx.put(y, x, px);
            }
        }
        labIdx.release();
        mIdx.release();
        mask1.release();

        // Lab (float) → BGR (float) → 8U.
        Mat bgrOutF = new Mat();
        opencv_imgproc.cvtColor(lab, bgrOutF, opencv_imgproc.COLOR_Lab2BGR);
        lab.release();
        Mat out = new Mat();
        bgrOutF.convertTo(out, opencv_core.CV_8U, 255.0, 0.0);
        bgrOutF.release();
        return out;
    }

    /** Parses "L,C,h" in degrees. Falls back to the knowledge-graph default. */
    private static double[] parseLch(String s) {
        String[] parts = s.split(",");
        double[] fallback = { 68.0, 28.0, 38.0 };
        if (parts.length < 3) return fallback;
        double[] out = new double[3];
        for (int i = 0; i < 3; i++) {
            try {
                out[i] = Double.parseDouble(parts[i].trim());
            } catch (NumberFormatException e) {
                out[i] = fallback[i];
            }
        }
        return out;
    }
}
