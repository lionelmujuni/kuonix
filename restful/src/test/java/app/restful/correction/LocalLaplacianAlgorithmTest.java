package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
import app.restful.services.correction.tone.LocalLaplacianAlgorithm;

@SpringBootTest
public class LocalLaplacianAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    private Mat highContrast;   // half black, half white — measures compression
    private Mat midGray;        // uniform — should be near-identity

    @BeforeEach
    void setUp() {
        // Top half black, bottom half white. Generates the largest |d| edge possible.
        highContrast = new Mat(64, 64, opencv_core.CV_8UC3, new Scalar(0.0, 0.0, 0.0, 0.0));
        UByteIndexer idx = highContrast.createIndexer();
        for (int y = 32; y < 64; y++) {
            for (int x = 0; x < 64; x++) {
                idx.put(y, x, 0, 255);
                idx.put(y, x, 1, 255);
                idx.put(y, x, 2, 255);
            }
        }
        idx.release();

        midGray = new Mat(48, 48, opencv_core.CV_8UC3, new Scalar(128.0, 128.0, 128.0, 0.0));
    }

    @AfterEach
    void tearDown() {
        if (highContrast != null) highContrast.release();
        if (midGray != null) midGray.release();
    }

    @Test
    void registryResolvesLocalLaplacian() {
        assertTrue(registry.contains("local_laplacian"));
    }

    @Test
    void dimensionsPreserved() {
        Mat out = registry.get("local_laplacian").apply(highContrast, Map.of());
        assertNotNull(out);
        assertEquals(highContrast.rows(), out.rows());
        assertEquals(highContrast.cols(), out.cols());
        assertEquals(3, out.channels());
        assertEquals(opencv_core.CV_8U, out.depth());
        out.release();
    }

    @Test
    void uniformImageIsNearIdentity() {
        // A flat field has no detail or edges — the remap is identity at the
        // pixel's own brightness, so output should match input within float noise.
        Mat out = registry.get("local_laplacian").apply(midGray, Map.of());
        UByteIndexer a = midGray.createIndexer();
        UByteIndexer b = out.createIndexer();
        int[] pa = new int[3]; int[] pb = new int[3];
        a.get(20, 20, pa); b.get(20, 20, pb);
        a.release(); b.release();
        assertEquals(pa[0], pb[0], 4);
        assertEquals(pa[1], pb[1], 4);
        assertEquals(pa[2], pb[2], 4);
        out.release();
    }

    @Test
    void compressionReducesGlobalStdDev() {
        // With beta < 1 and a strong sigma we should compress the black/white edge.
        double stdBefore = stdDevLuma(highContrast);
        Mat out = registry.get("local_laplacian").apply(highContrast,
                Map.of("alpha", 1.0, "beta", 0.3, "sigma", 0.2));
        double stdAfter = stdDevLuma(out);
        assertTrue(stdAfter < stdBefore,
                "Tone compression should reduce contrast; before=" + stdBefore
                        + " after=" + stdAfter);
        out.release();
    }

    @Test
    void coreApiReachable() {
        Mat out = LocalLaplacianAlgorithm.applyCore(highContrast, 0.4, 0.5, 0.2);
        assertNotNull(out);
        out.release();
    }

    private static double stdDevLuma(Mat bgr) {
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
