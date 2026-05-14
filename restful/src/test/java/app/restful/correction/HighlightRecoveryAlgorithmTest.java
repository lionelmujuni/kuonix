package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import app.restful.services.correction.CorrectionRegistry;
import app.restful.services.correction.hdr.HighlightRecoveryAlgorithm;

@SpringBootTest
public class HighlightRecoveryAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    private Mat blownHighlights;   // left half clipped at 255, right half mid-gray
    private Mat normalImage;

    @BeforeEach
    void setUp() {
        blownHighlights = new Mat(80, 80, opencv_core.CV_8UC3);
        UByteIndexer idx = blownHighlights.createIndexer();
        for (int y = 0; y < 80; y++) {
            for (int x = 0; x < 80; x++) {
                int[] v = (x < 40) ? new int[]{255, 255, 255} : new int[]{120, 120, 120};
                idx.put(y, x, v);
            }
        }
        idx.release();
        normalImage = new Mat(60, 60, opencv_core.CV_8UC3, new Scalar(128.0, 128.0, 128.0, 0.0));
    }

    @AfterEach
    void tearDown() {
        if (blownHighlights != null) blownHighlights.release();
        if (normalImage != null) normalImage.release();
    }

    @Test
    void registryResolvesHighlightRecovery() {
        assertTrue(registry.contains("highlight_recovery"));
    }

    @Test
    void dimensionsPreserved() {
        Mat out = registry.get("highlight_recovery").apply(blownHighlights, Map.of());
        assertNotNull(out);
        assertEquals(blownHighlights.rows(), out.rows());
        assertEquals(blownHighlights.cols(), out.cols());
        assertEquals(3, out.channels());
        out.release();
    }

    @Test
    void blownRegionDarkensAfterRecovery() {
        Mat out = registry.get("highlight_recovery").apply(blownHighlights, Map.of("strength", 1.0));
        UByteIndexer idx = out.createIndexer();
        int[] leftSample = new int[3];
        idx.get(40, 10, leftSample);
        idx.release();
        // After fusion the blown region should no longer clip at 255.
        int avg = (leftSample[0] + leftSample[1] + leftSample[2]) / 3;
        assertTrue(avg < 250, "Blown highlights should be recovered; got avg=" + avg);
        out.release();
    }

    @Test
    void strengthZeroIsIdentity() {
        Mat out = registry.get("highlight_recovery").apply(normalImage, Map.of("strength", 0.0));
        UByteIndexer a = normalImage.createIndexer();
        UByteIndexer b = out.createIndexer();
        int[] pa = new int[3]; int[] pb = new int[3];
        a.get(30, 30, pa); b.get(30, 30, pb);
        a.release(); b.release();
        assertEquals(pa[0], pb[0], 3);
        assertEquals(pa[1], pb[1], 3);
        assertEquals(pa[2], pb[2], 3);
        out.release();
    }

    @Test
    void coreApiReachable() {
        Mat out = HighlightRecoveryAlgorithm.applyCore(blownHighlights, new double[]{-1.0, -2.0}, 1.0);
        assertNotNull(out);
        out.release();
    }
}
