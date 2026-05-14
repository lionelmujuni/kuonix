package app.restful.services.correction.contrast;

import java.util.Map;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Size;
import org.bytedeco.opencv.opencv_imgproc.CLAHE;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Contrast-Limited Adaptive Histogram Equalization on the L* channel of
 * CIELAB. Boosts local contrast without shifting chroma.
 *
 * Reference: Zuiderveld, K. "Contrast Limited Adaptive Histogram Equalization."
 * Graphics Gems IV, 1994.
 */
@Component
public class ClaheLabAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "clahe_lab";

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double clipLimit = ParamUtils.getDouble(params, "clipLimit", 2.0);
        int tileGrid     = (int) Math.round(ParamUtils.getDouble(params, "tileGrid", 8.0));
        if (tileGrid < 2) tileGrid = 2;
        if (tileGrid > 32) tileGrid = 32;
        return applyCore(bgr, clipLimit, tileGrid);
    }

    public static Mat applyCore(Mat bgr, double clipLimit, int tileGrid) {
        Mat lab = new Mat();
        opencv_imgproc.cvtColor(bgr, lab, opencv_imgproc.COLOR_BGR2Lab);

        MatVector channels = new MatVector(3);
        opencv_core.split(lab, channels);

        Mat l = channels.get(0);
        Mat lEq = new Mat();
        Size tile = new Size(tileGrid, tileGrid);
        CLAHE clahe = opencv_imgproc.createCLAHE(clipLimit, tile);
        clahe.apply(l, lEq);

        MatVector merged = new MatVector(lEq, channels.get(1), channels.get(2));
        Mat labOut = new Mat();
        opencv_core.merge(merged, labOut);

        Mat result = new Mat();
        opencv_imgproc.cvtColor(labOut, result, opencv_imgproc.COLOR_Lab2BGR);

        clahe.close();
        tile.close();
        channels.close();
        lEq.release();
        merged.close();
        labOut.release();
        lab.release();

        return result;
    }
}
