package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.Map;

import org.bytedeco.javacpp.indexer.DoubleIndexer;
import org.bytedeco.javacpp.indexer.FloatIndexer;
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

@SpringBootTest
public class AceAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    // Strongly red-cast flat image: B=50, G=100, R=200
    private Mat redCastFlat;
    // Neutral flat gray
    private Mat grayFlat;

    @BeforeEach
    void setUp() {
        redCastFlat = new Mat(100, 100, opencv_core.CV_8UC3,
                new Scalar(50.0, 100.0, 200.0, 0.0));
        grayFlat    = new Mat(100, 100, opencv_core.CV_8UC3,
                new Scalar(128.0, 128.0, 128.0, 0.0));
    }

    @AfterEach
    void tearDown() {
        if (redCastFlat != null) redCastFlat.release();
        if (grayFlat    != null) grayFlat.release();
    }

    @Test
    void registryResolvesAce() {
        assertTrue(registry.contains("ace"));
        assertNotNull(registry.get("ace"));
    }

    @Test
    void dimensionsPreserved() {
        Map<String, Object> params = new HashMap<>();
        Mat result = registry.get("ace").apply(redCastFlat, params);
        assertNotNull(result);
        assertEquals(redCastFlat.rows(), result.rows());
        assertEquals(redCastFlat.cols(), result.cols());
        assertEquals(redCastFlat.channels(), result.channels());
        result.release();
    }

    @Test
    void outputIsUint8ThreeChannel() {
        Map<String, Object> params = new HashMap<>();
        Mat result = registry.get("ace").apply(redCastFlat, params);
        assertEquals(opencv_core.CV_8U, result.depth());
        assertEquals(3, result.channels());
        result.release();
    }

    @Test
    void flatCastImageBecomesUniform() {
        // A flat image has zero local variance → all channels normalise to ~128.
        // The channel gap should collapse from 150 (R-B) to near 0.
        double gapBefore = Math.abs(channelMean(redCastFlat, 2)
                - channelMean(redCastFlat, 0));

        Map<String, Object> params = Map.of("alpha", 5.0, "subsample", 4);
        Mat result = registry.get("ace").apply(redCastFlat, params);

        double gapAfter = Math.abs(channelMean(result, 2) - channelMean(result, 0));

        assertTrue(gapAfter < gapBefore * 0.3,
                "ACE should greatly reduce channel skew on a flat cast image; "
                        + "before=" + gapBefore + " after=" + gapAfter);
        result.release();
    }

    @Test
    void neutralFlatImageStaysNear128() {
        // A uniform gray flat image: all channels trivially normalise to 128.
        Map<String, Object> params = Map.of("alpha", 5.0, "subsample", 4);
        Mat result = registry.get("ace").apply(grayFlat, params);

        double meanR = channelMean(result, 2);
        double meanG = channelMean(result, 1);
        double meanB = channelMean(result, 0);

        assertEquals(128.0, meanR, 3.0, "R channel of neutral gray should be ~128");
        assertEquals(128.0, meanG, 3.0, "G channel of neutral gray should be ~128");
        assertEquals(128.0, meanB, 3.0, "B channel of neutral gray should be ~128");
        result.release();
    }

    @Test
    void defaultParamsRunWithoutError() {
        Mat result = registry.get("ace").apply(redCastFlat, new HashMap<>());
        assertNotNull(result);
        assertTrue(result.rows() > 0);
        result.release();
    }

    // -------------------------------------------------------------------------

    /** Mean pixel value for the given 0-based channel index in a CV_8UC3 Mat. */
    private static double channelMean(Mat bgr, int channel) {
        MatVector ch = new MatVector(3);
        opencv_core.split(bgr, ch);
        Mat mean   = new Mat();
        Mat stddev = new Mat();
        opencv_core.meanStdDev(ch.get(channel), mean, stddev);
        DoubleIndexer mi = mean.createIndexer();
        double m = mi.get(0, 0);
        mi.release();
        mean.release();
        stddev.release();
        ch.close();
        return m;
    }
}
