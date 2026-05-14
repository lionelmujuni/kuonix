package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
import app.restful.services.correction.saturation.GamutCompressAlgorithm;

@SpringBootTest
public class GamutCompressAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    private Mat overSaturated;   // very red: BGR(0, 0, 250)
    private Mat midGray;         // neutral — should be near-identity

    @BeforeEach
    void setUp() {
        overSaturated = new Mat(64, 64, opencv_core.CV_8UC3, new Scalar(0.0, 0.0, 250.0, 0.0));
        midGray       = new Mat(64, 64, opencv_core.CV_8UC3, new Scalar(128.0, 128.0, 128.0, 0.0));
    }

    @AfterEach
    void tearDown() {
        if (overSaturated != null) overSaturated.release();
        if (midGray != null) midGray.release();
    }

    @Test
    void registryResolvesGamutCompress() {
        assertTrue(registry.contains("gamut_compress"));
    }

    @Test
    void saturatedPixelsLoseSomeChroma() {
        double sBefore = meanSaturation(overSaturated);
        Mat out = registry.get("gamut_compress").apply(overSaturated, Map.of("threshold", 0.5));
        double sAfter = meanSaturation(out);
        assertTrue(sAfter < sBefore, "Saturation should drop; before=" + sBefore + " after=" + sAfter);
        out.release();
    }

    @Test
    void neutralPixelsSurviveNearlyUntouched() {
        Mat out = registry.get("gamut_compress").apply(midGray, Map.of());
        UByteIndexer a = midGray.createIndexer();
        UByteIndexer b = out.createIndexer();
        int[] pa = new int[3]; int[] pb = new int[3];
        a.get(30, 30, pa); b.get(30, 30, pb);
        a.release(); b.release();
        assertEquals(pa[0], pb[0], 2);
        assertEquals(pa[1], pb[1], 2);
        assertEquals(pa[2], pb[2], 2);
        out.release();
    }

    @Test
    void dimensionsPreserved() {
        Mat out = registry.get("gamut_compress").apply(overSaturated, Map.of());
        assertNotNull(out);
        assertEquals(overSaturated.rows(), out.rows());
        assertEquals(overSaturated.cols(), out.cols());
        assertEquals(3, out.channels());
        out.release();
    }

    @Test
    void huePreservedOnRedPixel() {
        // Compressing a pure red pixel should keep the hue roughly red (0° in HSV).
        Mat out = registry.get("gamut_compress").apply(overSaturated, Map.of("threshold", 0.5, "limit", 1.2));
        Mat hsv = new Mat();
        opencv_imgproc.cvtColor(out, hsv, opencv_imgproc.COLOR_BGR2HSV);
        MatVector ch = new MatVector(3);
        opencv_core.split(hsv, ch);
        Scalar meanH = opencv_core.mean(ch.get(0));
        double hue = meanH.get(0);   // OpenCV H ∈ [0, 179], red ≈ 0 or 179
        boolean redish = hue < 10 || hue > 170;
        assertTrue(redish, "Compressed red should stay red; H=" + hue);
        ch.close(); hsv.release(); out.release();
    }

    @Test
    void coreApiReachable() {
        Mat out = GamutCompressAlgorithm.applyCore(overSaturated, 0.8, 1.2);
        assertNotNull(out);
        out.release();
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
