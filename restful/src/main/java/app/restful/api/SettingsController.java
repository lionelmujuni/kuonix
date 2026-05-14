package app.restful.api;

import java.io.IOException;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import app.restful.dto.OllamaSettings;
import app.restful.services.SettingsService;

/**
 * REST API for application settings management.
 * Allows frontend to read/write user preferences without restarting the app.
 *
 * <p><strong>POST /settings/ollama</strong> requires app restart to take effect
 * since LangChain4j beans are created at startup.</p>
 */
@RestController
@RequestMapping("/settings")
@CrossOrigin(origins = "*")
public class SettingsController {

    private static final Logger log = LoggerFactory.getLogger(SettingsController.class);
    
    private final SettingsService settingsService;

    public SettingsController(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    /**
     * Get current Ollama AI settings.
     */
    @GetMapping("/ollama")
    public OllamaSettings getOllamaSettings() {
        return settingsService.getOllamaSettings();
    }

    /**
     * Save Ollama AI settings.
     * Returns status indicating whether restart is needed.
     */
    @PostMapping("/ollama")
    public ResponseEntity<?> saveOllamaSettings(@RequestBody OllamaSettings settings) {
        try {
            settingsService.saveOllamaSettings(settings);
            
            return ResponseEntity.ok(new SaveResponse(
                true,
                "Settings saved successfully. Please restart the application for changes to take effect.",
                true  // restart required
            ));
        } catch (IllegalArgumentException e) {
            log.warn("Invalid settings submitted: {}", e.getMessage());
            return ResponseEntity.badRequest().body(new SaveResponse(
                false,
                e.getMessage(),
                false
            ));
        } catch (IOException e) {
            log.error("Failed to save settings", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new SaveResponse(
                    false,
                    "Failed to save settings: " + e.getMessage(),
                    false
                ));
        }
    }

    /**
     * Get list of available Ollama models.
     * This is a curated list - users can also enter custom model names.
     */
    @GetMapping("/ollama/models")
    public List<ModelOption> getAvailableModels() {
        return List.of(
            new ModelOption("qwen3.5:cloud",          "Qwen 3.5 · Paid",         "Best all-rounder, vision + tools + thinking"),
            new ModelOption("minimax-m2.7:cloud",     "MiniMax M2.7 · Paid",     "Coding and agentic workflows"),
            new ModelOption("kimi-k2.6:cloud",        "Kimi K2.6 · Paid",        "Multimodal agentic, vision + tools"),
            new ModelOption("glm-5.1:cloud",          "GLM 5.1 · Paid",          "Flagship agentic engineering model"),
            new ModelOption("nemotron-3-super:cloud", "Nemotron 3 Super · Free", "NVIDIA agentic model — no paid plan required"),
            new ModelOption("gemma4:31b-cloud",       "Gemma 4 (31B) · Free",    "Google's latest — no paid plan required")
        );
    }

    private record SaveResponse(
        boolean success,
        String message,
        boolean restartRequired
    ) {}

    private record ModelOption(
        String value,
        String label,
        String description
    ) {}
}
