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
     * Whether AI features are usable — driven purely by configuration, not by a
     * manual on/off toggle. AI is active when a valid API key and complete
     * settings are present. This is the single source of truth for gating AI
     * beans ({@code DynamicOllamaConfig}) and the derived {@code aiAssistant}
     * module flag.
     */
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank()
            && modelName != null && !modelName.isBlank()
            && baseUrl != null && !baseUrl.isBlank()
            && temperature != null && temperature >= 0 && temperature <= 2
            && maxTokens != null && maxTokens > 0;
    }

    /**
     * Validate settings before saving. A blank API key means "AI off" and is
     * always valid; once a key is provided the rest of the config must be
     * complete.
     */
    public boolean isValid() {
        if (apiKey == null || apiKey.isBlank()) return true;
        return isConfigured();
    }
}
