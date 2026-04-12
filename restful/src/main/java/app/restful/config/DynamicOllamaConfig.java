package app.restful.config;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import app.restful.agent.KuonixAgentTools;
import app.restful.agent.KuonixAiService;
import app.restful.dto.OllamaSettings;
import app.restful.services.SettingsService;
import dev.langchain4j.memory.chat.ChatMemoryProvider;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.ollama.OllamaChatModel;
import dev.langchain4j.service.AiServices;

/**
 * Dynamic LangChain4j configuration based on user settings.
 * 
 * <p>This reads settings from ~/.kuonix/ollama-settings.json instead of
 * hardcoding them in application.yaml, allowing users to configure AI
 * features through the Settings UI without editing config files.</p>
 *
 * <p>When settings.enabled=false or API key is missing, no AI beans are created
 * and the app runs without AI features.</p>
 */
@Configuration
public class DynamicOllamaConfig {

    private static final Logger log = LoggerFactory.getLogger(DynamicOllamaConfig.class);

    /**
     * Create Ollama streaming chat model from user settings.
     * Only created when settings are valid and enabled.
     * 
     * Returns null if disabled or misconfigured, which prevents @AiService beans from being created.
     */
    @Bean
    public ChatLanguageModel chatLanguageModel(SettingsService settingsService) {
        OllamaSettings settings = settingsService.getOllamaSettings();

        if (!settings.enabled()) {
            log.info("Ollama AI is disabled in user settings. AI features unavailable.");
            log.info("Enable via Settings UI in the application.");
            return null;
        }

        if (settings.apiKey() == null || settings.apiKey().isBlank()) {
            log.warn("Ollama API key not configured. AI features unavailable.");
            log.warn("Configure API key via Settings UI in the application.");
            return null;
        }

        log.info("Configuring Ollama Cloud: model={}, url={}", settings.modelName(), settings.baseUrl());

        Map<String, String> headers = new HashMap<>();
        headers.put("Authorization", "Bearer " + settings.apiKey());

        return OllamaChatModel.builder()
                .baseUrl(settings.baseUrl())
                .modelName(settings.modelName())
                .temperature(settings.temperature())
                .numPredict(settings.maxTokens())
                .timeout(Duration.ofSeconds(120))
                .customHeaders(headers)
                .logRequests(true)
                .logResponses(true)
                .build();
    }

    @Bean
    public KuonixAiService kuonixAiService(
            SettingsService settingsService,
            ChatMemoryProvider chatMemoryProvider,
            KuonixAgentTools tools) {
        ChatLanguageModel chatModel = chatLanguageModel(settingsService);
        if (chatModel == null) {
            return null;
        }
        return AiServices.builder(KuonixAiService.class)
                .chatLanguageModel(chatModel)
                .chatMemoryProvider(chatMemoryProvider)
                .tools(tools)
                .build();
    }
}
