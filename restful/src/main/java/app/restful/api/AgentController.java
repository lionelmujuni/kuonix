package app.restful.api;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

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
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.service.TokenStream;

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
            String sessionId,      // opaque key for per-session memory
            String message,        // user's chat message
            String imagePath,      // optional: active image in the Color Lab (may be null)
            Map<String, Object> imageFeatures,  // pre-computed analysis metrics (may be null)
            List<String> imageIssues   // pre-computed classification issues (may be null)
    ) {}

    // Result strings can be very large for some tools (e.g. recommendCorrections
    // returning a JSON array, listWorkflows returning the full catalog).
    // Truncate before sending so the SSE payload stays bounded.
    private static final int TOOL_RESULT_MAX = 4096;

    /**
     * Stream an agent response as Server-Sent Events.
     *
     * <p>Event types produced:</p>
     * <ul>
     *   <li>{@code token}         — one streamed token</li>
     *   <li>{@code tool_executed} — fired immediately after a @Tool method
     *       returns; payload is {@code {name, arguments, result, truncated}}</li>
     *   <li>{@code correction}    — preview-correction payload (also accompanied
     *       by a {@code tool_executed} for the same call)</li>
     *   <li>{@code commit}        — committed-correction payload (also
     *       accompanied by a {@code tool_executed} for the same call)</li>
     *   <li>{@code done}          — signals end of stream; data is {@code [DONE]}</li>
     *   <li>{@code error}         — error message if the agent fails</li>
     * </ul>
     */
    @PostMapping(value = "/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chat(@RequestBody AgentChatRequest req) {

        if (aiService == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "AI Assistant is not configured. Please enable it in Settings and restart.");
        }

        // 5 min budget. Tool sequences (preview → commit on a large image) can
        // burn well over 60 s before the LLM emits its first user-facing token.
        SseEmitter emitter = new SseEmitter(300_000L);

        String effectiveMessage = buildMessage(req);
        log.info("[agent/chat] session={} msg_len={}", req.sessionId(), effectiveMessage.length());

        // Commit the HTTP response immediately so Spring's async-timeout
        // machinery cannot demote a still-thinking request to 503.
        try {
            emitter.send(SseEmitter.event().comment("ready"));
        } catch (IOException e) {
            log.debug("[agent/chat] client disconnected before stream start");
            emitter.completeWithError(e);
            return emitter;
        }

        executor.submit(() -> {
            try {
                TokenStream stream = aiService.chat(req.sessionId(), effectiveMessage);

                // Guard all emitter operations — once completed/errored, no further sends.
                AtomicBoolean emitterDone = new AtomicBoolean(false);

                // Capture correction preview on the tool-execution thread (same thread
                // as the @Tool method), then read it in onCompleteResponse. ThreadLocal
                // would fail here because onCompleteResponse runs on a different thread.
                AtomicReference<KuonixAgentTools.CorrectionPreview> correctionRef =
                        new AtomicReference<>();
                AtomicReference<KuonixAgentTools.CommitResult> commitRef =
                        new AtomicReference<>();

                stream
                    .onPartialResponse(token -> {
                        if (emitterDone.get()) return;
                        try {
                            emitter.send(SseEmitter.event().name("token").data(token));
                        } catch (IOException e) {
                            emitterDone.set(true);
                            log.debug("[agent/chat] client disconnected during streaming");
                        }
                    })
                    .onToolExecuted(toolExecution -> {
                        String toolName = toolExecution.request().name();
                        if ("previewCorrection".equals(toolName)) {
                            KuonixAgentTools.CorrectionPreview preview =
                                    KuonixAgentTools.consumePendingCorrection();
                            if (preview != null) {
                                correctionRef.set(preview);
                                log.info("[agent/chat] captured correction preview from tool: method={}",
                                        preview.method());
                            }
                        } else if ("commitCorrection".equals(toolName)) {
                            KuonixAgentTools.CommitResult commit =
                                    KuonixAgentTools.consumePendingCommit();
                            if (commit != null) {
                                commitRef.set(commit);
                                log.info("[agent/chat] captured commit from tool: method={} path={}",
                                        commit.method(), commit.workingPath());
                            }
                        }

                        // Surface every tool call to the frontend so the UI can render
                        // a "tool fired" card for each of the 8 @Tool methods.
                        if (!emitterDone.get()) {
                            String args = toolExecution.request().arguments();
                            String rawResult = toolExecution.result();
                            String result = rawResult == null ? "" : rawResult;
                            boolean truncated = false;
                            if (result.length() > TOOL_RESULT_MAX) {
                                result = result.substring(0, TOOL_RESULT_MAX);
                                truncated = true;
                            }
                            try {
                                Map<String, Object> payload = new HashMap<>();
                                payload.put("name", toolName);
                                payload.put("arguments", args);
                                payload.put("result", result);
                                payload.put("truncated", truncated);
                                emitter.send(SseEmitter.event()
                                        .name("tool_executed")
                                        .data(objectMapper.writeValueAsString(payload)));
                            } catch (IOException e) {
                                emitterDone.set(true);
                                log.debug("[agent/chat] client disconnected during tool_executed");
                            }
                        }
                    })
                    .onCompleteResponse(response -> {
                        // LangChain4j fires onCompleteResponse after EACH LLM turn,
                        // including intermediate tool-call-only turns that carry no text.
                        // Skip the done/close path for those — wait for the final turn
                        // that actually contains the assistant's text reply.
                        AiMessage aiMsg = response.aiMessage();
                        boolean isToolCallOnly = aiMsg.hasToolExecutionRequests()
                                && (aiMsg.text() == null || aiMsg.text().isBlank());
                        if (isToolCallOnly) return;

                        if (emitterDone.compareAndSet(false, true)) {
                            KuonixAgentTools.CorrectionPreview correction = correctionRef.get();
                            if (correction != null) {
                                try {
                                    Map<String, Object> payload = new HashMap<>();
                                    payload.put("base64", correction.base64());
                                    payload.put("method", correction.method());
                                    payload.put("params", correction.params());
                                    emitter.send(SseEmitter.event()
                                            .name("correction")
                                            .data(objectMapper.writeValueAsString(payload)));
                                    log.info("[agent/chat] sent correction preview: method={}", correction.method());
                                } catch (IOException e) {
                                    log.warn("[agent/chat] failed to send correction event", e);
                                }
                            }
                            KuonixAgentTools.CommitResult commit = commitRef.get();
                            if (commit != null) {
                                try {
                                    Map<String, Object> payload = new HashMap<>();
                                    payload.put("workingPath", commit.workingPath());
                                    payload.put("base64", commit.base64());
                                    payload.put("method", commit.method());
                                    payload.put("params", commit.params());
                                    emitter.send(SseEmitter.event()
                                            .name("commit")
                                            .data(objectMapper.writeValueAsString(payload)));
                                    log.info("[agent/chat] sent commit: method={}", commit.method());
                                } catch (IOException e) {
                                    log.warn("[agent/chat] failed to send commit event", e);
                                }
                            }
                            try {
                                emitter.send(SseEmitter.event().name("done").data("[DONE]"));
                                emitter.complete();
                            } catch (IOException e) {
                                emitter.completeWithError(e);
                            }
                        }
                    })
                    .onError(e -> {
                        log.error("[agent/chat] stream error", e);
                        if (emitterDone.compareAndSet(false, true)) {
                            try {
                                emitter.send(SseEmitter.event().name("error").data(e.getMessage()));
                                emitter.complete();
                            } catch (IOException ioEx) {
                                emitter.completeWithError(ioEx);
                            }
                        }
                    })
                    .start();

            } catch (Exception e) {
                log.error("[agent/chat] startup error", e);
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
        if (req.imagePath() == null || req.imagePath().isBlank()) {
            return req.message();
        }

        StringBuilder sb = new StringBuilder();
        sb.append("[Active image: ").append(req.imagePath()).append("]\n");

        // Inject pre-computed analysis so the LLM skips redundant tool calls
        if (req.imageFeatures() != null && !req.imageFeatures().isEmpty()) {
            try {
                sb.append("[Analysis already done — features: ")
                  .append(objectMapper.writeValueAsString(req.imageFeatures()))
                  .append("]\n");
            } catch (Exception e) {
                log.warn("[agent/chat] failed to serialize imageFeatures", e);
            }
        }
        if (req.imageIssues() != null && !req.imageIssues().isEmpty()) {
            sb.append("[Issues already detected: ")
              .append(String.join(", ", req.imageIssues()))
              .append("]\n");
        }

        sb.append(req.message());
        return sb.toString();
    }
}
