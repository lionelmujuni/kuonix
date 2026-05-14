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
import app.restful.services.correction.hdr.ReinhardTonemapAlgorithm;

@SpringBootTest
public class ReinhardTonemapAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    private Mat highKey;    // mostly-bright image — should compress highlights
    private Mat midGray;    // uniform — should remain near-mid

    @BeforeEach
    void setUp() {
        // High-key: top half saturated white, bottom half mid-gray.
        highKey = new Mat(64, 64, opencv_core.CV_8UC3, new Scalar(128.0, 128.0, 128.0, 0.0));
        UByteIndexer idx = highKey.createIndexer();
        for (int y = 0; y < 32; y++) {
            for (int x = 0; x < 64; x++) {
                idx.put(y, x, 0, 250);
                idx.put(y, x, 1, 250);
                idx.put(y, x, 2, 250);
            }
        }
        idx.release();

        midGray = new Mat(48, 48, opencv_core.CV_8UC3, new Scalar(128.0, 128.0, 128.0, 0.0));
    }

    @AfterEach
    void tearDown() {
        if (highKey != null) highKey.release();
        if (midGray != null) midGray.release();
    }

    @Test
    void registryResolvesReinhard() {
        assertTrue(registry.contains("reinhard_tonemap"));
    }

    @Test
    void dimensionsPreserved() {
        Mat out = registry.get("reinhard_tonemap").apply(highKey, Map.of());
        assertNotNull(out);
        assertEquals(highKey.rows(), out.rows());
        assertEquals(highKey.cols(), out.cols());
        assertEquals(3, out.channels());
        assertEquals(opencv_core.CV_8U, out.depth());
        out.release();
    }

    @Test
    void brightHighlightsCompressed() {
        // After Reinhard with whitePoint=1.0, the bright top region should drop below 250.
        Mat out = registry.get("reinhard_tonemap").apply(highKey,
                Map.of("keyValue", 0.18, "whitePoint", 1.0));
        UByteIndexer a = out.createIndexer();
        int[] px = new int[3];
        a.get(10, 32, px);   // top half
        a.release();
        assertTrue(px[0] < 250 && px[1] < 250 && px[2] < 250,
                "highlights should compress; got=" + px[0] + "," + px[1] + "," + px[2]);
        out.release();
    }

    @Test
    void uniformGrayStaysMidRange() {
        // A flat mid-gray scene — log avg ≈ 0.5; key=0.18 brings it down toward 0.18.
        Mat out = registry.get("reinhard_tonemap").apply(midGray,
                Map.of("keyValue", 0.18, "whitePoint", 4.0));
        UByteIndexer a = out.createIndexer();
        int[] px = new int[3];
        a.get(20, 20, px);
        a.release();
        // Expect output near 0.18 * 255 ≈ 46 (very approximate).
        assertTrue(px[0] >= 20 && px[0] <= 120,
                "uniform gray should map near key value; got=" + px[0]);
        out.release();
    }

    @Test
    void coreApiReachable() {
        Mat out = ReinhardTonemapAlgorithm.applyCore(highKey, 0.18, 1.0);
        assertNotNull(out);
        out.release();
    }
}
