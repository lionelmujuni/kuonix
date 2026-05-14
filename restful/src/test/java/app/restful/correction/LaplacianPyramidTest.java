package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Random;

import org.bytedeco.javacpp.indexer.FloatIndexer;
import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.junit.jupiter.api.Test;

import app.restful.services.correction.primitives.LaplacianPyramid;

public class LaplacianPyramidTest {

    @Test
    void pyramidHasRequestedLevelCount() {
        Mat src = new Mat(64, 64, opencv_core.CV_8UC1, new Scalar(128.0));
        LaplacianPyramid lp = LaplacianPyramid.build(src, 4);
        assertEquals(4, lp.size());
        lp.release();
        src.release();
    }

    @Test
    void reconstructionIsNearLossless() {
        // Random noise image — stresses all frequencies.
        Mat src = new Mat(64, 64, opencv_core.CV_8UC1);
        UByteIndexer idx = src.createIndexer();
        Random r = new Random(7);
        for (int y = 0; y < 64; y++) {
            for (int x = 0; x < 64; x++) {
                idx.put(y, x, r.nextInt(256));
            }
        }
        idx.release();

        LaplacianPyramid lp = LaplacianPyramid.build(src, 4);
        Mat reconstructed = lp.collapse();

        double mse = mseCV8UvsCV32F(src, reconstructed);
        double psnr = 10.0 * Math.log10(255.0 * 255.0 / Math.max(mse, 1e-9));
        assertTrue(psnr > 35.0,
                "Laplacian reconstruction should be near-lossless; PSNR=" + psnr);

        reconstructed.release();
        lp.release();
        src.release();
    }

    @Test
    void topLevelIsCoarseResidual() {
        Mat src = new Mat(32, 32, opencv_core.CV_8UC1, new Scalar(80.0));
        LaplacianPyramid lp = LaplacianPyramid.build(src, 3);
        // Top (coarsest) level on a uniform field is the downsampled constant.
        Scalar meanTop = opencv_core.mean(lp.get(lp.size() - 1));
        assertTrue(Math.abs(meanTop.get(0) - 80.0) < 2.0,
                "Top level of uniform field should stay near the constant; got " + meanTop.get(0));
        lp.release();
        src.release();
    }

    @Test
    void bandLevelsSumNearZeroOnUniformField() {
        // For a uniform field, all band levels (all but the top) should be ~0.
        Mat src = new Mat(32, 32, opencv_core.CV_8UC1, new Scalar(140.0));
        LaplacianPyramid lp = LaplacianPyramid.build(src, 3);
        for (int i = 0; i < lp.size() - 1; i++) {
            Scalar m = opencv_core.mean(lp.get(i));
            assertTrue(Math.abs(m.get(0)) < 2.0,
                    "Band level " + i + " mean should be ~0 on a flat image; got " + m.get(0));
        }
        lp.release();
        src.release();
    }

    /** MSE between an 8-bit source and a float reconstruction. */
    private static double mseCV8UvsCV32F(Mat src8u, Mat reconF32) {
        UByteIndexer a = src8u.createIndexer();
        FloatIndexer b = reconF32.createIndexer();
        double sumSq = 0;
        int n = src8u.rows() * src8u.cols();
        for (int y = 0; y < src8u.rows(); y++) {
            for (int x = 0; x < src8u.cols(); x++) {
                double d = a.get(y, x) - b.get(y, x);
                sumSq += d * d;
            }
        }
        a.release();
        b.release();
        return sumSq / n;
    }
}
