package app.restful.services.correction.primitives;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.bytedeco.opencv.opencv_core.Size;

/**
 * Soft skin-probability mask from a BGR image.
 *
 * <p>Combines two colour-space heuristics — HSV hue-range gating and YCrCb
 * chroma ellipse — into a single [0, 1] float mask. The result is smoothed
 * with a small Gaussian so downstream users (vibrance skin protection,
 * memory-colour skin correction) get soft transitions without binary
 * hard-edge artefacts.</p>
 *
 * <p>Not a detector — it won't know where a face is. It labels every pixel
 * whose colour falls in the broad skin manifold. That's exactly what
 * per-pixel protection and memory-colour correction need.</p>
 *
 * <p>References: Vezhnevets et al., "A Survey on Pixel-Based Skin Color
 * Detection Techniques", GraphiCon 2003; Hsu/Abdel-Mottaleb/Jain, "Face
 * Detection in Color Images", IEEE TPAMI 2002 (YCrCb ellipse).</p>
 */
public final class SkinMask {

    // HSV range (OpenCV: H in [0,179], S,V in [0,255]).
    private static final int HSV_HUE_LOW   = 0;
    private static final int HSV_HUE_HIGH  = 25;
    private static final int HSV_HUE_WRAP_LOW = 160;
    private static final int HSV_SAT_MIN   = 30;
    private static final int HSV_SAT_MAX   = 180;
    private static final int HSV_VAL_MIN   = 40;

    // YCrCb rectangle (widely used; Hsu et al.).
    private static final int YCC_CR_MIN = 133;
    private static final int YCC_CR_MAX = 173;
    private static final int YCC_CB_MIN = 77;
    private static final int YCC_CB_MAX = 127;

    private SkinMask() {}

    /**
     * Compute a soft [0, 1] skin-probability mask.
     *
     * @param bgr         CV_8UC3 source image
     * @param blurRadius  post-threshold Gaussian radius in pixels.
     *                    Set 0 to skip smoothing; typical 5–15 for portraits.
     * @return CV_32FC1 mask in [0, 1], same size as source.
     */
    public static Mat compute(Mat bgr, int blurRadius) {
        if (bgr.channels() != 3) {
            throw new IllegalArgumentException("SkinMask requires a 3-channel BGR image");
        }

        // HSV pass — two hue ranges unioned (red wraps around 0/180).
        // JavaCPP only exposes the Mat-bounded inRange overload, so the bounds
        // must be the same size as the source — a 1×1 bound silently yields a
        // zero mask.
        Mat hsv = new Mat();
        opencv_imgproc.cvtColor(bgr, hsv, opencv_imgproc.COLOR_BGR2HSV);
        Mat hsvLow = new Mat();
        Mat hsvLowLower  = sameSizeScalar(hsv, HSV_HUE_LOW,      HSV_SAT_MIN, HSV_VAL_MIN);
        Mat hsvLowUpper  = sameSizeScalar(hsv, HSV_HUE_HIGH,     HSV_SAT_MAX, 255.0);
        opencv_core.inRange(hsv, hsvLowLower, hsvLowUpper, hsvLow);
        hsvLowLower.release(); hsvLowUpper.release();
        Mat hsvHigh = new Mat();
        Mat hsvHighLower = sameSizeScalar(hsv, HSV_HUE_WRAP_LOW, HSV_SAT_MIN, HSV_VAL_MIN);
        Mat hsvHighUpper = sameSizeScalar(hsv, 179.0,            HSV_SAT_MAX, 255.0);
        opencv_core.inRange(hsv, hsvHighLower, hsvHighUpper, hsvHigh);
        hsvHighLower.release(); hsvHighUpper.release();
        Mat hsvMask = new Mat();
        opencv_core.bitwise_or(hsvLow, hsvHigh, hsvMask);
        hsvLow.release(); hsvHigh.release(); hsv.release();

        // YCrCb pass — Cr in [133,173], Cb in [77,127].
        Mat ycc = new Mat();
        opencv_imgproc.cvtColor(bgr, ycc, opencv_imgproc.COLOR_BGR2YCrCb);
        Mat yccMask = new Mat();
        Mat yccLower = sameSizeScalar(ycc, 0.0,   YCC_CR_MIN, YCC_CB_MIN);
        Mat yccUpper = sameSizeScalar(ycc, 255.0, YCC_CR_MAX, YCC_CB_MAX);
        opencv_core.inRange(ycc, yccLower, yccUpper, yccMask);
        yccLower.release(); yccUpper.release();
        ycc.release();

        // Intersection: pixel must satisfy both models (high precision).
        Mat combined = new Mat();
        opencv_core.bitwise_and(hsvMask, yccMask, combined);
        hsvMask.release(); yccMask.release();

        // To CV_32F in [0, 1].
        Mat mask = new Mat();
        combined.convertTo(mask, opencv_core.CV_32F, 1.0 / 255.0, 0.0);
        combined.release();

        // Soften edges.
        if (blurRadius > 0) {
            int k = 2 * blurRadius + 1;
            Size ksize = new Size(k, k);
            double sigma = Math.max(1.0, blurRadius / 2.0);
            Mat blurred = new Mat();
            opencv_imgproc.GaussianBlur(mask, blurred, ksize, sigma, sigma, opencv_core.BORDER_REFLECT);
            ksize.close();
            mask.release();
            mask = blurred;
        }
        return mask;
    }

    /** Same-size, same-type Mat filled with the given 3-channel scalar. */
    private static Mat sameSizeScalar(Mat ref, double c0, double c1, double c2) {
        return new Mat(ref.size(), ref.type(), new Scalar(c0, c1, c2, 0.0));
    }

    /**
     * Replicate a single-channel mask to three channels. Useful for applying
     * a mask as a per-pixel blend weight against a 3-channel correction:
     * {@code out = mask3 * corrected + (1 - mask3) * original}.
     */
    public static Mat toThreeChannel(Mat mask1) {
        MatVector vec = new MatVector(mask1, mask1, mask1);
        Mat out = new Mat();
        opencv_core.merge(vec, out);
        vec.close();
        return out;
    }
}
