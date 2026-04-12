package app.restful.services;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

import app.restful.dto.OllamaSettings;

/**
 * Manages persistent application settings stored in user's home directory.
 * Settings are saved as JSON for easy editing and portability.
 */
@Service
public class SettingsService {

    private static final Logger log = LoggerFactory.getLogger(SettingsService.class);
    private static final Path SETTINGS_DIR = Paths.get(System.getProperty("user.home"), ".kuonix");
    private static final Path OLLAMA_SETTINGS_FILE = SETTINGS_DIR.resolve("ollama-settings.json");
    
    private final ObjectMapper objectMapper = new ObjectMapper();
    private OllamaSettings cachedOllamaSettings;

    public SettingsService() {
        try {
            Files.createDirectories(SETTINGS_DIR);
        } catch (IOException e) {
            log.warn("Failed to create settings directory: {}", SETTINGS_DIR, e);
        }
    }

    /**
     * Load Ollama settings from disk, or return defaults if not found.
     */
    public OllamaSettings getOllamaSettings() {
        if (cachedOllamaSettings != null) {
            return cachedOllamaSettings;
        }

        if (Files.exists(OLLAMA_SETTINGS_FILE)) {
            try {
                cachedOllamaSettings = objectMapper.readValue(
                    OLLAMA_SETTINGS_FILE.toFile(), 
                    OllamaSettings.class
                );
                log.info("Loaded Ollama settings from: {}", OLLAMA_SETTINGS_FILE);
                return cachedOllamaSettings;
            } catch (IOException e) {
                log.error("Failed to load Ollama settings, using defaults", e);
            }
        }

        cachedOllamaSettings = OllamaSettings.defaults();
        return cachedOllamaSettings;
    }

    /**
     * Save Ollama settings to disk and update cache.
     */
    public void saveOllamaSettings(OllamaSettings settings) throws IOException {
        if (!settings.isValid()) {
            throw new IllegalArgumentException("Invalid settings: ensure API key and model are provided when enabled");
        }

        objectMapper.writerWithDefaultPrettyPrinter()
            .writeValue(OLLAMA_SETTINGS_FILE.toFile(), settings);
        
        cachedOllamaSettings = settings;
        log.info("Saved Ollama settings to: {}", OLLAMA_SETTINGS_FILE);
    }

    /**
     * Clear cached settings (useful for testing or forcing reload).
     */
    public void clearCache() {
        cachedOllamaSettings = null;
    }
}
