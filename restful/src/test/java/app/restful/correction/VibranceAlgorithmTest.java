package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.Map;

import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import app.restful.services.correction.CorrectionRegistry;
import app.restful.services.correction.saturation.VibranceAlgorithm;

@SpringBootTest
public class VibranceAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    private Mat dullGreen;      // low-saturation green — target for vibrance boost
    private Mat vividGreen;     // already-vivid green — should barely move
    private Mat skinTone;       // typical Caucasian skin (BGR ~ 140, 160, 200)

    @BeforeEach
    void setUp() {
        // Dull green: HSV(60°, 60, 150) in OpenCV 8-bit H=30
        Mat hsvDull = new Mat(100, 100, opencv_core.CV_8UC3, new Scalar(60.0, 60.0, 150.0, 0.0));
        dullGreen = new Mat();
        opencv_imgproc.cvtColor(hsvDull, dullGreen, opencv_imgproc.COLOR_HSV2BGR);
        hsvDull.release();

        // Vivid green: HSV(60°, 240, 200)
        Mat hsvVivid = new Mat(100, 100, opencv_core.CV_8UC3, new Scalar(60.0, 240.0, 200.0, 0.0));
        vividGreen = new Mat();
        opencv_imgproc.cvtColor(hsvVivid, vividGreen, opencv_imgproc.COLOR_HSV2BGR);
        hsvVivid.release();

        // Skin tone (BGR ≈ 140, 160, 200) — maps into skin hue range
        skinTone = new Mat(100, 100, opencv_core.CV_8UC3, new Scalar(140.0, 160.0, 200.0, 0.0));
    }

    @AfterEach
    void tearDown() {
        if (dullGreen != null) dullGreen.release();
        if (vividGreen != null) vividGreen.release();
        if (skinTone != null) skinTone.release();
    }

    @Test
    void registryResolvesVibrance() {
        assertTrue(registry.contains("vibrance"));
    }

    @Test
    void vibranceLiftsLowSaturationMore() {
        double sBefore = meanSaturation(dullGreen);
        Mat result = registry.get("vibrance").apply(dullGreen, Map.of("amount", 0.8));
        double sAfter = meanSaturation(result);
        assertTrue(sAfter > sBefore + 20,
                "Dull image should gain substantial saturation; before=" + sBefore + " after=" + sAfter);
        result.release();
    }

    @Test
    void vibranceBarelyTouchesVividPixels() {
        double sBefore = meanSaturation(vividGreen);
        Mat result = registry.get("vibrance").apply(vividGreen, Map.of("amount", 0.8));
        double sAfter = meanSaturation(result);
        // High-S input should move by less than a small fraction — the (1-s)^2 factor dominates.
        assertTrue(Math.abs(sAfter - sBefore) < 10,
                "Vivid image should barely change; before=" + sBefore + " after=" + sAfter);
        result.release();
    }

    @Test
    void amountZeroIsIdentity() {
        Mat result = registry.get("vibrance").apply(dullGreen, Map.of("amount", 0.0));
        UByteIndexer src = dullGreen.createIndexer();
        UByteIndexer dst = result.createIndexer();
        int[] a = new int[3]; int[] b = new int[3];
        src.get(50, 50, a); dst.get(50, 50, b);
        src.release(); dst.release();
        assertEquals(a[0], b[0], 2);
        assertEquals(a[1], b[1], 2);
        assertEquals(a[2], b[2], 2);
        result.release();
    }

    @Test
    void skinProtectionDampsSkinBoost() {
        double boostWithProtect = boostDelta(skinTone,
                Map.of("amount", 0.8, "skinProtect", 1.0));
        double boostWithoutProtect = boostDelta(skinTone,
                Map.of("amount", 0.8, "skinProtect", 0.0));
        assertTrue(boostWithProtect < boostWithoutProtect,
                "Skin protection should reduce saturation lift on skin pixels; "
                        + "protect=" + boostWithProtect + " off=" + boostWithoutProtect);
    }

    @Test
    void dimensionsPreserved() {
        Mat result = registry.get("vibrance").apply(dullGreen, new HashMap<>());
        assertNotNull(result);
        assertEquals(dullGreen.rows(), result.rows());
        assertEquals(dullGreen.cols(), result.cols());
        assertEquals(3, result.channels());
        result.release();
    }

    @Test
    void coreApiReachable() {
        Mat out = VibranceAlgorithm.applyCore(dullGreen, 0.5, true);
        assertNotNull(out);
        out.release();
    }

    private static double boostDelta(Mat bgr, Map<String, Object> params) {
        double before = meanSaturation(bgr);
        Mat out = VibranceAlgorithm.applyCore(bgr,
                ((Number) params.get("amount")).doubleValue(),
                ((Number) params.get("skinProtect")).doubleValue() != 0.0);
        double after = meanSaturation(out);
        out.release();
        return after - before;
    }

    private static double meanSaturation(Mat bgr) {
        Mat hsv = new Mat();
        opencv_imgproc.cvtColor(bgr, hsv, opencv_imgproc.COLOR_BGR2HSV);
        MatVector ch = new MatVector(3);
        opencv_core.split(hsv, ch);
        Scalar m = opencv_core.mean(ch.get(1));
        double v = m.get(0);
        ch.close(); hsv.release();
        return v;
    }
}
