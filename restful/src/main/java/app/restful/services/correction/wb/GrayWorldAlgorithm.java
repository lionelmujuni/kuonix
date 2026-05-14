package app.restful.services.correction.wb;

import java.util.Map;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;

/**
 * Gray World white balance. Assumes scene average is achromatic; scales per
 * channel so channel means equalize.
 *
 * Reference: Buchsbaum, G. "A spatial processor model for object colour
 * perception." Journal of the Franklin Institute, 1980.
 */
@Component
public class GrayWorldAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "gray_world";

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        return applyCore(bgr);
    }

    public static Mat applyCore(Mat bgr) {
        MatVector channels = new MatVector(3);
        opencv_core.split(bgr, channels);

        Scalar meanB = opencv_core.mean(channels.get(0));
        Scalar meanG = opencv_core.mean(channels.get(1));
        Scalar meanR = opencv_core.mean(channels.get(2));

        double avgB = meanB.get(0);
        double avgG = meanG.get(0);
        double avgR = meanR.get(0);

        double grayMean = (avgB + avgG + avgR) / 3.0;

        double gainB = grayMean / (avgB + 1e-8);
        double gainG = grayMean / (avgG + 1e-8);
        double gainR = grayMean / (avgR + 1e-8);

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
