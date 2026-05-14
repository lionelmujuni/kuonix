package app.restful.services.correction.basic;

import java.util.Map;

import org.bytedeco.javacpp.indexer.FloatIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * 3×3 linear color matrix (row-major). Typically a camera-native→sRGB
 * calibration matrix. Identity matrix is the default.
 */
@Component
public class ColorMatrixAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "color_matrix";

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double[] matrix = new double[9];
        for (int i = 0; i < 9; i++) {
            matrix[i] = ParamUtils.getDouble(params, "m" + i, i % 4 == 0 ? 1.0 : 0.0);
        }
        return applyCore(bgr, matrix);
    }

    public static Mat applyCore(Mat bgr, double[] matrixValues) {
        if (matrixValues.length != 9) {
            throw new IllegalArgumentException("Color matrix must have 9 values");
        }

        Mat transformMatrix = new Mat(3, 3, opencv_core.CV_32F);
        FloatIndexer idx = transformMatrix.createIndexer();
        for (int i = 0; i < 3; i++) {
            for (int j = 0; j < 3; j++) {
                idx.put(i, j, (float) matrixValues[i * 3 + j]);
            }
        }
        idx.release();

        Mat bgrFloat = new Mat();
        bgr.convertTo(bgrFloat, opencv_core.CV_32F);

        Mat result = new Mat();
        opencv_core.transform(bgrFloat, result, transformMatrix);

        Mat result8u = new Mat();
        result.convertTo(result8u, opencv_core.CV_8U);

        transformMatrix.release();
        bgrFloat.release();
        result.release();

        return result8u;
    }
}
