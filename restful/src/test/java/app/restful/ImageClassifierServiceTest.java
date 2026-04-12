package app.restful;

import app.restful.config.ClassifierThresholds;
import app.restful.dto.ImageFeatures;
import app.restful.dto.ImageIssue;
import app.restful.services.ImageClassifierService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for ImageClassifierService.
 * Tests rule-based classification logic for image quality issues.
 */
public class ImageClassifierServiceTest {

    private ImageClassifierService classifier;
    private ClassifierThresholds thresholds;

    @BeforeEach
    void setUp() {
        // Initialize with default thresholds from application.yaml
        thresholds = new ClassifierThresholds();
        thresholds.setUnderexpMedianMax(0.30);
        thresholds.setUnderexpBlackTailMinPct(0.07);
        thresholds.setOverexpMedianMin(0.70);
        thresholds.setOverexpWhiteTailMinPct(0.05);
        thresholds.setBlackClipLevel(0.03);
        thresholds.setWhiteClipLevel(0.97);
        thresholds.setLowContrastMinSpan(0.45);
        thresholds.setHighContrastTailPct(0.10);
        thresholds.setDullMeanSMax(0.12);
        thresholds.setDullP95SMax(0.25);
        thresholds.setOverSatGlobalP95Min(0.85);
        thresholds.setOverSatChannelP95Min(0.90);
        thresholds.setCastABDistMin(6.0);
        thresholds.setNoiseShadowMinRatio(0.06);
        thresholds.setShadowMaskThreshold(0.35);
        thresholds.setSkinDetectMinPixels(500);
        thresholds.setSkinSatMin(0.18);
        thresholds.setSkinSatMax(0.68);
        thresholds.setSkinLineDeg(25.0);
        thresholds.setSkinLineTolDeg(12.0);
        thresholds.setSkinOverSatMin(0.70);

        classifier = new ImageClassifierService(thresholds);
    }

    /**
     * Helper: Creates ImageFeatures with specified values
     */
    private ImageFeatures createFeatures(
        int width, int height, double medianY, double meanY, double p5Y, double p95Y,
        double blackPct, double whitePct, double stdY, double meanS, double p95S,
        boolean overRed, boolean overGreen, boolean overBlue, boolean overCyan,
        boolean overMagenta, boolean overYellow, double labAMean, double labBMean,
        double abDist, double castAngle, double noiseRatio,
        boolean hasSkin, double skinHueMean, double skinSatMean
    ) {
        return new ImageFeatures(
            width, height, medianY, meanY, p5Y, p95Y, blackPct, whitePct, stdY,
            meanS, p95S, overRed, overGreen, overBlue, overCyan, overMagenta, overYellow,
            labAMean, labBMean, abDist, castAngle, noiseRatio,
            hasSkin, skinHueMean, skinSatMean
        );
    }

    @Test
    @DisplayName("Perfect image - should have no issues")
    void testPerfectImage() {
        ImageFeatures features = createFeatures(
            800, 600, 0.50, 0.50, 0.10, 0.90,  // Well-exposed
            0.02, 0.02, 0.15,                   // Good contrast
            0.30, 0.50,                          // Good saturation
            false, false, false, false, false, false,  // No oversaturation
            0.0, 0.0, 3.0, 0.0, 0.02,          // No cast, no noise
            false, 0.0, 0.0                     // No skin
        );

        List<ImageIssue> issues = classifier.classify(features);
        assertTrue(issues.isEmpty(), "Perfect image should have no issues");
    }

    @Test
    @DisplayName("Underexposed image - should detect exposure increase needed")
    void testUnderexposedImage() {
        ImageFeatures features = createFeatures(
            800, 600, 0.20, 0.25, 0.05, 0.40,  // Dark
            0.15, 0.01, 0.10,                   // High black clipping
            0.20, 0.40,
            false, false, false, false, false, false,
            0.0, 0.0, 2.0, 0.0, 0.01,
            false, 0.0, 0.0
        );

        List<ImageIssue> issues = classifier.classify(features);
        assertTrue(issues.contains(ImageIssue.Needs_Exposure_Increase));
    }

    @Test
    @DisplayName("Overexposed image - should detect exposure decrease needed")
    void testOverexposedImage() {
        ImageFeatures features = createFeatures(
            800, 600, 0.80, 0.75, 0.60, 0.95,  // Bright
            0.01, 0.10, 0.10,                   // High white clipping
            0.20, 0.40,
            false, false, false, false, false, false,
            0.0, 0.0, 2.0, 0.0, 0.01,
            false, 0.0, 0.0
        );

        List<ImageIssue> issues = classifier.classify(features);
        assertTrue(issues.contains(ImageIssue.Needs_Exposure_Decrease));
    }

    @Test
    @DisplayName("Low contrast image - should detect contrast increase needed")
    void testLowContrastImage() {
        ImageFeatures features = createFeatures(
            800, 600, 0.50, 0.50, 0.45, 0.55,  // Narrow range
            0.01, 0.01, 0.05,                   // Low std
            0.20, 0.40,
            false, false, false, false, false, false,
            0.0, 0.0, 2.0, 0.0, 0.01,
            false, 0.0, 0.0
        );

        List<ImageIssue> issues = classifier.classify(features);
        assertTrue(issues.contains(ImageIssue.Needs_Contrast_Increase));
    }

