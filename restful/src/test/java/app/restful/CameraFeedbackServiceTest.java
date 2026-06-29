package app.restful;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import app.restful.dto.CameraFeedback;
import app.restful.dto.ExifData;
import app.restful.dto.ImageIssue;
import app.restful.dto.ResourceLink;
import app.restful.services.CameraFeedbackService;
import app.restful.services.CameraKnowledgeBase;
import app.restful.services.ResourceLinkService;

/**
 * Unit tests for the knowledge-base-driven CameraFeedbackService. Loads the
 * real photography/camera-feedback.yaml off the classpath (no Spring context).
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
public class CameraFeedbackServiceTest {

    private CameraFeedbackService service;

    @BeforeAll
    void setup() {
        CameraKnowledgeBase kb = new CameraKnowledgeBase();
        kb.load();
        service = new CameraFeedbackService(kb, new ResourceLinkService());
    }

    // ISO=value, no other EXIF.
    private static ExifData exifIso(int iso) {
        return new ExifData(iso, null, null, null, null, null, null, null);
    }

    private static ExifData exifWb(String wbMode) {
        return new ExifData(null, null, null, null, null, null, null, wbMode);
    }

    private static CameraFeedback only(List<CameraFeedback> fb) {
        assertEquals(1, fb.size(), "expected exactly one feedback entry, got " + fb);
        return fb.get(0);
    }

    @Test
    void knowledgeBaseLoadsCoreIssues() {
        CameraKnowledgeBase kb = new CameraKnowledgeBase();
        kb.load();
        assertTrue(kb.knownIssues().contains("Needs_Noise_Reduction"));
        assertTrue(kb.knownIssues().contains("ColorCast_Blue"));   // shared anchor entry
        assertTrue(kb.knownIssues().contains("SkinTone_Too_Magenta"));
        assertTrue(kb.knownIssues().contains("Hazy"));
        // Post-only / compositional issues intentionally have no camera tip.
        assertFalse(kb.knownIssues().contains("Needs_Contrast_Increase"));
        assertFalse(kb.knownIssues().contains("Oversaturated_Global"));
    }

    @Test
    void highIsoNoiseIsHighSeverityAndInterpolatesIso() {
        CameraFeedback fb = only(service.evaluate(List.of(ImageIssue.Needs_Noise_Reduction), exifIso(6400)));
        assertEquals("Needs_Noise_Reduction", fb.issue());
        assertEquals("high", fb.severity());
        assertTrue(fb.tip().contains("6400"), "tip should interpolate the ISO: " + fb.tip());
        assertFalse(fb.tip().contains("{iso}"), "placeholder must be substituted");
    }

    @Test
    void lowIsoNoiseSuggestsUnderexposure() {
        CameraFeedback fb = only(service.evaluate(List.of(ImageIssue.Needs_Noise_Reduction), exifIso(400)));
        assertEquals("medium", fb.severity());
        assertTrue(fb.tip().contains("400"));
        assertTrue(fb.tip().toLowerCase().contains("underexposure"));
    }

    @Test
    void midIsoNoiseFallsBackToBaseTip() {
        // ISO 1600 matches neither >3200 nor <=800 → base tip.
        CameraFeedback fb = only(service.evaluate(List.of(ImageIssue.Needs_Noise_Reduction), exifIso(1600)));
        assertEquals("medium", fb.severity());
        assertTrue(fb.tip().toLowerCase().contains("tripod"));
    }

    @Test
    void exposureIncreaseAtHighIsoFavoursAperture() {
        CameraFeedback fb = only(service.evaluate(List.of(ImageIssue.Needs_Exposure_Increase), exifIso(3200)));
        assertEquals("medium", fb.severity());
        assertTrue(fb.tip().contains("3200"));
        assertTrue(fb.tip().toLowerCase().contains("aperture"));
    }

    @Test
    void exposureIncreaseAtLowIsoUsesBaseTip() {
        CameraFeedback fb = only(service.evaluate(List.of(ImageIssue.Needs_Exposure_Increase), exifIso(200)));
        assertEquals("low", fb.severity());
        assertTrue(fb.tip().toLowerCase().contains("exposure compensation"));
    }

    @Test
    void colorCastWithAutoWbSuggestsCustomWb() {
        CameraFeedback fb = only(service.evaluate(List.of(ImageIssue.ColorCast_Blue), exifWb("AUTO")));
        assertEquals("medium", fb.severity());
        assertTrue(fb.tip().toLowerCase().contains("auto wb"));
    }

    @Test
    void colorCastWithManualWbSuggestsGreyCard() {
        CameraFeedback fb = only(service.evaluate(List.of(ImageIssue.ColorCast_Magenta), exifWb("MANUAL")));
        assertEquals("medium", fb.severity());
        assertTrue(fb.tip().toLowerCase().contains("grey card"));
    }

    @Test
    void colorCastWithoutWbUsesBaseTip() {
        CameraFeedback fb = only(service.evaluate(List.of(ImageIssue.ColorCast_Yellow), exifIso(100)));
        assertEquals("low", fb.severity());
        assertTrue(fb.tip().toLowerCase().contains("white balance"));
    }

    @Test
    void issueWithoutCameraRemedyProducesNoFeedback() {
        assertTrue(service.evaluate(List.of(ImageIssue.Needs_Contrast_Increase), exifIso(100)).isEmpty());
        assertTrue(service.evaluate(List.of(ImageIssue.Oversaturated_Global), exifIso(100)).isEmpty());
    }

    @Test
    void slowHandheldShutterFlagsMotionBlur() {
        // 1/50 s at 200 mm violates the ~1/200 s reciprocal-rule minimum.
        ExifData exif = new ExifData(null, "1/50", null, 200.0, null, null, null, null);
        // Pair with an issue that has no camera tip, so motion blur is the only entry.
        CameraFeedback fb = only(service.evaluate(List.of(ImageIssue.Needs_Contrast_Increase), exif));
        assertEquals("MOTION_BLUR", fb.issue());
        assertEquals("high", fb.severity());
    }

    @Test
    void fastShutterDoesNotFlagMotionBlur() {
        ExifData exif = new ExifData(null, "1/500", null, 200.0, null, null, null, null);
        assertTrue(service.evaluate(List.of(ImageIssue.Needs_Contrast_Increase), exif).isEmpty());
    }

    @Test
    void nullOrEmptyIssuesReturnEmpty() {
        assertTrue(service.evaluate(null, exifIso(100)).isEmpty());
        assertTrue(service.evaluate(List.of(), exifIso(100)).isEmpty());
    }

    @Test
    void feedbackCarriesCuratedAndCameraTailoredSearchLinks() {
        ExifData exif = new ExifData(6400, null, null, null, "Canon EOS R5", null, null, null);
        CameraFeedback fb = only(service.evaluate(List.of(ImageIssue.Needs_Noise_Reduction), exif));
        List<ResourceLink> res = fb.resources();

        assertTrue(res.stream().anyMatch(r -> "article".equals(r.type())), "expected a curated article link");

        ResourceLink google = res.stream().filter(r -> r.url().contains("google.com")).findFirst().orElseThrow();
        assertEquals("search", google.type());
        assertTrue(google.url().contains("Canon"), "search query should seed the camera model: " + google.url());
        assertTrue(res.stream().anyMatch(r -> r.url().contains("youtube.com")), "expected a YouTube search link");
    }
}
