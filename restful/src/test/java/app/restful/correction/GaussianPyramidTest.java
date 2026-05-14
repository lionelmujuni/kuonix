package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.bytedeco.opencv.opencv_core.Size;
import org.junit.jupiter.api.Test;

import app.restful.services.correction.primitives.GaussianPyramid;

public class GaussianPyramidTest {

    @Test
    void buildHalvesDimensionsPerLevel() {
        Mat src = new Mat(128, 128, opencv_core.CV_8UC1, new Scalar(128.0));
        GaussianPyramid g = GaussianPyramid.build(src, 4);
        assertEquals(4, g.size());
        assertEquals(128, g.get(0).rows());
        assertEquals(64,  g.get(1).rows());
        assertEquals(32,  g.get(2).rows());
        assertEquals(16,  g.get(3).rows());
        g.release();
        src.release();
    }

    @Test
    void baseLevelIsFloat() {
        Mat src = new Mat(32, 32, opencv_core.CV_8UC3, new Scalar(50.0, 120.0, 200.0, 0.0));
        GaussianPyramid g = GaussianPyramid.build(src, 3);
        assertEquals(opencv_core.CV_32F, g.get(0).depth());
        assertEquals(3, g.get(0).channels());
        g.release();
        src.release();
    }

    @Test
    void rejectsZeroLevels() {
        Mat src = new Mat(16, 16, opencv_core.CV_8UC1, new Scalar(0.0));
        assertThrows(IllegalArgumentException.class, () -> GaussianPyramid.build(src, 0));
        src.release();
    }

    @Test
    void upsampleToArbitraryTargetSizeSucceeds() {
        Mat small = new Mat(20, 20, opencv_core.CV_32FC1, new Scalar(100.0));
        Size target = new Size(80, 60);
        Mat up = GaussianPyramid.upsampleTo(small, target);
        assertEquals(60, up.rows());
        assertEquals(80, up.cols());
        assertNotNull(up);
        // Content near centre should still be near the constant value.
        Scalar mean = opencv_core.mean(up);
        assertTrue(Math.abs(mean.get(0) - 100.0) < 1.0,
                "Uniform field should upsample to same value; got " + mean.get(0));
        up.release();
        small.release();
        target.close();
    }

    @Test
    void buildStopsWhenResolutionTooSmall() {
        // Starting from 4x4, we can make at most 3 levels (4, 2, 1); then stop.
        Mat src = new Mat(4, 4, opencv_core.CV_8UC1, new Scalar(128.0));
        GaussianPyramid g = GaussianPyramid.build(src, 10);
        assertTrue(g.size() <= 4, "Should stop when dimensions fall below 2; got " + g.size());
        assertTrue(g.size() >= 1);
        g.release();
        src.release();
    }
}
