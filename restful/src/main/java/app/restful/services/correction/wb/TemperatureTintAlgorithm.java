package app.restful.services.correction.wb;

import java.util.Map;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Manual white balance using colour temperature (Kelvin) and green/magenta tint.
 * Kelvin → RGB via a Planckian locus polynomial approximation, normalised so
 * the brightest channel stays at 1.0.
 */
@Component
public class TemperatureTintAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "temperature_tint";

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double tempK = ParamUtils.getDouble(params, "tempK", 5500.0);
        double tint  = ParamUtils.getDouble(params, "tint", 0.0);
        return applyCore(bgr, tempK, tint);
    }

    public static Mat applyCore(Mat bgr, double tempK, double tint) {
        tempK = Math.max(1000, Math.min(20000, tempK));
        tint  = Math.max(-1.0, Math.min(1.0, tint));

        double t = tempK / 100.0;
        double r, g, b;

        if (t <= 66) {
            r = 255;
        } else {
            r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
        }

        if (t <= 66) {
            g = 99.4708025861 * Math.log(t) - 161.1195681661;
        } else {
            g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
        }

        if (t >= 66) {
            b = 255;
        } else if (t <= 19) {
            b = 0;
        } else {
            b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
        }

        double rGain = Math.max(0.01, Math.min(255, r)) / 255.0;
        double gGain = Math.max(0.01, Math.min(255, g)) / 255.0;
        double bGain = Math.max(0.01, Math.min(255, b)) / 255.0;

        double tintShift = tint * 0.25;
        gGain = Math.max(0.01, gGain + tintShift);
        rGain = Math.max(0.01, rGain - tintShift * 0.5);
        bGain = Math.max(0.01, bGain - tintShift * 0.5);

        double maxGain = Math.max(rGain, Math.max(gGain, bGain));
        rGain /= maxGain;
        gGain /= maxGain;
        bGain /= maxGain;

        MatVector channels = new MatVector(3);
        opencv_core.split(bgr, channels);

        Mat bCh = new Mat();
        Mat gCh = new Mat();
        Mat rCh = new Mat();
        channels.get(0).convertTo(bCh, -1, bGain, 0);
        channels.get(1).convertTo(gCh, -1, gGain, 0);
        channels.get(2).convertTo(rCh, -1, rGain, 0);

        Mat result = new Mat();
        MatVector merged = new MatVector(bCh, gCh, rCh);
        opencv_core.merge(merged, result);

        channels.close();
        bCh.release();
        gCh.release();
        rCh.release();
        merged.close();

        return result;
    }
}
