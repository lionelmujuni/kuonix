package app.restful.agent;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Thread-local side-channel for correction previews produced by {@link KuonixAgentTools}.
 *
 * <p>When the agent calls {@code previewCorrection}, the tool pushes the Base64 result
 * here instead of returning the raw data to the LLM (which would waste tokens).
 * The {@code AgentController} drains this channel after the token stream completes and
 * emits the corrections as dedicated {@code correction} SSE events.</p>
 *
 * <p>Thread-local storage is safe here because LangChain4j executes tools synchronously
 * in the same thread that calls {@code TokenStream.start()}.</p>
 */
@Component
public class CorrectionSideChannel {

    public record CorrectionPayload(String base64, String method, Map<String, Object> params) {}

    private static final ThreadLocal<List<CorrectionPayload>> HOLDER =
            ThreadLocal.withInitial(ArrayList::new);

    /** Called by {@link KuonixAgentTools} when a preview is generated. */
    public void push(String base64, String method, Map<String, Object> params) {
        HOLDER.get().add(new CorrectionPayload(base64, method, params));
    }

    /**
     * Returns all pending corrections and clears the thread-local list.
     * Called by {@code AgentController} after the token stream finishes.
     */
    public List<CorrectionPayload> drain() {
        List<CorrectionPayload> items = new ArrayList<>(HOLDER.get());
        HOLDER.remove();
        return items;
    }
}
