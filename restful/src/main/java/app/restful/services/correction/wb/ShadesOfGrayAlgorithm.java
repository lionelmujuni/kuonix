package app.restful.services.correction.wb;

import java.util.Map;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Shades of Gray white balance using the Minkowski p-norm.
 * p=1 reduces to Gray World; p→∞ approaches White Patch. p=6 recommended.
 *
 * Reference: Finlayson, G., Trezzi, E. "Shades of Gray and Colour Constancy."
 * CIC, 2004.
 */
@Component
public class ShadesOfGrayAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "shades_of_gray";

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double p = ParamUtils.getDouble(params, "p", 6.0);
        return applyCore(bgr, p);
    }

    public static Mat applyCore(Mat bgr, double p) {
        MatVector channels = new MatVector(3);
        opencv_core.split(bgr, channels);

        double normB = computeMinkowskiNorm(channels.get(0), p);
        double normG = computeMinkowskiNorm(channels.get(1), p);
        double normR = computeMinkowskiNorm(channels.get(2), p);

        double overallNorm = (normB + normG + normR) / 3.0;

        double gainB = overallNorm / (normB + 1e-8);
        double gainG = overallNorm / (normG + 1e-8);
        double gainR = overallNorm / (normR + 1e-8);

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

    private static double computeMinkowskiNorm(Mat channel, double p) {
        Mat channelFloat = new Mat();
        channel.convertTo(channelFloat, opencv_core.CV_32F);

        Mat powered = new Mat();
        opencv_core.pow(channelFloat, p, powered);

        Scalar sum = opencv_core.sumElems(powered);
        double total = sum.get(0);

        int numPixels = channel.rows() * channel.cols();
        double norm = Math.pow(total / numPixels, 1.0 / p);

        channelFloat.release();
        powered.release();

        return norm;
    }
}