    @Test
    @DisplayName("High contrast image - should detect contrast decrease needed")
    void testHighContrastImage() {
        ImageFeatures features = createFeatures(
            800, 600, 0.50, 0.50, 0.05, 0.95,
            0.08, 0.08, 0.30,                   // High tail clipping
            0.20, 0.40,
            false, false, false, false, false, false,
            0.0, 0.0, 2.0, 0.0, 0.01,
            false, 0.0, 0.0
        );

        List<ImageIssue> issues = classifier.classify(features);
        assertTrue(issues.contains(ImageIssue.Needs_Contrast_Decrease));
    }

    @Test
    @DisplayName("Dull/desaturated image - should detect saturation increase needed")
    void testDullImage() {
        ImageFeatures features = createFeatures(
            800, 600, 0.50, 0.50, 0.10, 0.90,
            0.02, 0.02, 0.15,
            0.08, 0.20,                          // Low saturation
            false, false, false, false, false, false,
            0.0, 0.0, 2.0, 0.0, 0.01,
            false, 0.0, 0.0
        );

        List<ImageIssue> issues = classifier.classify(features);
        assertTrue(issues.contains(ImageIssue.Needs_Saturation_Increase));
    }

    @Test
    @DisplayName("Globally oversaturated image - should detect oversaturation")
    void testOversaturatedImage() {
        ImageFeatures features = createFeatures(
            800, 600, 0.50, 0.50, 0.10, 0.90,
            0.02, 0.02, 0.15,
            0.70, 0.90,                          // High saturation
            false, false, false, false, false, false,
            0.0, 0.0, 2.0, 0.0, 0.01,
            false, 0.0, 0.0
        );

        List<ImageIssue> issues = classifier.classify(features);
        assertTrue(issues.contains(ImageIssue.Oversaturated_Global));
    }

    @Test
    @DisplayName("Channel-specific oversaturation - should detect individual channels")
    void testChannelOversaturation() {
        ImageFeatures features = createFeatures(
            800, 600, 0.50, 0.50, 0.10, 0.90,
            0.02, 0.02, 0.15,
            0.50, 0.70,
            true, false, true, false, true, false,  // Red, Blue, Magenta oversaturated
            0.0, 0.0, 2.0, 0.0, 0.01,
            false, 0.0, 0.0
        );

        List<ImageIssue> issues = classifier.classify(features);
        assertTrue(issues.contains(ImageIssue.Oversaturated_Red));
        assertTrue(issues.contains(ImageIssue.Oversaturated_Blue));
        assertTrue(issues.contains(ImageIssue.Oversaturated_Magenta));
        assertFalse(issues.contains(ImageIssue.Oversaturated_Green));
    }

    @Test
    @DisplayName("Color cast detection - should identify cast direction")
    void testColorCast() {
        // Cyan cast (negative red, positive blue in Lab)
        ImageFeatures features = createFeatures(
            800, 600, 0.50, 0.50, 0.10, 0.90,
            0.02, 0.02, 0.15,
            0.30, 0.50,
            false, false, false, false, false, false,
            -8.0, 5.0, 9.43, 148.0, 0.01,      // Cast angle ~148° (cyan)
            false, 0.0, 0.0
        );

        List<ImageIssue> issues = classifier.classify(features);
        assertTrue(issues.stream().anyMatch(i -> i.name().startsWith("ColorCast_")));
    }

    @Test
    @DisplayName("Noisy shadows - should detect noise reduction needed")
    void testNoisyShadows() {
        ImageFeatures features = createFeatures(
            800, 600, 0.50, 0.50, 0.10, 0.90,
            0.02, 0.02, 0.15,
            0.30, 0.50,
            false, false, false, false, false, false,
            0.0, 0.0, 2.0, 0.0, 0.10,          // High noise ratio
            false, 0.0, 0.0
        );

        List<ImageIssue> issues = classifier.classify(features);
        assertTrue(issues.contains(ImageIssue.Needs_Noise_Reduction));
    }

    @Test
    @DisplayName("Multiple issues - should detect all applicable problems")
    void testMultipleIssues() {
        ImageFeatures features = createFeatures(
            800, 600, 0.25, 0.30, 0.05, 0.50,  // Underexposed
            0.10, 0.02, 0.08,                   // Low contrast
            0.10, 0.22,                          // Dull
            false, false, false, false, false, false,
            5.0, 8.0, 9.43, 58.0, 0.08,        // Color cast + noise
            false, 0.0, 0.0
        );

        List<ImageIssue> issues = classifier.classify(features);
        
        assertTrue(issues.size() >= 3, "Should detect multiple issues");
        assertTrue(issues.contains(ImageIssue.Needs_Exposure_Increase));
        assertTrue(issues.contains(ImageIssue.Needs_Saturation_Increase));
    }

    @Test
    @DisplayName("Edge case - zero dimensions should not crash")
    void testZeroDimensions() {
        ImageFeatures features = createFeatures(
            0, 0, 0.50, 0.50, 0.10, 0.90,
            0.02, 0.02, 0.15,
            0.30, 0.50,
            false, false, false, false, false, false,
            0.0, 0.0, 2.0, 0.0, 0.01,
            false, 0.0, 0.0
        );

        assertDoesNotThrow(() -> classifier.classify(features));
    }

    @Test
    @DisplayName("Skin tone detection - green tint")
    void testSkinToneGreenTint() {
        ImageFeatures features = createFeatures(
            800, 600, 0.50, 0.50, 0.10, 0.90,
            0.02, 0.02, 0.15,
            0.30, 0.50,
            false, false, false, false, false, false,
            0.0, 0.0, 2.0, 0.0, 0.01,
            true, 50.0, 0.35                    // Skin with green hue
        );

        List<ImageIssue> issues = classifier.classify(features);
        assertTrue(issues.contains(ImageIssue.SkinTone_Too_Green));
    }
}
