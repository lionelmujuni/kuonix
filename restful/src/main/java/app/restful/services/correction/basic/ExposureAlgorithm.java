package app.restful.services.correction.basic;

import java.util.Map;

import org.bytedeco.opencv.opencv_core.Mat;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Exposure: uniform gain across all channels. gain=1.0 is identity.
 */
@Component
public class ExposureAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "exposure";

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double gain = ParamUtils.getDouble(params, "gain", 1.0);
        return applyCore(bgr, gain);
    }

    public static Mat applyCore(Mat bgr, double gain) {
        Mat result = new Mat();
        bgr.convertTo(result, -1, gain, 0.0);
        return result;
    }
}
