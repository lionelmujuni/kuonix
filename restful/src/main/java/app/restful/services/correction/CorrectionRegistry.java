package app.restful.services.correction;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

/**
 * Routes method ids from REST requests and AI tool calls to a
 * {@link CorrectionAlgorithm}. Spring injects every algorithm bean in the
 * context at construction time.
 */
@Component
public class CorrectionRegistry {

    private final Map<String, CorrectionAlgorithm> byId;

    public CorrectionRegistry(List<CorrectionAlgorithm> algorithms) {
        this.byId = algorithms.stream()
                .collect(Collectors.toUnmodifiableMap(
                        CorrectionAlgorithm::id,
                        a -> a));
    }

    public CorrectionAlgorithm get(String id) {
        CorrectionAlgorithm a = byId.get(id);
        if (a == null) {
            throw new IllegalArgumentException("Unknown method: " + id);
        }
        return a;
    }

    public boolean contains(String id) {
        return byId.containsKey(id);
    }

    public Set<String> ids() {
        return byId.keySet();
    }
}
