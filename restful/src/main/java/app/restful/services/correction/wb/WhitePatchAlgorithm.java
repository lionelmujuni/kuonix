package app.restful.services.correction.wb;

import java.util.Map;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;

/**
 * White Patch (Max RGB) white balance. Assumes the brightest patch is
 * achromatic; scales channels so maxima align.
 *
 * Reference: Land, E. H., McCann, J. J. "Lightness and retinex theory."
 * JOSA, 1971.
 */
@Component
public class WhitePatchAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "white_patch";

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        return applyCore(bgr);
    }

    public static Mat applyCore(Mat bgr) {
        MatVector channels = new MatVector(3);
        opencv_core.split(bgr, channels);

        double[] minVal  = new double[1];
        double[] maxValB = new double[1];
        double[] maxValG = new double[1];
        double[] maxValR = new double[1];

        opencv_core.minMaxLoc(channels.get(0), minVal, maxValB, null, null, null);
        opencv_core.minMaxLoc(channels.get(1), minVal, maxValG, null, null, null);
        opencv_core.minMaxLoc(channels.get(2), minVal, maxValR, null, null, null);

        double maxVal = Math.max(Math.max(maxValB[0], maxValG[0]), maxValR[0]);

        double gainB = maxVal / (maxValB[0] + 1e-8);
        double gainG = maxVal / (maxValG[0] + 1e-8);
        double gainR = maxVal / (maxValR[0] + 1e-8);

        Mat channelB = channels.get(0).clone();
        Mat channelG = channels.get(1).clone();
        Mat channelR = channels.get(2).clone();

        channelB.convertTo(channelB, -1, gainB, 0.0);
        channelG.convertTo(channelG, -1, gainG, 0.0);
        channelR.convertTo(channelR, -1, gainR, 0.0);

        Mat result = new Mat();
        MatVector corrected = new MatVector(channelB, channelG, channelR);
        opencv_core.merge(corrected, result);

        channels.close();
        channelB.release();
        channelG.release();
        channelR.release();
        corrected.close();

        return result;
    }
}
