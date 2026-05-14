package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import java.util.Random;

import org.bytedeco.javacpp.indexer.DoubleIndexer;
import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import app.restful.services.correction.CorrectionRegistry;
import app.restful.services.correction.dehaze.DarkChannelDehazeAlgorithm;

@SpringBootTest
public class DarkChannelDehazeAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    private Mat hazyScene;   // colorful patches blended with atmospheric white veil

    @BeforeEach
    void setUp() {
        // Synthesise: colourful base + heavy white haze.
        // Hazy model: I = J*t + A*(1-t), with A ≈ (240,240,240) and t ≈ 0.4 (lots of haze).
        Random r = new Random(7);
        int rows = 96, cols = 96;
        hazyScene = new Mat(rows, cols, opencv_core.CV_8UC3);
        UByteIndexer idx = hazyScene.createIndexer();
        double t = 0.4;       // transmission — low = hazy
        double[] A = { 240, 240, 240 };
        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                // Make the underlying scene colourful so the dark-channel prior fires.
                double[] J = {
                        20 + 200 * r.nextDouble(),
                        20 + 200 * r.nextDouble(),
                        20 + 200 * r.nextDouble()
                };
                int[] v = new int[3];
                for (int c = 0; c < 3; c++) {
                    v[c] = (int) Math.round(J[c] * t + A[c] * (1 - t));
                    if (v[c] < 0) v[c] = 0;
                    if (v[c] > 255) v[c] = 255;
                }
                idx.put(y, x, v);
            }
        }
        idx.release();
    }

    @AfterEach
    void tearDown() {
        if (hazyScene != null) hazyScene.release();
    }

    @Test
    void registryResolvesDarkChannelDehaze() {
        assertTrue(registry.contains("dark_channel_dehaze"));
    }

    @Test
    void dimensionsPreserved() {
        Mat out = registry.get("dark_channel_dehaze").apply(hazyScene, Map.of());
        assertNotNull(out);
        assertEquals(hazyScene.rows(), out.rows());
        assertEquals(hazyScene.cols(), out.cols());
        assertEquals(3, out.channels());
        assertEquals(opencv_core.CV_8U, out.depth());
        out.release();
    }

    @Test
    void dehazingIncreasesGlobalContrast() {
        // Hazy images have compressed contrast (everything pulled toward A).
        // After dehaze, gray-scale stddev should rise.
        double stdBefore = lumaStd(hazyScene);
        Mat out = registry.get("dark_channel_dehaze").apply(hazyScene, Map.of("omega", 0.95, "t0", 0.1));
        double stdAfter = lumaStd(out);
        assertTrue(stdAfter > stdBefore,
                "Dehazed image should have higher contrast; before=" + stdBefore
                        + " after=" + stdAfter);
        out.release();
    }

    @Test
    void coreApiReachable() {
        Mat out = DarkChannelDehazeAlgorithm.applyCore(hazyScene, 0.95, 0.1);
        assertNotNull(out);
        out.release();
    }

    private static double lumaStd(Mat bgr) {
        Mat gray = new Mat();
        opencv_imgproc.cvtColor(bgr, gray, opencv_imgproc.COLOR_BGR2GRAY);
        Mat mean = new Mat();
        Mat std  = new Mat();
        opencv_core.meanStdDev(gray, mean, std);
        DoubleIndexer si = std.createIndexer();
        double s = si.get(0, 0);
        si.release();
        mean.release();
        std.release();
        gray.release();
        return s;
    }
}
