package app.restful.services.correction.primitives;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Size;

/**
 * Estimates per-pixel scene illumination from a BGR image.
 *
 * <p>Two strategies are exposed:
 * <ul>
 *   <li>{@link #estimateGaussian} — classic multi-scale Retinex approach;
 *       fast, but produces halos near strong edges.</li>
 *   <li>{@link #estimateGuided} — edge-aware estimate via {@link GuidedFilter}
 *       on the HSV V-channel guide; used by LIME-style low-light methods.</li>
 * </ul>
 *
 * <p>All methods return a new {@code CV_32F} 3-channel Mat in the same
 * value range as the input (i.e. [0, 255] for CV_8U input). Neither input
 * is mutated; callers own {@code release()} on the returned Mat.</p>
 */
public final class IlluminationEstimator {

    private IlluminationEstimator() {}

    /**
     * Gaussian illumination estimate. Used by MSRCR Retinex for each scale.
     *
     * @param bgr   CV_8U or CV_32F BGR source image
     * @param sigma Gaussian sigma (controls the illumination smoothing scale)
     * @return CV_32F 3-channel illumination map in [0, 255] range
     */
    public static Mat estimateGaussian(Mat bgr, double sigma) {
        Mat bgrF = new Mat();
        bgr.convertTo(bgrF, opencv_core.CV_32F);

        int k = kernelSize(sigma);
        Size ksize = new Size(k, k);
        Mat blurred = new Mat();
        opencv_imgproc.GaussianBlur(bgrF, blurred, ksize, sigma, sigma,
                opencv_core.BORDER_REFLECT);
        ksize.close();
        bgrF.release();

        return blurred;
    }

    /**
     * Edge-aware illumination estimate driven by the HSV V-channel.
     * Uses {@link GuidedFilter} to produce a smooth illumination map that
     * respects object boundaries — sharper than a Gaussian near edges.
     *
     * @param bgr    CV_8U BGR source image
     * @param radius guided filter radius
     * @param eps    guided filter regularisation, e.g. {@code 0.01 * 255 * 255}
     * @return CV_32F 3-channel illumination map in [0, 255] range
     */
    public static Mat estimateGuided(Mat bgr, int radius, double eps) {
        Mat hsv = new Mat();
        opencv_imgproc.cvtColor(bgr, hsv, opencv_imgproc.COLOR_BGR2HSV);

        MatVector ch = new MatVector(3);
        opencv_core.split(hsv, ch);
        Mat luminance = ch.get(2);

        Mat illumination = GuidedFilter.filter3(luminance, bgr, radius, eps);

        ch.close();
        hsv.release();

        return illumination;
    }

    // Kernel size must be positive and odd. 6σ rule-of-thumb.
    private static int kernelSize(double sigma) {
        int k = (int) Math.ceil(6.0 * sigma);
        if (k < 1) k = 1;
        if (k % 2 == 0) k++;
        return k;
    }
}
