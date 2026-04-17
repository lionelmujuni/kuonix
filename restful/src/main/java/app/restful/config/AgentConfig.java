package app.restful.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import dev.langchain4j.memory.chat.ChatMemoryProvider;
import dev.langchain4j.memory.chat.MessageWindowChatMemory;
import dev.langchain4j.model.chat.listener.ChatModelErrorContext;
import dev.langchain4j.model.chat.listener.ChatModelListener;
import dev.langchain4j.model.chat.listener.ChatModelRequestContext;
import dev.langchain4j.model.chat.listener.ChatModelResponseContext;

/**
 * Wires up LangChain4j infrastructure beans:
 * <ul>
 *   <li>{@code ChatMemoryProvider} — creates a per-session sliding-window memory
 *       (max 10 messages) keyed by the {@code sessionId} passed to
 *       {@code KuonixAiService.chat()}</li>
 *   <li>{@code ChatModelListener} — logs token usage for every LLM call so
 *       cost and latency can be monitored</li>
 * </ul>
 * 
 * <p>These beans are always created. The AI service itself is conditional
 * based on user settings (managed via DynamicOllamaConfig).</p>
 */
@Configuration
public class AgentConfig {

    private static final Logger log = LoggerFactory.getLogger(AgentConfig.class);

    /**
     * Provides independent MessageWindowChatMemory per session.
     * LangChain4j uses the @MemoryId value as the memoryId argument here.
     */
    @Bean
    public ChatMemoryProvider chatMemoryProvider() {
        return memoryId -> MessageWindowChatMemory.builder()
                .id(memoryId)
                .maxMessages(10)
                .build();
    }

    /**
     * Logs token usage for every LLM request/response.
     * Hook Spring Actuator / Micrometer counters here in future to expose
     * gen_ai.client.token.usage metrics via /actuator/metrics.
     */
    @Bean
    public ChatModelListener tokenUsageListener() {
        return new ChatModelListener() {

            @Override
            public void onRequest(ChatModelRequestContext ctx) {
                log.debug("[llm] request model={} messages={}",
                        ctx.chatRequest().modelName(),
                        ctx.chatRequest().messages().size());
            }

            @Override
            public void onResponse(ChatModelResponseContext ctx) {
                var usage = ctx.chatResponse().tokenUsage();
                if (usage != null) {
                    log.info("[llm] response inputTokens={} outputTokens={} totalTokens={}",
                            usage.inputTokenCount(),
                            usage.outputTokenCount(),
                            usage.totalTokenCount());
                }
            }

            @Override
            public void onError(ChatModelErrorContext ctx) {
                log.error("[llm] error: {}", ctx.error().getMessage(), ctx.error());
            }
        };
    }
}
