package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import java.util.Random;

import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import app.restful.services.correction.CorrectionRegistry;
import app.restful.services.correction.wb.FfccAlgorithm;

@SpringBootTest
public class FfccAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    private Mat blueCast;     // many mid-grays shifted toward blue
    private Mat neutral;      // noisy mid-gray, no cast

    @BeforeEach
    void setUp() {
        // Blue cast: B elevated relative to R and G across the frame, with mild noise.
        Random r = new Random(11);
        blueCast = new Mat(80, 80, opencv_core.CV_8UC3);
        UByteIndexer idx = blueCast.createIndexer();
        for (int y = 0; y < 80; y++) {
            for (int x = 0; x < 80; x++) {
                int n = (int) (r.nextGaussian() * 8);
                int[] v = new int[] {
                        clamp(180 + n),                    // B — high
                        clamp(130 + (int)(r.nextGaussian() * 8)),  // G
                        clamp(110 + (int)(r.nextGaussian() * 8))   // R — low
                };
                idx.put(y, x, v);
            }
        }
        idx.release();

        neutral = new Mat(60, 60, opencv_core.CV_8UC3, new Scalar(128.0, 128.0, 128.0, 0.0));
    }

    @AfterEach
    void tearDown() {
        if (blueCast != null) blueCast.release();
        if (neutral != null) neutral.release();
    }

    @Test
    void registryResolvesFfcc() {
        assertTrue(registry.contains("ffcc"));
    }

    @Test
    void blueCastIsNeutralised() {
        double[] before = channelMeans(blueCast);
        Mat out = registry.get("ffcc").apply(blueCast, Map.of("confidenceThreshold", 0.0));
        double[] after = channelMeans(out);

        // Before: B >> R. After: the gap should shrink.
        double gapBefore = before[0] - before[2];    // B - R
        double gapAfter  = after[0]  - after[2];
        assertTrue(gapAfter < gapBefore,
                "Blue cast should reduce; gap before=" + gapBefore + " after=" + gapAfter);
        out.release();
    }

    @Test
    void neutralImagePreserved() {
        Mat out = registry.get("ffcc").apply(neutral, Map.of("confidenceThreshold", 0.0));
        double[] m = channelMeans(out);
        // Channels should be near-equal on a neutral image.
        assertTrue(Math.abs(m[0] - m[1]) < 6);
        assertTrue(Math.abs(m[1] - m[2]) < 6);
        out.release();
    }

    @Test
    void dimensionsPreserved() {
        Mat out = registry.get("ffcc").apply(blueCast, Map.of());
        assertNotNull(out);
        assertEquals(blueCast.rows(), out.rows());
        assertEquals(blueCast.cols(), out.cols());
        assertEquals(3, out.channels());
        out.release();
    }

    @Test
    void coreApiReachable() {
        Mat out = FfccAlgorithm.applyCore(blueCast, 0.3);
        assertNotNull(out);
        out.release();
    }

    private static int clamp(int v) {
        if (v < 0) return 0;
        if (v > 255) return 255;
        return v;
    }

    private static double[] channelMeans(Mat bgr) {
        MatVector ch = new MatVector(3);
        opencv_core.split(bgr, ch);
        double[] out = new double[] {
                opencv_core.mean(ch.get(0)).get(0),
                opencv_core.mean(ch.get(1)).get(0),
                opencv_core.mean(ch.get(2)).get(0)
        };
        ch.close();
        return out;
    }
}
