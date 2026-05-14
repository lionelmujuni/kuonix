package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import app.restful.services.correction.CorrectionRegistry;
import app.restful.services.correction.creative.HarmonizationAlgorithm;

@SpringBootTest
public class HarmonizationAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    private Mat saturatedGreen;   // BGR(0, 200, 0) — H ≈ 60° (OpenCV H≈60)
    private Mat neutralGray;

    @BeforeEach
    void setUp() {
        saturatedGreen = new Mat(48, 48, opencv_core.CV_8UC3, new Scalar(0.0, 200.0, 0.0, 0.0));
        neutralGray    = new Mat(48, 48, opencv_core.CV_8UC3, new Scalar(128.0, 128.0, 128.0, 0.0));
    }

    @AfterEach
    void tearDown() {
        if (saturatedGreen != null) saturatedGreen.release();
        if (neutralGray != null) neutralGray.release();
    }

    @Test
    void registryResolvesHarmonization() {
        assertTrue(registry.contains("harmonization"));
    }

    @Test
    void dimensionsPreserved() {
        Mat out = registry.get("harmonization").apply(saturatedGreen, Map.of("template", "I"));
        assertNotNull(out);
        assertEquals(saturatedGreen.rows(), out.rows());
        assertEquals(saturatedGreen.cols(), out.cols());
        assertEquals(3, out.channels());
        out.release();
    }

    @Test
    void templateNIsIdentity() {
        // 'N' = no constraint, output should match input.
        Mat out = registry.get("harmonization").apply(saturatedGreen, Map.of("template", "N"));
        UByteIndexer a = saturatedGreen.createIndexer();
        UByteIndexer b = out.createIndexer();
        int[] pa = new int[3]; int[] pb = new int[3];
        a.get(20, 20, pa); b.get(20, 20, pb);
        a.release(); b.release();
        assertEquals(pa[0], pb[0]);
        assertEquals(pa[1], pb[1]);
        assertEquals(pa[2], pb[2]);
        out.release();
    }

    @Test
    void neutralPixelsUntouched() {
        // Saturation × value < 0.05 means the algorithm skips the pixel.
        // A near-black image has V near 0 — should pass through.
        Mat darkGray = new Mat(32, 32, opencv_core.CV_8UC3, new Scalar(5.0, 5.0, 5.0, 0.0));
        Mat out = registry.get("harmonization").apply(darkGray, Map.of("template", "i"));
        UByteIndexer b = out.createIndexer();
        int[] pb = new int[3];
        b.get(10, 10, pb);
        b.release();
        assertTrue(Math.abs(pb[0] - 5) < 5 && Math.abs(pb[1] - 5) < 5 && Math.abs(pb[2] - 5) < 5,
                "near-black pixel should be untouched; got " + pb[0] + "," + pb[1] + "," + pb[2]);
        out.release();
        darkGray.release();
    }

    @Test
    void greenSnapsTowardRedTemplateOffset() {
        // Template 'i' centred at offset 0° (red). Green (~120° in HSV degrees,
        // i.e. OpenCV H=60) should be pulled toward red.
        Mat out = registry.get("harmonization").apply(saturatedGreen,
                Map.of("template", "i", "offsetDeg", 0.0));
        Mat hsv = new Mat();
        opencv_imgproc.cvtColor(out, hsv, opencv_imgproc.COLOR_BGR2HSV);
        UByteIndexer h = hsv.createIndexer();
        int[] px = new int[3];
        h.get(20, 20, px);
        h.release();
        double hueDeg = px[0] * 2.0;
        // Original green hue ≈ 120°; should now be closer to 0° (red).
        assertTrue(hueDeg < 100.0,
                "green should rotate toward red; new hue=" + hueDeg);
        hsv.release();
        out.release();
    }

    @Test
    void coreApiReachable() {
        Mat out = HarmonizationAlgorithm.applyCore(saturatedGreen, "I", 0.0);
        assertNotNull(out);
        out.release();
    }
}
