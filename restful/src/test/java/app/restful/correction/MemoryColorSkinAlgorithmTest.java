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
import app.restful.services.correction.skin.MemoryColorSkinAlgorithm;

@SpringBootTest
public class MemoryColorSkinAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    private Mat skinPatch;      // canonical mid-tone skin — passes SkinMask gates
    private Mat blueSky;        // non-skin, must be untouched

    @BeforeEach
    void setUp() {
        // Canonical mid-tone skin BGR ≈ (140, 160, 200): HSV H≈10, YCrCb Cr≈150 —
        // both inside SkinMask. Its Lab chroma sits well off the (a≈22, b≈17)
        // memory-colour target so adaptation produces a measurable shift.
        skinPatch = new Mat(80, 80, opencv_core.CV_8UC3, new Scalar(140.0, 160.0, 200.0, 0.0));
        blueSky   = new Mat(60, 60, opencv_core.CV_8UC3, new Scalar(200.0, 120.0, 40.0, 0.0));
    }

    @AfterEach
    void tearDown() {
        if (skinPatch != null) skinPatch.release();
        if (blueSky != null) blueSky.release();
    }

    @Test
    void registryResolvesMemoryColorSkin() {
        assertTrue(registry.contains("memory_color_skin"));
    }

    @Test
    void dimensionsPreserved() {
        Mat out = registry.get("memory_color_skin").apply(skinPatch, Map.of());
        assertNotNull(out);
        assertEquals(skinPatch.rows(), out.rows());
        assertEquals(skinPatch.cols(), out.cols());
        assertEquals(3, out.channels());
        out.release();
    }

    @Test
    void skinMovesTowardTarget() {
        // Target centroid = L=68, C=28, h=38° → a ≈ 22, b ≈ 17 in Lab.
        // We check that after correction, the skin pixel in our test field has moved.
        UByteIndexer idxBefore = skinPatch.createIndexer();
        int[] pb = new int[3];
        idxBefore.get(40, 40, pb);
        idxBefore.release();

        Mat out = registry.get("memory_color_skin").apply(skinPatch,
                Map.of("adaptationStrength", 1.0));

        UByteIndexer idxAfter = out.createIndexer();
        int[] pa = new int[3];
        idxAfter.get(40, 40, pa);
        idxAfter.release();

        // At least one channel should change meaningfully under full adaptation.
        int totalDelta = Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) + Math.abs(pa[2] - pb[2]);
        assertTrue(totalDelta > 5,
                "Skin pixel should shift under memory-colour correction; delta=" + totalDelta);
        out.release();
    }

    @Test
    void blueSkyStaysBlue() {
        UByteIndexer idxBefore = blueSky.createIndexer();
        int[] pb = new int[3];
        idxBefore.get(30, 30, pb);
        idxBefore.release();

        Mat out = registry.get("memory_color_skin").apply(blueSky,
                Map.of("adaptationStrength", 1.0));

        UByteIndexer idxAfter = out.createIndexer();
        int[] pa = new int[3];
        idxAfter.get(30, 30, pa);
        idxAfter.release();

        // Sky should be almost completely untouched (mask ≈ 0 here).
        int totalDelta = Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) + Math.abs(pa[2] - pb[2]);
        assertTrue(totalDelta < 20,
                "Non-skin pixels should barely move; delta=" + totalDelta);
        out.release();
    }

    @Test
    void strengthZeroIsIdentity() {
        Mat out = registry.get("memory_color_skin").apply(skinPatch,
                Map.of("adaptationStrength", 0.0));
        UByteIndexer a = skinPatch.createIndexer();
        UByteIndexer b = out.createIndexer();
        int[] pa = new int[3]; int[] pb = new int[3];
        a.get(40, 40, pa); b.get(40, 40, pb);
        a.release(); b.release();
        assertEquals(pa[0], pb[0], 4);
        assertEquals(pa[1], pb[1], 4);
        assertEquals(pa[2], pb[2], 4);
        out.release();
    }

    @Test
    void coreApiReachable() {
        // Target (L=68, C=28, h=38°) → a ≈ 22, b ≈ 17.
        Mat out = MemoryColorSkinAlgorithm.applyCore(skinPatch, 0.6, 22.0, 17.0);
        assertNotNull(out);
        out.release();
    }
}
