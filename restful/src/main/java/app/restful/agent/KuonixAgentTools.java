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

import app.restful.dto.ImageFeatures;
import app.restful.dto.ImageIssue;
import app.restful.services.ColorCorrectionService;
import app.restful.services.ImageAnalysisService;
import app.restful.services.ImageClassifierService;
import app.restful.services.StorageService;
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
 * AgentController can send them as dedicated SSE events — the LLM never
 * sees or needs to echo the raw Base64 data.</p>
 */
@Component
public class KuonixAgentTools {

    private static final Logger log = LoggerFactory.getLogger(KuonixAgentTools.class);

    /**
     * Side-channel for correction previews generated during a tool call.
     * Set by previewCorrection(), consumed by AgentController after chat().
     */
    public record CorrectionPreview(String base64, String method, Map<String, Object> params) {}
    private static final ThreadLocal<CorrectionPreview> pendingCorrection = new ThreadLocal<>();

    public static CorrectionPreview consumePendingCorrection() {
        CorrectionPreview c = pendingCorrection.get();
        pendingCorrection.remove();
        return c;
    }

    private final ImageAnalysisService   analysisService;
    private final ImageClassifierService classifierService;
    private final ColorCorrectionService correctionService;
    private final StorageService         storageService;
    private final ObjectMapper           mapper;

    public KuonixAgentTools(ImageAnalysisService analysisService,
                            ImageClassifierService classifierService,
                            ColorCorrectionService correctionService,
                            StorageService storageService) {
        this.analysisService   = analysisService;
        this.classifierService = classifierService;
        this.correctionService = correctionService;
        this.storageService    = storageService;
        this.mapper            = new ObjectMapper();
    }

    // -------------------------------------------------------------------------
    // Tool: analyzeImage
    // -------------------------------------------------------------------------

    @Tool("Analyse a single image and return its photographic quality metrics as JSON. " +
          "Returns brightness (medianY 0-1), contrast (p5Y and p95Y span), " +
          "saturation (meanS, p95S 0-1), colour cast (labABDist, castAngleDeg 0-360), " +
          "and shadow noise ratio. Use this before classifyIssues to understand the image.")
    public String analyzeImage(
            @P("Absolute file path of the image to analyse") String imagePath) {

        Path path = validateWorkspacePath(imagePath);
        log.info("[agent] analyzeImage: {}", path.getFileName());

        ImageFeatures f = analysisService.compute(path, false);

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
                Map.entry("shadowNoiseRatio", round(f.shadowNoiseRatio()))
        );

        return toJson(compact);
    }

    // -------------------------------------------------------------------------
    // Tool: classifyIssues
    // -------------------------------------------------------------------------

    @Tool("Detect quality issues in an image. " +
          "Returns a comma-separated list of detected ImageIssue values such as " +
          "Needs_Exposure_Increase, ColorCast_Blue, Needs_Noise_Reduction, etc. " +
          "Returns 'none' when no issues are found.")
    public String classifyIssues(
            @P("Absolute file path of the image to classify") String imagePath) {

        Path path = validateWorkspacePath(imagePath);
        log.info("[agent] classifyIssues: {}", path.getFileName());

        ImageFeatures    f      = analysisService.compute(path, false);
        List<ImageIssue> issues = classifierService.classify(f);

        if (issues.isEmpty()) return "none";
        return issues.stream().map(Enum::name).collect(Collectors.joining(", "));
    }

    // -------------------------------------------------------------------------
    // Tool: previewCorrection
    // -------------------------------------------------------------------------

    @Tool("Generate a corrected preview of an image and return a JSON object with the Base64 JPEG data URL, " +
          "the correction method, and parameters used. " +
          "Available methods: gray_world, white_patch, shades_of_gray, exposure, " +
          "saturation, color_matrix, color_distribution_alignment. " +
          "Always call previewCorrection before applyCorrection so the user can confirm.")
    public String previewCorrection(
            @P("Absolute file path of the image") String imagePath,
            @P("Correction method id: gray_world | white_patch | shades_of_gray | " +
               "exposure | saturation | color_matrix | color_distribution_alignment") String method,
            @P("JSON object of parameter name to numeric value, e.g. {\"gain\": 1.2}. " +
               "Use {} when the method needs no parameters.") String parametersJson) {

        Path path   = validateWorkspacePath(imagePath);
        Map<String, Object> params = parseParams(parametersJson);

        log.info("[agent] previewCorrection: {} method={}", path.getFileName(), method);

        String base64 = correctionService.processImageToBase64(path, method, params);

        // Store in side-channel for AgentController to send as SSE event
        pendingCorrection.set(new CorrectionPreview(base64, method, params));

        return "Preview generated for " + path.getFileName() + " using " + method + ". The user can now see the before/after comparison in the viewer.";
    }

    // -------------------------------------------------------------------------
    // Tool: applyCorrection
    // -------------------------------------------------------------------------

    @Tool("Apply a colour correction permanently and save the result to the workspace. " +
          "Only call this after the user has explicitly confirmed the preview looks correct. " +
          "Returns the saved output file path.")
    public String applyCorrection(
            @P("Absolute file path of the source image") String imagePath,
            @P("Correction method id (same values as previewCorrection)") String method,
            @P("JSON object of parameter name to numeric value, e.g. {\"gain\": 1.2}") String parametersJson) {

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
