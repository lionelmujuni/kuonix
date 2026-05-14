package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.Map;
import java.util.Random;

import org.bytedeco.javacpp.indexer.DoubleIndexer;
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

@SpringBootTest
public class Bm3dAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    private Mat noisyImage;  // uniform gray + Gaussian noise
    private Mat cleanImage;  // uniform gray, no noise

    @BeforeEach
    void setUp() {
        cleanImage = new Mat(100, 100, opencv_core.CV_8UC3,
                new Scalar(128.0, 128.0, 128.0, 0.0));

        noisyImage = new Mat(100, 100, opencv_core.CV_8UC3);
        UByteIndexer idx = noisyImage.createIndexer();
        Random rng = new Random(42);
        for (int y = 0; y < 100; y++) {
            for (int x = 0; x < 100; x++) {
                int v = 128 + (int) Math.round(rng.nextGaussian() * 20);
                v = Math.max(0, Math.min(255, v));
                idx.put(y, x, 0, v);
                idx.put(y, x, 1, v);
                idx.put(y, x, 2, v);
            }
        }
        idx.release();
    }

    @AfterEach
    void tearDown() {
        if (noisyImage != null) noisyImage.release();
        if (cleanImage != null) cleanImage.release();
    }

    @Test
    void registryResolvesBm3d() {
        assertTrue(registry.contains("bm3d"));
        assertNotNull(registry.get("bm3d"));
    }

    @Test
    void dimensionsPreserved() {
        Map<String, Object> params = new HashMap<>();
        Mat result = registry.get("bm3d").apply(noisyImage, params);
        assertNotNull(result);
        assertEquals(noisyImage.rows(), result.rows());
        assertEquals(noisyImage.cols(), result.cols());
        assertEquals(noisyImage.channels(), result.channels());
        result.release();
    }

    @Test
    void outputIsUint8ThreeChannel() {
        Map<String, Object> params = new HashMap<>();
        Mat result = registry.get("bm3d").apply(noisyImage, params);
        assertEquals(opencv_core.CV_8U, result.depth());
        assertEquals(3, result.channels());
        result.release();
    }

    @Test
    void denoisingReducesStdDev() {
        // A noisy gray image should have lower per-channel std after BM3D.
        Map<String, Object> params = Map.of("sigma", 20.0, "shadowMaskOnly", false);
        Mat result = registry.get("bm3d").apply(noisyImage, params);

        double stdBefore = channelStdDev(noisyImage);
        double stdAfter  = channelStdDev(result);

        assertTrue(stdAfter < stdBefore,
                "BM3D should reduce noise stddev; before=" + stdBefore
                        + " after=" + stdAfter);
        result.release();
    }

    @Test
    void shadowMaskOnlyPreservesBrightRegions() {
        // Dark top half + bright bottom half. With shadowMaskOnly, the bright
        // bottom should be left largely untouched (diff < threshold).
        Mat mixed = new Mat(100, 100, opencv_core.CV_8UC3);
        UByteIndexer idx = mixed.createIndexer();
        Random rng = new Random(99);
        for (int y = 0; y < 100; y++) {
            int base = (y < 50) ? 20 : 200;
            for (int x = 0; x < 100; x++) {
                int v = base + (int) Math.round(rng.nextGaussian() * 10);
                v = Math.max(0, Math.min(255, v));
                idx.put(y, x, 0, v);
                idx.put(y, x, 1, v);
                idx.put(y, x, 2, v);
            }
        }
        idx.release();

        Map<String, Object> params = Map.of("sigma", 20.0, "shadowMaskOnly", true);
        Mat result = registry.get("bm3d").apply(mixed, params);

        // Mean absolute difference in the bright region (rows 60–99) should be small.
        double diffBright = regionMeanAbsDiff(mixed, result, 60, 99);
        assertTrue(diffBright < 15.0,
                "Bright region should be largely preserved with shadowMaskOnly; diff="
                        + diffBright);

        mixed.release();
        result.release();
    }

    // -------------------------------------------------------------------------

    private static double channelStdDev(Mat bgr) {
        Mat gray   = new Mat();
        Mat mean   = new Mat();
        Mat stddev = new Mat();
        opencv_imgproc.cvtColor(bgr, gray, opencv_imgproc.COLOR_BGR2GRAY);
        opencv_core.meanStdDev(gray, mean, stddev);
        DoubleIndexer si = stddev.createIndexer();
        double s = si.get(0, 0);
        si.release();
        mean.release();
        stddev.release();
        gray.release();
        return s;
    }

    private static double regionMeanAbsDiff(Mat a, Mat b, int rowStart, int rowEnd) {
        Mat ra = a.rowRange(rowStart, rowEnd + 1).clone();
        Mat rb = b.rowRange(rowStart, rowEnd + 1).clone();
        Mat diff = new Mat();
        opencv_core.absdiff(ra, rb, diff);

        Mat mean   = new Mat();
        Mat stddev = new Mat();
        opencv_core.meanStdDev(diff, mean, stddev);
        DoubleIndexer mi = mean.createIndexer();
        // For 3-channel input meanStdDev returns 1×3; average the three channels.
        double avg = (mi.get(0, 0) + mi.get(0, 1) + mi.get(0, 2)) / 3.0;
        mi.release();
        mean.release();
        stddev.release();
        diff.release();
        ra.release();
        rb.release();
        return avg;
    }
}
