package app.restful.agent;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import app.restful.dto.CameraFeedback;
import app.restful.dto.ExifData;
import app.restful.dto.ImageFeatures;
import app.restful.dto.ImageIssue;
import app.restful.dto.StyleGap;
import app.restful.dto.StyleProfile;
import app.restful.services.AlgorithmKnowledgeGraph;
import app.restful.services.CameraFeedbackService;
import app.restful.services.ColorCorrectionService;
import app.restful.services.ExifCache;
import app.restful.services.ImageClassifierService;
import app.restful.services.ImageFeaturesCache;
import app.restful.services.StorageService;
import app.restful.services.StyleGapService;
import app.restful.services.StyleProfileService;
import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;

/**
 * LangChain4j @Tool wrappers for the Kuonix image processing services.
 *
 * <p>All tools validate that the requested file path lives inside the
 * StorageService workspace directory so the agent cannot read or write
 * arbitrary files on the host system (principle of least privilege).</p>
 *
 * <p>Correction previews are stored in a ThreadLocal side-channel so the
 * AgentController can capture them via the {@code onToolExecuted} callback
 * (which runs on the same thread as the tool) and forward them as
 * dedicated SSE events — the LLM never sees the raw Base64 data.</p>
 */
@Component
public class KuonixAgentTools {

    private static final Logger log = LoggerFactory.getLogger(KuonixAgentTools.class);

    /**
     * Side-channel for correction previews generated during a tool call.
     * Set by previewCorrection(), consumed by AgentController's onToolExecuted
     * callback (which runs on the same thread as the @Tool method).
     */
    public record CorrectionPreview(String base64, String method, Map<String, Object> params) {}
    private static final ThreadLocal<CorrectionPreview> pendingCorrection = new ThreadLocal<>();

    public static CorrectionPreview consumePendingCorrection() {
        CorrectionPreview c = pendingCorrection.get();
        pendingCorrection.remove();
        return c;
    }

    /**
     * Side-channel for committed corrections — promoted baselines that the
     * frontend must switch to so subsequent corrections chain on top.
     */
    public record CommitResult(String workingPath, String base64, String method, Map<String, Object> params) {}
    private static final ThreadLocal<CommitResult> pendingCommit = new ThreadLocal<>();

    public static CommitResult consumePendingCommit() {
        CommitResult c = pendingCommit.get();
        pendingCommit.remove();
        return c;
    }

    private final ImageFeaturesCache        featuresCache;
    private final ImageClassifierService    classifierService;
    private final ColorCorrectionService    correctionService;
    private final StorageService            storageService;
    private final AlgorithmKnowledgeGraph   knowledgeGraph;
    private final ExifCache                 exifCache;
    private final CameraFeedbackService     cameraFeedbackService;
    private final StyleProfileService       styleProfileService;
    private final StyleGapService           styleGapService;
    private final ObjectMapper              mapper;

    public KuonixAgentTools(ImageFeaturesCache featuresCache,
                            ImageClassifierService classifierService,
                            ColorCorrectionService correctionService,
                            StorageService storageService,
                            AlgorithmKnowledgeGraph knowledgeGraph,
                            ExifCache exifCache,
                            CameraFeedbackService cameraFeedbackService,
                            StyleProfileService styleProfileService,
                            StyleGapService styleGapService) {
        this.featuresCache        = featuresCache;
        this.classifierService    = classifierService;
        this.correctionService    = correctionService;
        this.storageService       = storageService;
        this.knowledgeGraph       = knowledgeGraph;
        this.exifCache            = exifCache;
        this.cameraFeedbackService = cameraFeedbackService;
        this.styleProfileService  = styleProfileService;
        this.styleGapService      = styleGapService;
        this.mapper               = new ObjectMapper();
    }

    // -------------------------------------------------------------------------
    // Tool: analyzeImage
    // -------------------------------------------------------------------------

    @Tool("Read the photograph's quality metrics: brightness (medianY 0-1), " +
          "contrast span (p5Y, p95Y), saturation (meanS, p95S), colour cast " +
          "(labABDist + castAngleDeg 0-360°), shadow noise. Returns compact JSON. " +
          "Skip when the user's message already includes analysis data — every " +
          "uploaded image is auto-analysed and the data is often inlined.")
    public String analyzeImage(
            @P("Absolute file path of the image to analyse") String imagePath) {

        Path path = validateWorkspacePath(imagePath);
        log.info("[agent] analyzeImage: {}", path.getFileName());

        ImageFeatures f = featuresCache.get(path, false);

        // Compact subset — verbose pixel data would waste tokens
        Map<String, Object> compact = Map.ofEntries(
                Map.entry("width",            f.width()),
                Map.entry("height",           f.height()),
                Map.entry("medianY",          round(f.medianY())),
                Map.entry("meanY",            round(f.meanY())),
                Map.entry("p5Y",              round(f.p5Y())),
                Map.entry("p95Y",             round(f.p95Y())),
                Map.entry("blackPct",         round(f.blackPct())),
                Map.entry("whitePct",         round(f.whitePct())),
                Map.entry("meanS",            round(f.meanS())),
                Map.entry("p95S",             round(f.p95S())),
                Map.entry("labABDist",        round(f.labABDist())),
                Map.entry("castAngleDeg",     round(f.castAngleDeg())),
                Map.entry("shadowNoiseRatio", round(f.shadowNoiseRatio())),
                Map.entry("darkChannelMean",  round(f.darkChannelMean()))
        );

        return toJson(compact);
    }

