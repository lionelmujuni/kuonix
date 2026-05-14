package app.restful.services;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import app.restful.services.correction.CorrectionRegistry;
import jakarta.annotation.PostConstruct;

/**
 * Loads {@code algorithms/knowledge-graph.yaml} at startup and exposes a
 * queryable catalogue of correction algorithms, issue-to-algorithm mappings,
 * and multi-step workflows.
 *
 * <p>The graph describes the full aspirational algorithm set; many of those
 * algorithms are not yet implemented. The service cross-references the
 * running {@link CorrectionRegistry} and tags each entry with an
 * {@code available} flag so the agent can filter recommendations to only
 * algorithms that will actually run.</p>
 */
@Service
public class AlgorithmKnowledgeGraph {

    private static final Logger log = LoggerFactory.getLogger(AlgorithmKnowledgeGraph.class);
    private static final String RESOURCE = "algorithms/knowledge-graph.yaml";

    // Public API record types — structured so they serialise compactly to JSON
    // when an agent tool returns them.

    public record ParamSpec(String name, Object defaultValue, String type,
                            Double min, Double max, String description) {}

    public record AlgorithmDoc(String id, String family, String cost, String description,
                               boolean regionAware, boolean available,
                               List<String> goodFor, List<String> badFor,
                               List<String> combinesWellWith, List<ParamSpec> params) {}

    public record IssueMapping(String issue, String primary, List<String> alternatives,
                               Map<String, String> paramHints) {}

    public record Workflow(String id, String description, List<String> when,
                           List<String> steps, boolean available) {}

    public record Recommendation(String algorithmId, String family, String cost,
                                 String reason, Map<String, Object> suggestedParams,
                                 double score) {}

    private final CorrectionRegistry registry;

    private Map<String, AlgorithmDoc> algorithms   = Collections.emptyMap();
    private Map<String, IssueMapping> issueMap     = Collections.emptyMap();
    private Map<String, Workflow>     workflowMap  = Collections.emptyMap();

    public AlgorithmKnowledgeGraph(CorrectionRegistry registry) {
        this.registry = registry;
    }

    // -------------------------------------------------------------------------
    // Loading
    // -------------------------------------------------------------------------

    @PostConstruct
    @SuppressWarnings("unchecked")
    public void load() {
        Yaml yaml = new Yaml();
        Map<String, Object> root;
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(RESOURCE)) {
            if (in == null) {
                log.warn("Knowledge graph resource missing: {} — graph disabled", RESOURCE);
                return;
            }
            root = yaml.load(in);
        } catch (Exception e) {
            log.error("Failed to parse {}; knowledge graph disabled", RESOURCE, e);
            return;
        }

        Map<String, Object> algosRaw = (Map<String, Object>) root.getOrDefault("algorithms", Map.of());
        Map<String, Object> issueRaw = (Map<String, Object>) root.getOrDefault("issue_to_algorithms", Map.of());
        Map<String, Object> wfRaw    = (Map<String, Object>) root.getOrDefault("workflows", Map.of());

        Set<String> liveIds = registry.ids();

        Map<String, AlgorithmDoc> algos = new TreeMap<>();
        for (var e : algosRaw.entrySet()) {
            String id = e.getKey();
            Map<String, Object> v = (Map<String, Object>) e.getValue();
            algos.put(id, parseAlgorithm(id, v, liveIds.contains(id)));
        }

        Map<String, IssueMapping> issues = new LinkedHashMap<>();
        for (var e : issueRaw.entrySet()) {
            String issue = e.getKey();
            Map<String, Object> v = (Map<String, Object>) e.getValue();
            issues.put(issue, new IssueMapping(
                    issue,
                    (String) v.get("primary"),
                    asStringList(v.get("alternatives")),
                    asStringMap(v.get("param_hints"))
            ));
        }

        Map<String, Workflow> wfs = new LinkedHashMap<>();
        for (var e : wfRaw.entrySet()) {
            String wfId = e.getKey();
            Map<String, Object> v = (Map<String, Object>) e.getValue();
            List<String> steps = asStringList(v.get("steps"));
            boolean avail = steps.stream().allMatch(liveIds::contains);
            wfs.put(wfId, new Workflow(
                    wfId,
                    (String) v.getOrDefault("description", ""),
                    asStringList(v.get("when")),
                    steps,
                    avail
            ));
        }

        this.algorithms  = Map.copyOf(algos);
        this.issueMap    = Map.copyOf(issues);
        this.workflowMap = Map.copyOf(wfs);

