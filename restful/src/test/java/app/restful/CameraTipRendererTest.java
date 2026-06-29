package app.restful;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import app.restful.dto.CameraFeedback;
import app.restful.dto.ExifData;
import app.restful.dto.ResourceLink;
import app.restful.services.CameraKnowledgeBase;
import app.restful.services.CameraTipRenderer;
import app.restful.services.TipModel;

/**
 * Unit tests for CameraTipRenderer — verifies graceful fallback when AI is off,
 * bucketed caching, and error resilience. Uses TipModel lambdas, so no
 * LangChain4j or Spring context is needed.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
public class CameraTipRendererTest {

    private CameraKnowledgeBase kb;

    @BeforeAll
    void setup() {
        kb = new CameraKnowledgeBase();
        kb.load();
    }

    private static ExifData exifIso(Integer iso) {
        return new ExifData(iso, null, null, null, null, null, null, null);
    }

    private static CameraFeedback noiseTip(String tip) {
        return new CameraFeedback("Needs_Noise_Reduction", tip, "high");
    }

    @Test
    void aiOffReturnsDeterministicTipsUnchanged() {
        CameraTipRenderer renderer = new CameraTipRenderer(null, kb);
        assertFalse(renderer.aiAvailable());
        List<CameraFeedback> in = List.of(noiseTip("ISO 6400 raw tip"));
        List<CameraFeedback> out = renderer.enrich(in, exifIso(6400));
        assertEquals("ISO 6400 raw tip", out.get(0).tip());
    }

    @Test
    void enrichTonesViaModelAndPreservesIssueAndSeverity() {
        TipModel model = prompt -> "Toned coaching tip.";
        CameraTipRenderer renderer = new CameraTipRenderer(model, kb);
        assertTrue(renderer.aiAvailable());

        CameraFeedback out = renderer.enrich(List.of(noiseTip("ISO 6400 raw tip")), exifIso(6400)).get(0);
        assertEquals("Toned coaching tip.", out.tip());
        assertEquals("Needs_Noise_Reduction", out.issue());
        assertEquals("high", out.severity());
    }

    @Test
    void cachesByIssueAndExifBucket() {
        AtomicInteger calls = new AtomicInteger();
        TipModel model = prompt -> "toned-" + calls.incrementAndGet();
        CameraTipRenderer renderer = new CameraTipRenderer(model, kb);

        // Two shots in the same high-ISO bucket → one model call, cached result reused.
        String first  = renderer.enrich(List.of(noiseTip("a")), exifIso(6400)).get(0).tip();
        String second = renderer.enrich(List.of(noiseTip("b")), exifIso(5000)).get(0).tip();
        assertEquals(1, calls.get(), "same bucket should reuse the cached tip");
        assertEquals(first, second);

        // A low-ISO shot is a different bucket → a second model call.
        renderer.enrich(List.of(noiseTip("c")), exifIso(400));
        assertEquals(2, calls.get(), "different bucket should trigger a new model call");
    }

    @Test
    void modelErrorFallsBackToDeterministicTip() {
        TipModel model = prompt -> { throw new RuntimeException("boom"); };
        CameraTipRenderer renderer = new CameraTipRenderer(model, kb);
        CameraFeedback out = renderer.enrich(List.of(noiseTip("deterministic fallback")), exifIso(6400)).get(0);
        assertEquals("deterministic fallback", out.tip());
    }

    @Test
    void blankModelOutputFallsBackToDeterministicTip() {
        TipModel model = prompt -> "   ";
        CameraTipRenderer renderer = new CameraTipRenderer(model, kb);
        CameraFeedback out = renderer.enrich(List.of(noiseTip("deterministic fallback")), exifIso(6400)).get(0);
        assertEquals("deterministic fallback", out.tip());
    }

    @Test
    void enrichPreservesResourceLinks() {
        TipModel model = prompt -> "Toned coaching tip.";
        CameraTipRenderer renderer = new CameraTipRenderer(model, kb);
        ResourceLink link = new ResourceLink("Guide", "https://example.com", "article");
        CameraFeedback in = new CameraFeedback("Needs_Noise_Reduction", "raw", "high", List.of(link));

        CameraFeedback out = renderer.enrich(List.of(in), exifIso(6400)).get(0);
        assertEquals("Toned coaching tip.", out.tip());
        assertEquals(List.of(link), out.resources(), "resource links must survive AI toning");
    }

    @Test
    void syntheticIssueIsNotTonedOrSentToModel() {
        AtomicInteger calls = new AtomicInteger();
        TipModel model = prompt -> { calls.incrementAndGet(); return "should not be used"; };
        CameraTipRenderer renderer = new CameraTipRenderer(model, kb);

        // MOTION_BLUR is not an ImageIssue enum value → passes through untouched.
        CameraFeedback out = renderer.enrich(
                List.of(new CameraFeedback("MOTION_BLUR", "blur tip", "high")), exifIso(6400)).get(0);
        assertEquals("blur tip", out.tip());
        assertEquals(0, calls.get(), "synthetic issues must not call the model");
    }
}
