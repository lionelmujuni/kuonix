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
        return new AppModules(true, true, true, true, false, false);
    }
}