        long availableCount = algos.values().stream().filter(AlgorithmDoc::available).count();
        log.info("Loaded knowledge graph: {} algorithms ({} available), {} issue mappings, {} workflows",
                algos.size(), availableCount, issues.size(), wfs.size());
    }

    @SuppressWarnings("unchecked")
    private static AlgorithmDoc parseAlgorithm(String id, Map<String, Object> v, boolean available) {
        List<ParamSpec> params = new ArrayList<>();
        Object pRaw = v.get("params");
        if (pRaw instanceof Map<?,?> pm) {
            for (var pe : ((Map<String, Object>) pm).entrySet()) {
                Map<String, Object> spec = (Map<String, Object>) pe.getValue();
                Double min = null, max = null;
                Object range = spec.get("range");
                if (range instanceof List<?> r && r.size() == 2) {
                    min = toDouble(r.get(0));
                    max = toDouble(r.get(1));
                }
                params.add(new ParamSpec(
                        pe.getKey(),
                        spec.get("default"),
                        (String) spec.getOrDefault("type", "double"),
                        min, max,
                        (String) spec.getOrDefault("description", "")
                ));
            }
        }
        return new AlgorithmDoc(
                id,
                (String) v.getOrDefault("family", "other"),
                (String) v.getOrDefault("cost", "low"),
                collapse((String) v.getOrDefault("description", "")),
                Boolean.TRUE.equals(v.get("region_aware")),
                available,
                asStringList(v.get("good_for")),
                asStringList(v.get("bad_for")),
                asStringList(v.get("combines_well_with")),
                List.copyOf(params)
        );
    }

    // -------------------------------------------------------------------------
    // Query API
    // -------------------------------------------------------------------------

    /**
     * Rank algorithms for a set of detected issues. Only algorithms currently
     * present in the {@link CorrectionRegistry} are returned — unimplemented
     * algorithms from the knowledge graph are silently skipped.
     *
     * <p>Scoring rules (roughly):</p>
     * <ul>
     *   <li>+1.0 for each issue where the algorithm is the primary recommendation.</li>
     *   <li>+0.7, +0.6, +0.5 ... for each issue where it is listed as an alternative
     *       (index-dependent).</li>
     *   <li>−0.8 penalty if the algorithm's {@code bad_for} overlaps any detected issue —
     *       strong enough to drop it below any positive match.</li>
     *   <li>−0.05 for {@code cost=high}, +0.05 for {@code cost=low} — only breaks ties.</li>
     * </ul>
     */
    public List<Recommendation> recommend(List<String> issues) {
        if (issues == null || issues.isEmpty()) return List.of();

        Set<String> live = registry.ids();
        Map<String, Double>         score  = new HashMap<>();
        Map<String, List<String>>   reason = new HashMap<>();

        for (String issue : issues) {
            IssueMapping m = issueMap.get(issue);
            if (m == null) continue;

            if (m.primary() != null && live.contains(m.primary())) {
                score.merge(m.primary(), 1.0, Double::sum);
                reason.computeIfAbsent(m.primary(), k -> new ArrayList<>())
                      .add("primary for " + issue);
            }
            int i = 0;
            for (String alt : m.alternatives()) {
                if (live.contains(alt)) {
                    double s = Math.max(0.2, 0.7 - 0.1 * i);
                    score.merge(alt, s, Double::sum);
                    reason.computeIfAbsent(alt, k -> new ArrayList<>())
                          .add("alternative for " + issue);
                }
                i++;
            }
        }

        // bad_for and cost adjustments
        for (var e : new HashMap<>(score).entrySet()) {
            AlgorithmDoc doc = algorithms.get(e.getKey());
            if (doc == null) continue;
            boolean conflicts = doc.badFor().stream().anyMatch(issues::contains);
            if (conflicts) {
                score.merge(e.getKey(), -0.8, Double::sum);
                reason.computeIfAbsent(e.getKey(), k -> new ArrayList<>())
                      .add("penalty: bad_for overlap");
            }
            if ("high".equalsIgnoreCase(doc.cost()))      score.merge(e.getKey(), -0.05, Double::sum);
            else if ("low".equalsIgnoreCase(doc.cost()))  score.merge(e.getKey(),  0.05, Double::sum);
        }

        // Gather suggested-param hints from the issue mappings.
        Map<String, Map<String, Object>> suggestedParams = new HashMap<>();
        for (String issue : issues) {
            IssueMapping m = issueMap.get(issue);
            if (m == null) continue;
            for (var hint : m.paramHints().entrySet()) {
                if (!score.containsKey(hint.getKey())) continue;
                suggestedParams
                        .computeIfAbsent(hint.getKey(), k -> new LinkedHashMap<>())
                        .put("hint_for_" + issue, hint.getValue());
            }
        }

        List<Recommendation> out = new ArrayList<>();
        score.forEach((id, s) -> {
            if (s <= 0) return;
            AlgorithmDoc doc = algorithms.get(id);
            out.add(new Recommendation(
                    id,
                    doc == null ? "" : doc.family(),
                    doc == null ? "" : doc.cost(),
                    String.join("; ", reason.getOrDefault(id, List.of())),
                    suggestedParams.getOrDefault(id, Map.of()),
                    round(s)
            ));
        });
        out.sort(Comparator.comparingDouble(Recommendation::score).reversed());
        return out;
    }

    public Optional<AlgorithmDoc> describe(String algoId) {
        if (algoId == null) return Optional.empty();
        return Optional.ofNullable(algorithms.get(algoId));
    }

    /** All workflows whose every step is currently implemented. */
    public List<Workflow> availableWorkflows() {
        return workflowMap.values().stream().filter(Workflow::available).toList();
    }

    /** Raw workflows map — includes ones with unimplemented steps, for diagnostics. */
    public List<Workflow> allWorkflows() {
        return List.copyOf(workflowMap.values());
    }

    /** Available algorithm ids — used by health checks and diagnostics. */
    public Set<String> knownAlgorithmIds() {
        return algorithms.keySet();
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private static List<String> asStringList(Object v) {
        if (v instanceof List<?> l) {
            List<String> out = new ArrayList<>(l.size());
            for (Object o : l) if (o != null) out.add(o.toString());
            return List.copyOf(out);
        }
        return List.of();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, String> asStringMap(Object v) {
        if (v instanceof Map<?,?> m) {
            Map<String, String> out = new LinkedHashMap<>();
            for (var e : ((Map<String, Object>) m).entrySet()) {
                if (e.getValue() != null) out.put(e.getKey(), collapse(e.getValue().toString()));
            }
            return Map.copyOf(out);
        }
        return Map.of();
    }

    private static Double toDouble(Object v) {
        return v instanceof Number n ? n.doubleValue() : null;
    }

    private static String collapse(String s) {
        return s == null ? "" : s.replaceAll("\\s+", " ").trim();
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