    // -------------------------------------------------------------------------
    // Tool: classifyIssues
    // -------------------------------------------------------------------------

    @Tool("Tag the photograph with concrete problems — exposure direction, colour " +
          "cast, contrast, saturation, noise, skin drift, haze, clipping. Returns " +
          "a comma-separated list of issues, or 'none' when the image is already " +
          "clean. Skip when the user's message already lists detected issues.")
    public String classifyIssues(
            @P("Absolute file path of the image to classify") String imagePath) {

        Path path = validateWorkspacePath(imagePath);
        log.info("[agent] classifyIssues: {}", path.getFileName());

        ImageFeatures    f      = featuresCache.get(path, false);
        List<ImageIssue> issues = classifierService.classify(f);

        if (issues.isEmpty()) return "none";
        return issues.stream().map(Enum::name).collect(Collectors.joining(", "));
    }

    // -------------------------------------------------------------------------
    // Tool: recommendCorrections
    // -------------------------------------------------------------------------

    @Tool("Rank correction methods for a set of detected issues, weighted by what " +
          "each method is known to fix and what it can make worse. Returns ranked " +
          "candidates with a reason and suggested parameters. Score reflects fit, " +
          "not creative quality — a low-scoring method may still be the right look. " +
          "Call this when you have an issue list and want a defensible first pick.")
    public String recommendCorrections(
            @P("Comma-separated ImageIssue values (the string returned by classifyIssues). " +
               "Pass 'none' to get an empty list.") String issuesCsv) {

        if (issuesCsv == null || issuesCsv.isBlank() || "none".equalsIgnoreCase(issuesCsv.trim())) {
            return "[]";
        }
        List<String> issues = java.util.Arrays.stream(issuesCsv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();

        log.info("[agent] recommendCorrections: issues={}", issues);
        return toJson(knowledgeGraph.recommend(issues));
    }

    // -------------------------------------------------------------------------
    // Tool: describeAlgorithm
    // -------------------------------------------------------------------------

    @Tool("Look up everything Kuonix knows about one method — what it does, when " +
          "it shines, what it can ruin, parameter ranges and defaults, methods it " +
          "chains well with. Use this when the user asks for an explanation of a " +
          "method, when you need parameter ranges before previewing, or when a " +
          "recommended method seems risky for this particular image.")
    public String describeAlgorithm(
            @P("Algorithm id, e.g. 'clahe_lab', 'vibrance', 'shades_of_gray'") String algoId) {

        log.info("[agent] describeAlgorithm: {}", algoId);
        return knowledgeGraph.describe(algoId)
                .map(this::toJson)
                .orElse("{\"error\":\"unknown algorithm: " + algoId + "\"}");
    }

    // -------------------------------------------------------------------------
    // Tool: listWorkflows
    // -------------------------------------------------------------------------

    @Tool("List multi-step recipes for common scenarios — portrait restoration, " +
          "landscape dehaze, high-contrast recovery. Each is a named ordered chain " +
          "with a 'when' predicate (the issue set that justifies it). Use when an " +
          "image clearly fits a recipe and the user wants a single coherent pass " +
          "rather than step-by-step decisions.")
    public String listWorkflows() {
        log.info("[agent] listWorkflows");
        return toJson(knowledgeGraph.availableWorkflows());
    }

    // -------------------------------------------------------------------------
    // Tool: previewCorrection
    // -------------------------------------------------------------------------

    @Tool("Produce a non-destructive preview of one correction. The result lands as " +
          "a before/after card in the user's view; nothing is written to disk. " +
          "ALWAYS preview before commit or apply — the user must see the result " +
          "before agreeing. Pick the method via recommendCorrections or " +
          "describeAlgorithm; do not guess parameters from memory.")
    public String previewCorrection(
            @P("Absolute file path of the image") String imagePath,
            @P("Algorithm id — obtain from recommendCorrections or listWorkflows") String method,
            @P("JSON parameters, e.g. {\"gain\":1.2}. Use {} for defaults; see describeAlgorithm for schema.") String parametersJson) {

        Path path   = validateWorkspacePath(imagePath);
        Map<String, Object> params = parseParams(parametersJson);

        log.info("[agent] previewCorrection: {} method={}", path.getFileName(), method);

        String base64 = correctionService.processImageToBase64(path, method, params);

        // Store in side-channel for AgentController to send as SSE event
        pendingCorrection.set(new CorrectionPreview(base64, method, params));

        return "Preview generated for " + path.getFileName() + " using " + method + ". The user can now see the before/after comparison in the viewer.";
    }

    // -------------------------------------------------------------------------
    // Tool: commitCorrection
    // -------------------------------------------------------------------------

    @Tool("Lock the previewed correction in as the new working baseline. The next " +
          "correction will chain on top of this result, not the original. NOT an " +
          "export — just an internal step file. ONLY call after the user explicitly " +
          "agrees ('yes', 'apply', 'looks good', 'go ahead'). Use the SAME method " +
          "and parameters that were just previewed. After this call, the returned " +
          "working path IS the current image for any further edits.")
    public String commitCorrection(
            @P("Absolute file path of the source image (current baseline)") String imagePath,
            @P("Algorithm id — same as previewed") String method,
            @P("JSON parameters — same as previewed") String parametersJson) {

        Path path = validateWorkspacePath(imagePath);
        Map<String, Object> params = parseParams(parametersJson);

        log.info("[agent] commitCorrection: {} method={}", path.getFileName(), method);

        // Derive step number from current filename: foo_step2_... → step 3
        String filename = path.getFileName().toString();
        int dot = filename.lastIndexOf('.');
        String baseName = dot > 0 ? filename.substring(0, dot) : filename;

        int step = 1;
        String rootName = baseName;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^(.*)_step(\\d+)_.+$").matcher(baseName);
        if (m.matches()) {
            rootName = m.group(1);
            step = Integer.parseInt(m.group(2)) + 1;
        }

        Path outputPath = storageService.getWorkingDir()
                .resolve(rootName + "_step" + step + "_" + method + ".jpg");

        correctionService.processAndSaveImage(path, outputPath, method, params);

        try {
            byte[] savedBytes = java.nio.file.Files.readAllBytes(outputPath);
            String base64 = "data:image/jpeg;base64," + java.util.Base64.getEncoder().encodeToString(savedBytes);
            pendingCommit.set(new CommitResult(outputPath.toAbsolutePath().toString(), base64, method, params));
        } catch (java.io.IOException e) {
            throw new RuntimeException("Failed to read committed working file: " + outputPath, e);
        }

        return "Committed correction '" + method + "' — the image is now updated. " +
               "Further corrections will build on this result.";
    }

    // -------------------------------------------------------------------------
    // Tool: applyCorrection (export only)
    // -------------------------------------------------------------------------

    @Tool("Write the final corrected image to the user-visible workspace folder " +
          "as a permanent JPEG. ONLY call when the user explicitly asks to 'save', " +
          "'export', or 'download'. For regular preview → confirm → next-step loops " +
          "use commitCorrection — apply ends the editing session for that image. " +
          "Returns the saved output file path.")
    public String applyCorrection(
            @P("Absolute file path of the source image") String imagePath,
            @P("Algorithm id — same as committed/previewed") String method,
            @P("JSON parameters — same as committed/previewed") String parametersJson) {

        Path path   = validateWorkspacePath(imagePath);
        Map<String, Object> params = parseParams(parametersJson);

        log.info("[agent] applyCorrection: {} method={}", path.getFileName(), method);

        // Build output filename: originalName_method.jpg
        String originalName = path.getFileName().toString();
        int dot = originalName.lastIndexOf('.');
        String baseName = dot > 0 ? originalName.substring(0, dot) : originalName;
        Path outputPath = storageService.getWorkspaceDir()
                .resolve(baseName + "_" + method + "_corrected.jpg");

        correctionService.processAndSaveImage(path, outputPath, method, params);
        return "Saved to: " + outputPath.toAbsolutePath();
    }

    // -------------------------------------------------------------------------
    // Tool: explainIssue
    // -------------------------------------------------------------------------

    @Tool("Explain WHY a detected issue appears in the photograph. Returns a structured " +
          "context object combining the triggering metrics, camera settings (EXIF), " +
          "in-camera prevention tips, and — if a style profile is configured — how the " +
          "image compares to the target look. Use this when the user asks why an image " +
          "looks a certain way, not just what algorithm to apply.")
    public String explainIssue(
            @P("Absolute file path of the image") String imagePath,
            @P("Comma-separated ImageIssue names from classifyIssues, e.g. 'Needs_Noise_Reduction,ColorCast_Blue'") String issuesCsv) {

        Path path = validateWorkspacePath(imagePath);
        log.info("[agent] explainIssue: {} issues={}", path.getFileName(), issuesCsv);

        ImageFeatures features = featuresCache.get(path, false);

        List<ImageIssue> issues = java.util.Arrays.stream((issuesCsv == null ? "" : issuesCsv).split(","))
                .map(String::trim).filter(s -> !s.isEmpty())
                .map(s -> { try { return ImageIssue.valueOf(s); } catch (IllegalArgumentException e) { return null; } })
                .filter(java.util.Objects::nonNull)
                .toList();

        ExifData exif = exifCache.get(path);

        List<CameraFeedback> camFeedback = cameraFeedbackService.evaluate(issues, exif);

        StyleGap gap = null;
        String profileName = null;
        try {
            java.util.Optional<StyleProfile> target = styleProfileService.resolveTarget(features);
            if (target.isPresent()) {
                profileName = target.get().name();
                gap = styleGapService.compute(features, target.get());
            }
        } catch (Exception e) {
            log.debug("Style gap skipped: {}", e.getMessage());
        }

        java.util.LinkedHashMap<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("issues", issues.stream().map(Enum::name).toList());
        result.put("triggeringMetrics", relevantMetrics(features, issues));
        if (exif != null) result.put("exif", exif);
        if (!camFeedback.isEmpty()) result.put("cameraFeedback", camFeedback);
        if (gap != null) result.put("styleGap", gap);
        if (profileName != null) result.put("targetProfile", profileName);

        return toJson(result);
    }

    private Map<String, Object> relevantMetrics(ImageFeatures f, List<ImageIssue> issues) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        boolean exposure  = issues.stream().anyMatch(i -> i.name().contains("Exposure") || i.name().contains("Shadow") || i.name().contains("Highlight"));
        boolean cast      = issues.stream().anyMatch(i -> i.name().contains("ColorCast"));
        boolean sat       = issues.stream().anyMatch(i -> i.name().contains("Saturation") || i.name().contains("Oversaturat"));
        boolean noise     = issues.stream().anyMatch(i -> i.name().contains("Noise"));
        boolean haze      = issues.stream().anyMatch(i -> i.name().contains("Hazy"));
        boolean skin      = issues.stream().anyMatch(i -> i.name().contains("Skin"));

        if (exposure || issues.isEmpty()) {
            m.put("medianY",  round(f.medianY()));
            m.put("p5Y",      round(f.p5Y()));
            m.put("p95Y",     round(f.p95Y()));
            m.put("blackPct", round(f.blackPct()));
            m.put("whitePct", round(f.whitePct()));
        }
        if (cast || issues.isEmpty()) {
            m.put("labAMean",    round(f.labAMean()));
            m.put("labBMean",    round(f.labBMean()));
            m.put("labABDist",   round(f.labABDist()));
            m.put("castAngleDeg",round(f.castAngleDeg()));
        }
        if (sat || issues.isEmpty()) {
            m.put("meanS", round(f.meanS()));
            m.put("p95S",  round(f.p95S()));
        }
        if (noise) m.put("shadowNoiseRatio", round(f.shadowNoiseRatio()));
        if (haze)  m.put("darkChannelMean",  round(f.darkChannelMean()));
        if (skin)  { m.put("skinHueMeanDeg", round(f.skinHueMeanDeg())); m.put("skinSatMean", round(f.skinSatMean())); }
        return m;
    }

    // -------------------------------------------------------------------------
    // Guards and helpers
    // -------------------------------------------------------------------------

    /**
     * Ensures the path is inside the StorageService workspace.
     * LangChain4j converts the thrown IllegalArgumentException into a
     * tool-error message that the agent sees — it does not crash the session.
     */
    private Path validateWorkspacePath(String imagePath) {
        if (imagePath == null || imagePath.isBlank()) {
            throw new IllegalArgumentException("imagePath must not be empty.");
        }
        Path requested = Path.of(imagePath).toAbsolutePath().normalize();
        Path workspace = storageService.getWorkspaceDir().toAbsolutePath().normalize();
        if (!requested.startsWith(workspace)) {
            throw new IllegalArgumentException(
                    "Access denied: path is outside the Kuonix workspace directory.");
        }
        return requested;
    }

    private Map<String, Object> parseParams(String json) {
        if (json == null || json.isBlank() || "{}".equals(json.strip())) return Map.of();
        try {
            return mapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Invalid parameters JSON: " + e.getMessage());
        }
    }

    private String toJson(Object obj) {
        try {
            return mapper.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }

    private static double round(double v) {
        return Math.round(v * 1000.0) / 1000.0;
    }
}
