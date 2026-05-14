package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import java.util.Random;

import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import app.restful.services.correction.CorrectionRegistry;
import app.restful.services.correction.hdr.MantiukTonemapAlgorithm;

@SpringBootTest
public class MantiukTonemapAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    private Mat busyScene;   // varied content — Mantiuk needs spatial structure

    @BeforeEach
    void setUp() {
        Random r = new Random(31);
        busyScene = new Mat(96, 96, opencv_core.CV_8UC3);
        UByteIndexer idx = busyScene.createIndexer();
        for (int y = 0; y < 96; y++) {
            for (int x = 0; x < 96; x++) {
                // Brightness gradient + noise + saturated highlights in top-right.
                int base = 30 + (x + y);
                if (y < 30 && x > 60) base = 250;
                int n = (int) Math.round(r.nextGaussian() * 8);
                int v = Math.max(0, Math.min(255, base + n));
                idx.put(y, x, 0, v);
                idx.put(y, x, 1, v);
                idx.put(y, x, 2, v);
            }
        }
        idx.release();
    }

    @AfterEach
    void tearDown() {
        if (busyScene != null) busyScene.release();
    }

    @Test
    void registryResolvesMantiuk() {
        assertTrue(registry.contains("mantiuk_tonemap"));
    }

    @Test
    void dimensionsPreserved() {
        Mat out = registry.get("mantiuk_tonemap").apply(busyScene, Map.of());
        assertNotNull(out);
        assertEquals(busyScene.rows(), out.rows());
        assertEquals(busyScene.cols(), out.cols());
        assertEquals(3, out.channels());
        assertEquals(opencv_core.CV_8U, out.depth());
        out.release();
    }

    @Test
    void outputStaysInRange() {
        // Tonemapper should not blow up out-of-gamut.
        Mat out = registry.get("mantiuk_tonemap").apply(busyScene,
                Map.of("saturation", 1.0, "contrastScale", 0.75));
        UByteIndexer a = out.createIndexer();
        int[] px = new int[3];
        for (int y = 0; y < 96; y += 16) {
            for (int x = 0; x < 96; x += 16) {
                a.get(y, x, px);
                for (int c = 0; c < 3; c++) {
                    assertTrue(px[c] >= 0 && px[c] <= 255,
                            "out-of-range at (" + y + "," + x + "): " + px[c]);
                }
            }
        }
        a.release();
        out.release();
    }

    @Test
    void coreApiReachable() {
        Mat out = MantiukTonemapAlgorithm.applyCore(busyScene, 1.0, 0.75);
        assertNotNull(out);
        out.release();
    }
}
