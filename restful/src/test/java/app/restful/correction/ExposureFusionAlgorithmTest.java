package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgcodecs;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import app.restful.services.correction.CorrectionRegistry;
import app.restful.services.correction.hdr.ExposureFusionAlgorithm;

@SpringBootTest
public class ExposureFusionAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    @TempDir
    Path tempDir;

    private Mat dummy;            // ignored by the algorithm but required for apply()
    private Path underPath;
    private Path midPath;
    private Path overPath;

    @BeforeEach
    void setUp() throws IOException {
        dummy = new Mat(48, 48, opencv_core.CV_8UC3, new Scalar(128.0, 128.0, 128.0, 0.0));

        // Three "exposures" of a flat grey at increasing brightness.
        Mat under = new Mat(48, 48, opencv_core.CV_8UC3, new Scalar(60.0, 60.0, 60.0, 0.0));
        Mat mid   = new Mat(48, 48, opencv_core.CV_8UC3, new Scalar(128.0, 128.0, 128.0, 0.0));
        Mat over  = new Mat(48, 48, opencv_core.CV_8UC3, new Scalar(220.0, 220.0, 220.0, 0.0));

        underPath = tempDir.resolve("under.png");
        midPath   = tempDir.resolve("mid.png");
        overPath  = tempDir.resolve("over.png");
        opencv_imgcodecs.imwrite(underPath.toString(), under);
        opencv_imgcodecs.imwrite(midPath.toString(),   mid);
        opencv_imgcodecs.imwrite(overPath.toString(),  over);
        under.release();
        mid.release();
        over.release();
    }

    @AfterEach
    void tearDown() {
        if (dummy != null) dummy.release();
    }

    @Test
    void registryResolvesExposureFusion() {
        assertTrue(registry.contains("exposure_fusion"));
    }

    @Test
    void missingPathsThrows() {
        assertThrows(IllegalArgumentException.class, () ->
                registry.get("exposure_fusion").apply(dummy, Map.of()));
    }

    @Test
    void invalidPathThrows() {
        assertThrows(IllegalArgumentException.class, () ->
                registry.get("exposure_fusion").apply(dummy,
                        Map.of("imagePaths", "/nonexistent/path/foo.png")));
    }

    @Test
    void fusedImageMatchesBracketGeometry() {
        String csv = String.join(",", underPath.toString(), midPath.toString(), overPath.toString());
        Mat out = registry.get("exposure_fusion").apply(dummy, Map.of("imagePaths", csv));
        assertNotNull(out);
        assertEquals(48, out.rows());
        assertEquals(48, out.cols());
        assertEquals(3,  out.channels());
        assertEquals(opencv_core.CV_8U, out.depth());
        out.release();
    }

    @Test
    void coreApiReachable() {
        String csv = String.join(",", underPath.toString(), midPath.toString(), overPath.toString());
        Mat out = ExposureFusionAlgorithm.applyCore(dummy, csv, 1.0, 1.0, 1.0);
        assertNotNull(out);
        out.release();
    }
}
