package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.junit.jupiter.api.Test;

import app.restful.services.correction.primitives.SkinMask;

public class SkinMaskTest {

    @Test
    void skinBgrYieldsHighMaskMean() {
        // Caucasian-ish skin BGR ≈ (140, 160, 200).
        Mat skin = new Mat(64, 64, opencv_core.CV_8UC3, new Scalar(140.0, 160.0, 200.0, 0.0));
        Mat mask = SkinMask.compute(skin, 3);
        Scalar m = opencv_core.mean(mask);
        assertTrue(m.get(0) > 0.6, "Skin field should produce high mask mean; got " + m.get(0));
        mask.release();
        skin.release();
    }

    @Test
    void blueSkyYieldsLowMaskMean() {
        // Blue sky BGR ≈ (200, 120, 40).
        Mat sky = new Mat(64, 64, opencv_core.CV_8UC3, new Scalar(200.0, 120.0, 40.0, 0.0));
        Mat mask = SkinMask.compute(sky, 3);
        Scalar m = opencv_core.mean(mask);
        assertTrue(m.get(0) < 0.1, "Sky should not register as skin; got " + m.get(0));
        mask.release();
        sky.release();
    }

    @Test
    void greenGrassYieldsLowMaskMean() {
        // Grass green BGR ≈ (40, 140, 60).
        Mat grass = new Mat(64, 64, opencv_core.CV_8UC3, new Scalar(40.0, 140.0, 60.0, 0.0));
        Mat mask = SkinMask.compute(grass, 3);
        Scalar m = opencv_core.mean(mask);
        assertTrue(m.get(0) < 0.1, "Grass should not register as skin; got " + m.get(0));
        mask.release();
        grass.release();
    }

    @Test
    void maskDimensionsAndTypeAreCorrect() {
        Mat bgr = new Mat(40, 30, opencv_core.CV_8UC3, new Scalar(140.0, 160.0, 200.0, 0.0));
        Mat mask = SkinMask.compute(bgr, 0);
        assertEquals(40, mask.rows());
        assertEquals(30, mask.cols());
        assertEquals(1, mask.channels());
        assertEquals(opencv_core.CV_32F, mask.depth());
        mask.release();
        bgr.release();
    }

    @Test
    void toThreeChannelReplicatesCorrectly() {
        Mat bgr = new Mat(32, 32, opencv_core.CV_8UC3, new Scalar(140.0, 160.0, 200.0, 0.0));
        Mat mask1 = SkinMask.compute(bgr, 0);
        Mat mask3 = SkinMask.toThreeChannel(mask1);
        assertEquals(3, mask3.channels());
        assertEquals(mask1.rows(), mask3.rows());
        assertEquals(mask1.cols(), mask3.cols());
        mask1.release(); mask3.release(); bgr.release();
    }
}
