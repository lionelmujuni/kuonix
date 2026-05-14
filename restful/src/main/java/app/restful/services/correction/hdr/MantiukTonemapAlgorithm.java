package app.restful.services.correction.hdr;

import java.util.Map;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_photo;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_photo.TonemapMantiuk;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Perceptual tone mapping (Mantiuk et al., 2008) — wraps OpenCV's
 * {@code cv::TonemapMantiuk}.
 *
 * <p>Compresses dynamic range while preserving local contrast per the human
 * visual system's contrast sensitivity function. It consistently scores well
 * in TMO comparisons and tends to be a strong all-round operator on
 * mixed-luminance scenes.</p>
 *
 * <p>Single-image use: the input LDR image is treated as already gamma-encoded;
 * we apply an inverse-gamma to expand its effective dynamic range, run the
 * Mantiuk operator, and re-encode to 8-bit. Not a substitute for a true
 * HDR bracket, but a useful single-frame compressor for harsh-light scenes.</p>
 *
 * <p>Parameters:</p>
 * <ul>
 *   <li>{@code saturation} (default 1.0, range [0.0, 2.0]) — colour saturation
 *       of the tonemapped output.</li>
 *   <li>{@code contrastScale} (default 0.75, range [0.1, 1.0]) — global contrast
 *       compression factor. Lower = stronger compression.</li>
 * </ul>
 */
@Component
public class MantiukTonemapAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "mantiuk_tonemap";

    /** Inverse-gamma applied to LDR input to give the operator some dynamic range to work with. */
    private static final float INVERSE_GAMMA = 2.2f;

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double saturation    = ParamUtils.getDouble(params, "saturation",    1.0);
        double contrastScale = ParamUtils.getDouble(params, "contrastScale", 0.75);
        return applyCore(bgr, saturation, contrastScale);
    }

    public static Mat applyCore(Mat bgr, double saturation, double contrastScale) {
        if (bgr.channels() != 3) {
            throw new IllegalArgumentException("mantiuk_tonemap requires a 3-channel BGR image");
        }
        // BGR8U → linear-light BGR32F via inverse gamma.
        Mat bgrLinear = new Mat();
        Mat bgrF = new Mat();
        bgr.convertTo(bgrF, opencv_core.CV_32F, 1.0 / 255.0, 0.0);
        opencv_core.pow(bgrF, INVERSE_GAMMA, bgrLinear);
        bgrF.release();

        TonemapMantiuk tm = opencv_photo.createTonemapMantiuk(
                /* gamma      */ 1.0f,
                /* scale      */ (float) contrastScale,
                /* saturation */ (float) saturation);
        Mat tonemapped = new Mat();
        tm.process(bgrLinear, tonemapped);
        bgrLinear.release();
        tm.close();

        // Tonemap returns [0, 1] CV_32F. Convert to 8U.
        Mat out = new Mat();
        tonemapped.convertTo(out, opencv_core.CV_8U, 255.0, 0.0);
        tonemapped.release();
        return out;
    }
}
