package app.restful.services.correction.denoise;

import java.util.Map;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.global.opencv_xphoto;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Size;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * BM3D denoiser wrapping OpenCV's {@code xphoto::bm3dDenoising}.
 *
 * <p>Block-Matching 3D Filtering (Dabov et al., 2007) groups similar image
 * patches into 3-D stacks, applies a transform-domain collaborative filter,
 * and reconstructs. It consistently outperforms NL-Means on natural images
 * at the cost of higher runtime ({@code cost: high} in the knowledge graph).
 * </p>
 *
 * <p>When {@code shadowMaskOnly=true} (the default), the denoised result is
 * blended back only over dark shadow areas identified by the HSV V-channel.
 * Well-lit regions that carry sharp natural texture are left untouched.
 * The shadow boundary is softened with a Gaussian-blurred mask.</p>
 *
 * <p>Reference: Dabov et al., "Image Denoising with Block-Matching and 3D
 * Filtering", SPIE Electronic Imaging 2006.</p>
 */
@Component
public class Bm3dAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "bm3d";

    /** V-channel threshold below which a pixel is considered shadow (0–255). */
    private static final int SHADOW_V_THRESHOLD = 80;

    /** Kernel size and sigma for softening the shadow mask boundary. */
    private static final int    SHADOW_MASK_BLUR       = 21;
    private static final double SHADOW_MASK_BLUR_SIGMA = 7.0;

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double  sigma      = ParamUtils.getDouble(params,  "sigma",          15.0);
        boolean shadowOnly = ParamUtils.getBoolean(params, "shadowMaskOnly", true);
        return applyCore(bgr, (float) sigma, shadowOnly);
    }

    public static Mat applyCore(Mat bgr, float sigma, boolean shadowMaskOnly) {
        if (sigma < 1f)   sigma = 1f;
        if (sigma > 100f) sigma = 100f;

        // xphoto::bm3dDenoising only supports single-channel 8U — split, denoise each, merge.
        // JavaCPP only exposes the fully-parameterised overload; pass OpenCV defaults.
        MatVector channels = new MatVector(3);
        opencv_core.split(bgr, channels);
        Mat denoised = new Mat();
        MatVector denoisedChannels = new MatVector(3);
        for (int i = 0; i < 3; i++) {
            Mat ch = new Mat();
            opencv_xphoto.bm3dDenoising(
                    channels.get(i), ch, sigma,
                    /* templateWindowSize    */ 4,
                    /* searchWindowSize      */ 16,
                    /* blockMatchingStep1    */ 2500,
                    /* blockMatchingStep2    */ 400,
                    /* groupSize             */ 8,
                    /* slidingStep           */ 1,
                    /* beta                  */ 2.0f,
                    /* normType              */ opencv_core.NORM_L2,
                    /* step                  */ opencv_xphoto.BM3D_STEPALL,
                    /* transformType         */ opencv_xphoto.HAAR);
            denoisedChannels.put(i, ch);
        }
        opencv_core.merge(denoisedChannels, denoised);
        channels.close();
        denoisedChannels.close();

        if (!shadowMaskOnly) {
            return denoised;
        }

        // Shadow mask: CV_32F single-channel [0, 1] — 1.0 where denoising applies
        Mat maskF = buildShadowMask(bgr);

        // Blend in float: result = original + (denoised − original) × mask
        Mat bgrF      = new Mat();
        Mat denoisedF = new Mat();
        bgr.convertTo(bgrF,           opencv_core.CV_32F);
        denoised.convertTo(denoisedF, opencv_core.CV_32F);
        denoised.release();

        // Expand single-channel mask to 3 channels
        Mat mask3 = new Mat();
        MatVector maskVec = new MatVector(maskF, maskF, maskF);
        opencv_core.merge(maskVec, mask3);
        maskVec.close();
        maskF.release();

        // diff = (denoised − original) * mask
        Mat diff       = new Mat();
        Mat maskedDiff = new Mat();
        opencv_core.subtract(denoisedF, bgrF, diff);
        opencv_core.multiply(diff, mask3, maskedDiff);
        diff.release();
        mask3.release();

        Mat resultF = new Mat();
        opencv_core.add(bgrF, maskedDiff, resultF);
        bgrF.release();
        maskedDiff.release();
        denoisedF.release();

        Mat result = new Mat();
        resultF.convertTo(result, opencv_core.CV_8U);
        resultF.release();
        return result;
    }

    /**
     * Builds a soft float mask: 1.0 in dark shadow regions, 0.0 in bright
     * areas, with a Gaussian-blurred transition at the boundary.
     */
    private static Mat buildShadowMask(Mat bgr) {
        Mat hsv = new Mat();
        opencv_imgproc.cvtColor(bgr, hsv, opencv_imgproc.COLOR_BGR2HSV);

        MatVector ch = new MatVector(3);
        opencv_core.split(hsv, ch);
        Mat v = ch.get(2);  // V channel, CV_8U 0–255

        // Binary: dark pixels (V < threshold) → 255, bright → 0
        Mat mask8 = new Mat();
        opencv_imgproc.threshold(v, mask8, SHADOW_V_THRESHOLD, 255,
                opencv_imgproc.THRESH_BINARY_INV);

        // Soften the boundary
        Size ksize = new Size(SHADOW_MASK_BLUR, SHADOW_MASK_BLUR);
        opencv_imgproc.GaussianBlur(mask8, mask8, ksize, SHADOW_MASK_BLUR_SIGMA);
        ksize.close();

        // Scale to float [0, 1]
        Mat maskF = new Mat();
        mask8.convertTo(maskF, opencv_core.CV_32F, 1.0 / 255.0, 0.0);

        ch.close();
        hsv.release();
        mask8.release();

        return maskF;
    }
}
