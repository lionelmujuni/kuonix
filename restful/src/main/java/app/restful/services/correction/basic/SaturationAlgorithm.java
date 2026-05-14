package app.restful.services.correction.basic;

import java.util.Map;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * HSV saturation scaling. factor=1.0 is identity, &gt;1 vivid, &lt;1 muted.
 */
@Component
public class SaturationAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "saturation";

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double factor = ParamUtils.getDouble(params, "factor", 1.2);
        return applyCore(bgr, factor);
    }

    public static Mat applyCore(Mat bgr, double factor) {
        Mat hsv = new Mat();
        opencv_imgproc.cvtColor(bgr, hsv, opencv_imgproc.COLOR_BGR2HSV);

        MatVector channels = new MatVector(3);
        opencv_core.split(hsv, channels);

        Mat s = channels.get(1).clone();
        s.convertTo(s, -1, factor, 0.0);

        MatVector merged = new MatVector(channels.get(0), s, channels.get(2));
        opencv_core.merge(merged, hsv);

        Mat result = new Mat();
        opencv_imgproc.cvtColor(hsv, result, opencv_imgproc.COLOR_HSV2BGR);

        channels.close();
        s.release();
        merged.close();
        hsv.release();

        return result;
    }
}
