package app.restful.services;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import app.restful.dto.CameraFeedback;
import app.restful.dto.ExifData;
import app.restful.dto.ImageIssue;
import app.restful.services.CameraKnowledgeBase.IssueKnowledge;

/**
 * Rewrites the deterministic camera tips from {@link CameraFeedbackService}
 * into a warmer, human-toned voice using the AI model, grounded strictly in the
 * {@link CameraKnowledgeBase} facts so it cannot invent settings.
 *
 * <p>The AI dependency is optional: when Ollama is not configured ({@code
 * TipModel} is null) this is a pure pass-through that returns the deterministic
 * tips unchanged — so the UI always works. Results are cached by {@code issue +
 * EXIF bucket} (ISO band / WB mode / focal band) so a whole library of similar
 * shots costs at most one model call per distinct bucket, not one per image.</p>
 */
@Service
public class CameraTipRenderer {

    private static final Logger log = LoggerFactory.getLogger(CameraTipRenderer.class);
    private static final int CACHE_CAP = 500;

    private final TipModel tipModel; // null when AI is not configured
    private final CameraKnowledgeBase knowledgeBase;
    private final Map<String, String> cache = new ConcurrentHashMap<>();

    public CameraTipRenderer(@Autowired(required = false) TipModel tipModel,
                             CameraKnowledgeBase knowledgeBase) {
        this.tipModel = tipModel;
        this.knowledgeBase = knowledgeBase;
    }

    /** True when an AI model is available to tone tips. */
    public boolean aiAvailable() {
        return tipModel != null;
    }

    /**
     * Return a copy of {@code feedback} with each KB-backed tip rewritten in a
     * human tone. When AI is unavailable the input list is returned unchanged.
     */
    public List<CameraFeedback> enrich(List<CameraFeedback> feedback, ExifData exif) {
        if (tipModel == null || feedback == null || feedback.isEmpty()) return feedback;
        List<CameraFeedback> out = new ArrayList<>(feedback.size());
        for (CameraFeedback fb : feedback) {
            out.add(new CameraFeedback(fb.issue(), tone(fb, exif), fb.severity(), fb.resources()));
        }
        return out;
    }

    private String tone(CameraFeedback fb, ExifData exif) {
        // Only knowledge-base issues can be grounded; pass synthetic ones
        // (e.g. MOTION_BLUR) and any unmapped issue straight through.
        IssueKnowledge k = resolve(fb.issue());
        if (k == null) return fb.tip();

        String key = fb.issue() + "|" + bucket(exif);
        String cached = cache.get(key);
        if (cached != null) return cached;

        try {
            String toned = tipModel.render(prompt(k, fb.tip()));
            if (toned == null || toned.isBlank()) return fb.tip();
            toned = toned.strip();
            put(key, toned);
            return toned;
        } catch (Exception e) {
            log.debug("AI tip rendering failed for {} — using deterministic tip: {}", fb.issue(), e.getMessage());
            return fb.tip();
        }
    }

    private IssueKnowledge resolve(String issueName) {
        try {
            return knowledgeBase.describe(ImageIssue.valueOf(issueName)).orElse(null);
        } catch (IllegalArgumentException e) {
            return null; // synthetic issue keys like MOTION_BLUR are not enum values
        }
    }

    private static String prompt(IssueKnowledge k, String draftTip) {
        return """
            Rewrite the photography tip below in a warm, concise, second-person coaching \
            voice (one or two sentences). Ground it strictly in the facts provided — do not \
            invent camera settings or gear, and do not quote specific numeric values from the \
            draft (refer to settings qualitatively, e.g. "a very high ISO"). Output only the \
            rewritten tip, with no preamble or quotation marks.

            Issue: %s
            Why it happens: %s
            Mechanism: %s
            Corrective levers: %s
            Draft tip: %s
            """.formatted(k.issue(), k.cause(), k.physics(),
                          String.join(", ", k.levers()), draftTip);
    }

    // Coarse EXIF signature — matches the dimensions that change the tip branch,
    // so similar shots share one cache entry (and one model call).
    private static String bucket(ExifData exif) {
        if (exif == null) return "-|-|-";
        Integer iso = exif.iso();
        String isoBand = iso == null ? "-"
                : iso > 3200 ? "hi"
                : iso > 1600 ? "midhi"
                : iso <= 800 ? "lo"
                : "mid";
        String wb = exif.wbMode() == null ? "-" : exif.wbMode();
        Double f = exif.focalLength();
        String focal = f == null ? "-" : (f > 85 ? "tele" : "wide");
        return isoBand + "|" + wb + "|" + focal;
    }

    private void put(String key, String value) {
        if (cache.size() >= CACHE_CAP) cache.clear(); // simple bound; buckets are few in practice
        cache.put(key, value);
    }

    // ---- test / diagnostic hooks ----
    int cacheSize() { return cache.size(); }
    void clearCache() { cache.clear(); }
}
