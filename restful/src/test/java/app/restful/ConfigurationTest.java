package app.restful;

import app.restful.config.ClassifierThresholds;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration test for Spring Boot configuration.
 * Verifies ClassifierThresholds are properly loaded from application.yaml.
 */
@SpringBootTest
@TestPropertySource("classpath:application.yaml")
public class ConfigurationTest {

    @Autowired
    private ClassifierThresholds thresholds;

    @Test
    @DisplayName("ClassifierThresholds - should load from application.yaml")
    void testThresholdsLoaded() {
        assertNotNull(thresholds, "ClassifierThresholds bean should not be null");
        
        // Verify values match application.yaml (using tolerance for floating point)
        double delta = 0.01;
        assertEquals(0.30, thresholds.getUnderexpMedianMax(), delta, "underexpMedianMax should be 0.30");
        assertEquals(0.07, thresholds.getUnderexpBlackTailMinPct(), delta);
        assertEquals(0.70, thresholds.getOverexpMedianMin(), delta);
        assertEquals(0.05, thresholds.getOverexpWhiteTailMinPct(), delta);
        assertEquals(0.03, thresholds.getBlackClipLevel(), delta);
        assertEquals(0.97, thresholds.getWhiteClipLevel(), delta);
        assertEquals(0.45, thresholds.getLowContrastMinSpan(), delta);
        assertEquals(0.10, thresholds.getHighContrastTailPct(), delta);
        assertEquals(0.12, thresholds.getDullMeanSMax(), delta);
        assertEquals(0.25, thresholds.getDullP95SMax(), delta);
        assertEquals(0.85, thresholds.getOverSatGlobalP95Min(), delta);
        assertEquals(0.90, thresholds.getOverSatChannelP95Min(), delta);
        assertEquals(6.0, thresholds.getCastABDistMin(), delta);
        assertEquals(0.06, thresholds.getNoiseShadowMinRatio(), delta);
        assertEquals(0.35, thresholds.getShadowMaskThreshold(), delta);
        assertEquals(500, thresholds.getSkinDetectMinPixels(), delta);
        assertEquals(0.18, thresholds.getSkinSatMin(), delta);
        assertEquals(0.68, thresholds.getSkinSatMax(), delta);
        assertEquals(25.0, thresholds.getSkinLineDeg(), delta);
        assertEquals(12.0, thresholds.getSkinLineTolDeg(), delta);
        assertEquals(0.70, thresholds.getSkinOverSatMin(), delta);
    }

    @Test
    @DisplayName("Application context - should load successfully")
    void testContextLoads() {
        // If context loads, this test passes
        assertTrue(true);
    }
}
