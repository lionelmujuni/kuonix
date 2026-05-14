package app.restful.services.correction.primitives;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Size;

/**
 * Guided Image Filter (He, Sun, Tang — ECCV 2010 / IEEE TPAMI 2013).
 *
 * <p>Edge-aware O(N) smoothing driven by a guidance image {@code I}. Under
 * self-guidance ({@code I = p}) it preserves edges sharper than a plain box
 * filter and avoids the halo artefacts of bilateral filtering near strong
 * gradients. Used as a primitive by MSRCR Retinex, Dark-Channel Dehaze,
 * Local Laplacian, and detail layer decomposition.</p>
 *
 * <p>All entry points return a {@code CV_32F} {@link Mat} in the same value
 * range as the input (e.g. [0, 255] for {@code CV_8U} input). Inputs are not
 * mutated; the caller owns {@code release()} on the returned Mat.</p>
 *
 * <p>Multi-channel colour guidance (3×3 per-pixel covariance) is out of scope
 * here; use a luminance channel as the guide for colour processing, or call
 * {@link #filter3(Mat, Mat, int, double)}.</p>
 */
public final class GuidedFilter {

    private GuidedFilter() {}

    /**
     * Self-guided filter ({@code I = p}). Convenience for the most common
     * case: denoise / detail-separate an image using itself as the guide.
     */
    public static Mat filterSelf(Mat src, int radius, double eps) {
        Mat f = toFloat(src);
        Mat q = core(f, f, radius, eps);
        f.release();
        return q;
    }

    /**
     * Guided filter on single-channel images. Neither input is mutated.
     *
     * @param guide  guidance image (single channel). Drives edge behaviour.
     * @param src    input to filter (single channel). Same size as guide.
     * @param radius box-filter half-window; window is (2r+1)×(2r+1).
     * @param eps    regularization. Small eps → stronger edge preservation.
     *               Work in the same units as the image: e.g. {@code (6.0 * 255.0)^2 / 255.0^2}
     *               ≈ 0.0014 for [0, 1] range; pass {@code eps * 255^2} for [0, 255].
     */
    public static Mat filter(Mat guide, Mat src, int radius, double eps) {
        Mat g = toFloat(guide);
        Mat p = toFloat(src);
        Mat q = core(g, p, radius, eps);
        g.release();
        p.release();
        return q;
    }

    /**
     * Apply the guided filter to each channel of a 3-channel source, all
     * driven by the same single-channel guide. Returns a new 3-channel
     * {@code CV_32F} Mat.
     */
    public static Mat filter3(Mat guide1, Mat src3, int radius, double eps) {
        if (src3.channels() != 3) {
            throw new IllegalArgumentException("filter3 requires a 3-channel source");
        }
        Mat g = toFloat(guide1);

        MatVector channels = new MatVector(3);
        opencv_core.split(src3, channels);

        Mat q0 = channelFilter(g, channels.get(0), radius, eps);
        Mat q1 = channelFilter(g, channels.get(1), radius, eps);
        Mat q2 = channelFilter(g, channels.get(2), radius, eps);

        MatVector merged = new MatVector(q0, q1, q2);
        Mat out = new Mat();
        opencv_core.merge(merged, out);

        q0.release(); q1.release(); q2.release();
        merged.close();
        channels.close();
        g.release();

        return out;
    }

    // -------------------------------------------------------------------------
    // Implementation.
    // -------------------------------------------------------------------------

    private static Mat channelFilter(Mat guideF, Mat channel, int radius, double eps) {
        Mat p = toFloat(channel);
        Mat q = core(guideF, p, radius, eps);
        p.release();
        return q;
    }

    /**
     * Core 11-step recurrence from the He/Sun/Tang paper. Both inputs must
     * be CV_32F single channel of identical size.
     */
    private static Mat core(Mat I, Mat p, int radius, double eps) {
        Size k = new Size(2 * radius + 1, 2 * radius + 1);

        Mat meanI = new Mat();  opencv_imgproc.boxFilter(I, meanI, -1, k);
        Mat meanP = new Mat();  opencv_imgproc.boxFilter(p, meanP, -1, k);

        Mat II = new Mat();     opencv_core.multiply(I, I, II);
        Mat IP = new Mat();     opencv_core.multiply(I, p, IP);

        Mat corrI  = new Mat(); opencv_imgproc.boxFilter(II, corrI,  -1, k);
        Mat corrIP = new Mat(); opencv_imgproc.boxFilter(IP, corrIP, -1, k);

        Mat meanI2 = new Mat(); opencv_core.multiply(meanI, meanI, meanI2);
        Mat varI   = new Mat(); opencv_core.subtract(corrI, meanI2, varI);

        // varI += eps (convertTo: alpha=1, beta=eps)
        Mat varIe = new Mat();  varI.convertTo(varIe, -1, 1.0, eps);

        Mat meanIP = new Mat(); opencv_core.multiply(meanI, meanP, meanIP);
        Mat covIP  = new Mat(); opencv_core.subtract(corrIP, meanIP, covIP);

        Mat a = new Mat();      opencv_core.divide(covIP, varIe, a);

        Mat aMeanI = new Mat(); opencv_core.multiply(a, meanI, aMeanI);
        Mat b = new Mat();      opencv_core.subtract(meanP, aMeanI, b);

        Mat meanA = new Mat();  opencv_imgproc.boxFilter(a, meanA, -1, k);
        Mat meanB = new Mat();  opencv_imgproc.boxFilter(b, meanB, -1, k);

        Mat aMI = new Mat();    opencv_core.multiply(meanA, I, aMI);
        Mat q = new Mat();      opencv_core.add(aMI, meanB, q);

        meanI.release(); meanP.release();
        II.release();    IP.release();
        corrI.release(); corrIP.release();
        meanI2.release(); varI.release(); varIe.release();
        meanIP.release(); covIP.release();
        a.release();      aMeanI.release(); b.release();
        meanA.release(); meanB.release(); aMI.release();
        k.close();

        return q;
    }

    /**
     * Convert any depth to CV_32F, preserving value range. 8-bit stays in
     * [0, 255], 16-bit stays in [0, 65535], floats pass through.
     */
    private static Mat toFloat(Mat m) {
        Mat f = new Mat();
        m.convertTo(f, opencv_core.CV_32F);
        return f;
    }
}
