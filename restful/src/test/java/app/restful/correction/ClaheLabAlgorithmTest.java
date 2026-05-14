package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
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
import app.restful.services.correction.contrast.ClaheLabAlgorithm;

@SpringBootTest
public class ClaheLabAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    private Mat flatImage;        // 100x100 mid-gray — no local contrast
    private Mat gradientImage;    // horizontal gradient 0..255 — natural contrast

    @BeforeEach
    void setUp() {
        flatImage = new Mat(100, 100, opencv_core.CV_8UC3, new Scalar(128.0, 128.0, 128.0, 0.0));

        gradientImage = new Mat(100, 100, opencv_core.CV_8UC3);
        UByteIndexer idx = gradientImage.createIndexer();
        for (int y = 0; y < 100; y++) {
            for (int x = 0; x < 100; x++) {
                int v = (int) Math.round((x / 99.0) * 255.0);
                idx.put(y, x, 0, v);
                idx.put(y, x, 1, v);
                idx.put(y, x, 2, v);
            }
        }
        idx.release();
    }

    @AfterEach
    void tearDown() {
        if (flatImage != null) flatImage.release();
        if (gradientImage != null) gradientImage.release();
    }

    @Test
    void registryResolvesClaheLab() {
        assertTrue(registry.contains("clahe_lab"));
        assertNotNull(registry.get("clahe_lab"));
    }

    @Test
    void claheLeavesDimensionsUnchanged() {
        Map<String, Object> params = new HashMap<>();
        Mat result = registry.get("clahe_lab").apply(gradientImage, params);
        assertNotNull(result);
        assertEquals(gradientImage.rows(), result.rows());
        assertEquals(gradientImage.cols(), result.cols());
        assertEquals(gradientImage.channels(), result.channels());
        result.release();
    }

    @Test
    void claheFlatImageStaysFlat() {
        // Histogram equalization on a single-valued histogram remaps the single
        // populated bin to the top of the CDF, so the absolute value is not
        // preserved — but the result must remain *uniform*. Verify by checking
        // L* stddev is ~0 after the pass.
        Map<String, Object> params = new HashMap<>();
        Mat result = registry.get("clahe_lab").apply(flatImage, params);
        assertNotNull(result);
        double std = stdDevL(result);
        assertTrue(std < 2.0, "Flat input should remain uniform; L* stddev=" + std);
        result.release();
    }

    @Test
    void claheIncreasesLocalContrastOnLowContrastInput() {
        // Build a low-contrast image: center square at 130 inside background at 126.
        Mat lowContrast = new Mat(100, 100, opencv_core.CV_8UC3, new Scalar(126.0, 126.0, 126.0, 0.0));
        UByteIndexer idx = lowContrast.createIndexer();
        for (int y = 30; y < 70; y++) {
            for (int x = 30; x < 70; x++) {
                idx.put(y, x, 0, 130);
                idx.put(y, x, 1, 130);
                idx.put(y, x, 2, 130);
            }
        }
        idx.release();

        // Measure stddev of L* before / after.
        double beforeStd = stdDevL(lowContrast);
        Mat result = registry.get("clahe_lab").apply(lowContrast, Map.of("clipLimit", 4.0));
        double afterStd = stdDevL(result);

        assertTrue(afterStd > beforeStd,
                "CLAHE should raise L* stddev; before=" + beforeStd + " after=" + afterStd);

        lowContrast.release();
        result.release();
    }

    @Test
    void claheAcceptsCoreParams() {
        Mat result = ClaheLabAlgorithm.applyCore(gradientImage, 3.0, 4);
        assertNotNull(result);
        assertEquals(gradientImage.size().width(),  result.size().width());
        assertEquals(gradientImage.size().height(), result.size().height());
        result.release();
    }

    private static double stdDevL(Mat bgr) {
        Mat lab = new Mat();
        opencv_imgproc.cvtColor(bgr, lab, opencv_imgproc.COLOR_BGR2Lab);
        org.bytedeco.opencv.opencv_core.MatVector ch = new org.bytedeco.opencv.opencv_core.MatVector(3);
        opencv_core.split(lab, ch);
        Mat mean = new Mat();
        Mat std  = new Mat();
        opencv_core.meanStdDev(ch.get(0), mean, std);
        org.bytedeco.javacpp.indexer.DoubleIndexer stdIdx = std.createIndexer();
        double value = stdIdx.get(0);
        stdIdx.release();
        mean.release(); std.release(); ch.close(); lab.release();
        return value;
    }
}
