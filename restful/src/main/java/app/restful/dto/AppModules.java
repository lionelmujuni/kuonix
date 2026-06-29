package app.restful.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record AppModules(
    boolean editing,
    boolean aiAssistant,
    boolean batchProcessing,
    boolean rawDecode,
    boolean cameraFeedback,
    boolean styleProfiles
) {
    public static AppModules defaults() {
        // cameraFeedback on by default so photographers see in-camera tips;
        // aiAssistant is derived from Ollama config (see withAiAssistant).
        return new AppModules(true, true, true, true, true, false);
    }

    /**
     * Return a copy with {@code aiAssistant} overridden. The AI module is not a
     * stored user toggle — it is derived from whether Ollama is configured, so
     * the controller overrides it on read.
     */
    public AppModules withAiAssistant(boolean ai) {
        return new AppModules(editing, ai, batchProcessing, rawDecode, cameraFeedback, styleProfiles);
    }
}
