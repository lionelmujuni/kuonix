package app.restful.api;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fasterxml.jackson.databind.ObjectMapper;

import app.restful.agent.KuonixAgentTools;
import app.restful.agent.KuonixAiService;

@RestController
@RequestMapping("/agent")
@CrossOrigin(origins = "*")
public class AgentController {

    private static final Logger log = LoggerFactory.getLogger(AgentController.class);

    private final KuonixAiService            aiService;
    private final ExecutorService            executor;
    private final ObjectMapper               objectMapper;

    public AgentController(@Autowired(required = false) KuonixAiService aiService) {
        this.aiService    = aiService;
        this.executor     = Executors.newVirtualThreadPerTaskExecutor();
        this.objectMapper = new ObjectMapper();
    }

    public record AgentChatRequest(
            String sessionId,   // opaque key for per-session memory
            String message,     // user's chat message
            String imagePath    // optional: active image in the Color Lab (may be null)
    ) {}

    /**
     * Stream an agent response as Server-Sent Events.
     *
     * <p>Event types produced:</p>
     * <ul>
     *   <li>{@code token} — one streamed token</li>
     *   <li>{@code done}  — signals end of stream; data is {@code [DONE]}</li>
     *   <li>{@code error} — error message if the agent fails</li>
     * </ul>
     */
    @PostMapping(value = "/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chat(@RequestBody AgentChatRequest req) {

        if (aiService == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "AI Assistant is not configured. Please enable it in Settings and restart.");
        }

        SseEmitter emitter = new SseEmitter(120_000L); // 120 s — blocking call needs more time

        String effectiveMessage = buildMessage(req);
        log.info("[agent/chat] session={} msg_len={}", req.sessionId(), effectiveMessage.length());

        executor.submit(() -> {
            try {
                String response = aiService.chat(req.sessionId(), effectiveMessage);
                emitter.send(SseEmitter.event().name("token").data(response));

                // Check side-channel for correction previews generated during tool calls
                KuonixAgentTools.CorrectionPreview correction = KuonixAgentTools.consumePendingCorrection();
                if (correction != null) {
                    Map<String, Object> payload = new HashMap<>();
                    payload.put("base64", correction.base64());
                    payload.put("method", correction.method());
                    payload.put("params", correction.params());
                    emitter.send(SseEmitter.event()
                            .name("correction")
                            .data(objectMapper.writeValueAsString(payload)));
                    log.info("[agent/chat] sent correction preview: method={}", correction.method());
                }

                emitter.send(SseEmitter.event().name("done").data("[DONE]"));
                emitter.complete();
            } catch (Exception e) {
                log.error("[agent/chat] error", e);
                try {
                    emitter.send(SseEmitter.event().name("error").data(e.getMessage()));
                    emitter.complete();
                } catch (IOException ioEx) {
                    emitter.completeWithError(ioEx);
                }
            }
        });

        return emitter;
    }

    /**
     * Prepends the active image path to the user message so the agent always
     * knows which file is currently open in the Color Lab — without the user
     * having to type it every time.
     */
    private String buildMessage(AgentChatRequest req) {
        if (req.imagePath() != null && !req.imagePath().isBlank()) {
            return "[Active image: " + req.imagePath() + "]\n" + req.message();
        }
        return req.message();
    }
}
