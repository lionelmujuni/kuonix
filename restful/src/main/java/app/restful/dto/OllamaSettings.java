package app.restful.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Ollama AI configuration settings.
 * Stored persistently and exposed via REST API for frontend settings UI.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record OllamaSettings(
    boolean enabled,
    String apiKey,
    String modelName,
    String baseUrl,
    Double temperature,
    Integer maxTokens
) {
    
    /**
     * Default settings for new installations.
     */
    public static OllamaSettings defaults() {
        return new OllamaSettings(
            false,                          // disabled by default
            "",                              // user must provide API key
            "qwen3.5:cloud",                // default cloud model
            "https://api.ollama.com",       // Ollama Cloud
            0.3,                             // balanced creativity
            1024                             // reasonable response length
        );
    }
    
    /**
     * Validate settings before saving.
     */
    public boolean isValid() {
        if (!enabled) return true;  // disabled settings are always valid
        return apiKey != null && !apiKey.isBlank()
            && modelName != null && !modelName.isBlank()
            && baseUrl != null && !baseUrl.isBlank()
            && temperature != null && temperature >= 0 && temperature <= 2
            && maxTokens != null && maxTokens > 0;
    }
}
