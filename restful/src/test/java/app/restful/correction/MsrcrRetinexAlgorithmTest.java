package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.Map;

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
public class MsrcrRetinexAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    private Mat darkImage;    // uniform dark — retinex should lift it substantially
    private Mat midGrayImage; // neutral mid-gray — used for blend=0 identity check

    @BeforeEach
    void setUp() {
        // MSRCR is a local-contrast operator: log(I+1) - log(blur(I)+1) is 0
        // everywhere on a flat field, so it cannot lift a uniform image.
        // Build a low-mean image with deterministic vertical gradient detail
        // so the multi-scale residual carries real signal.
        darkImage = new Mat(100, 100, opencv_core.CV_8UC3);
        org.bytedeco.javacpp.indexer.UByteIndexer di = darkImage.createIndexer();
        int[] px = new int[3];
        for (int y = 0; y < 100; y++) {
            int v = 8 + (y * 34) / 99;            // ramp 8 → 42
            px[0] = v; px[1] = v; px[2] = v;
            for (int x = 0; x < 100; x++) di.put(y, x, px);
        }
        di.release();

        midGrayImage = new Mat(100, 100, opencv_core.CV_8UC3,
                new Scalar(128.0, 128.0, 128.0, 0.0));
    }

    @AfterEach
    void tearDown() {
        if (darkImage    != null) darkImage.release();
        if (midGrayImage != null) midGrayImage.release();
    }

    @Test
    void registryResolvesRetinex() {
        assertTrue(registry.contains("msrcr_retinex"));
        assertNotNull(registry.get("msrcr_retinex"));
    }

    @Test
    void dimensionsPreserved() {
        Map<String, Object> params = new HashMap<>();
        Mat result = registry.get("msrcr_retinex").apply(darkImage, params);
        assertNotNull(result);
        assertEquals(darkImage.rows(), result.rows());
        assertEquals(darkImage.cols(), result.cols());
        assertEquals(darkImage.channels(), result.channels());
        result.release();
    }

    @Test
    void outputIsUint8ThreeChannel() {
        Map<String, Object> params = new HashMap<>();
        Mat result = registry.get("msrcr_retinex").apply(darkImage, params);
        assertEquals(opencv_core.CV_8U, result.depth());
        assertEquals(3, result.channels());
        result.release();
    }

    @Test
    void retinexBrightensLowExposureImage() {
        Map<String, Object> params = Map.of("strength", 1.0);
        Mat result = registry.get("msrcr_retinex").apply(darkImage, params);
        double meanBefore = meanLuminance(darkImage);
        double meanAfter  = meanLuminance(result);
        assertTrue(meanAfter > meanBefore + 20,
                "Retinex should significantly brighten a dark image; "
                        + "before=" + meanBefore + " after=" + meanAfter);
        result.release();
    }

    @Test
    void strengthZeroPassesThroughOriginal() {
        Map<String, Object> params = Map.of("strength", 0.0);
        Mat result = registry.get("msrcr_retinex").apply(midGrayImage, params);

        UByteIndexer src = midGrayImage.createIndexer();
        UByteIndexer dst = result.createIndexer();
        int[] a = new int[3];
        int[] b = new int[3];
        src.get(50, 50, a);
        dst.get(50, 50, b);
        src.release();
        dst.release();

        assertEquals(a[0], b[0], 2);
        assertEquals(a[1], b[1], 2);
        assertEquals(a[2], b[2], 2);
        result.release();
    }

    @Test
    void defaultParamsRunWithoutError() {
        // Smoke test: default parameters should complete without throwing
        Mat result = registry.get("msrcr_retinex").apply(darkImage, new HashMap<>());
        assertNotNull(result);
        assertTrue(result.rows() > 0);
        result.release();
    }

    // -------------------------------------------------------------------------

    private static double meanLuminance(Mat bgr) {
        Mat gray = new Mat();
        opencv_imgproc.cvtColor(bgr, gray, opencv_imgproc.COLOR_BGR2GRAY);
        Mat mean   = new Mat();
        Mat stddev = new Mat();
        opencv_core.meanStdDev(gray, mean, stddev);
        DoubleIndexer mi = mean.createIndexer();
        double m = mi.get(0, 0);
        mi.release();
        mean.release();
        stddev.release();
        gray.release();
        return m;
    }
}
