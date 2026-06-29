package app.restful.services;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import app.restful.dto.ImageIssue;
import app.restful.dto.ResourceLink;
import jakarta.annotation.PostConstruct;

/**
 * Loads {@code photography/camera-feedback.yaml} at startup and exposes the
 * camera-side knowledge for each detected {@link ImageIssue}.
 *
 * <p>Each entry carries the technical facts ({@code cause}, {@code physics},
 * {@code levers}) that ground the AI-rendered tip, plus a deterministic
 * {@code baseTip} and ordered EXIF-conditional overrides used directly when AI
 * is unavailable. Keeping the knowledge external lets photographic educators
 * tune wording without a rebuild.</p>
 */
@Service
public class CameraKnowledgeBase {

    private static final Logger log = LoggerFactory.getLogger(CameraKnowledgeBase.class);
    private static final String RESOURCE = "photography/camera-feedback.yaml";

    /** A single EXIF-conditional tip override. {@code when} is a condition token. */
    public record ConditionTip(String when, String tip, String severity) {}

    /** Knowledge for one {@link ImageIssue}. */
    public record IssueKnowledge(String issue, String cause, String physics,
                                 List<String> levers, String severity,
                                 String baseTip, List<ConditionTip> conditions,
                                 List<ResourceLink> resources, String searchTerms) {}

    private Map<String, IssueKnowledge> knowledge = Collections.emptyMap();

    @PostConstruct
    @SuppressWarnings("unchecked")
    public void load() {
        Yaml yaml = new Yaml();
        Map<String, Object> root;
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(RESOURCE)) {
            if (in == null) {
                log.warn("Camera knowledge base resource missing: {} — feedback disabled", RESOURCE);
                return;
            }
            root = yaml.load(in);
        } catch (Exception e) {
            log.error("Failed to parse {}; camera knowledge base disabled", RESOURCE, e);
            return;
        }

        Map<String, Object> issuesRaw = (Map<String, Object>) root.getOrDefault("issues", Map.of());
        Map<String, IssueKnowledge> out = new LinkedHashMap<>();
        for (var e : issuesRaw.entrySet()) {
            String issue = e.getKey();
            if (!isImageIssue(issue)) {
                log.warn("Skipping unknown issue key in {}: {}", RESOURCE, issue);
                continue;
            }
            out.put(issue, parse(issue, (Map<String, Object>) e.getValue()));
        }

        this.knowledge = Map.copyOf(out);
        log.info("Loaded camera knowledge base: {} issue entries", out.size());
    }

    @SuppressWarnings("unchecked")
    private static IssueKnowledge parse(String issue, Map<String, Object> v) {
        List<ConditionTip> conditions = new ArrayList<>();
        if (v.get("conditions") instanceof List<?> raw) {
            for (Object o : raw) {
                if (o instanceof Map<?, ?> cm) {
                    Map<String, Object> c = (Map<String, Object>) cm;
                    conditions.add(new ConditionTip(
                            str(c.get("when")),
                            collapse(str(c.get("tip"))),
                            str(c.getOrDefault("severity", "medium"))));
                }
            }
        }
        return new IssueKnowledge(
                issue,
                collapse(str(v.get("cause"))),
                collapse(str(v.get("physics"))),
                asStringList(v.get("levers")),
                str(v.getOrDefault("severity", "medium")),
                collapse(str(v.get("base_tip"))),
                List.copyOf(conditions),
                parseResources(v.get("resources")),
                collapse(str(v.get("search_terms"))));
    }

    @SuppressWarnings("unchecked")
    private static List<ResourceLink> parseResources(Object raw) {
        List<ResourceLink> out = new ArrayList<>();
        if (raw instanceof List<?> l) {
            for (Object o : l) {
                if (o instanceof Map<?, ?> rm) {
                    Map<String, Object> r = (Map<String, Object>) rm;
                    out.add(new ResourceLink(
                            str(r.get("label")),
                            str(r.get("url")),
                            str(r.getOrDefault("type", "article"))));
                }
            }
        }
        return List.copyOf(out);
    }

    /** Knowledge for an issue, or empty when the issue has no camera tip. */
    public Optional<IssueKnowledge> describe(ImageIssue issue) {
        if (issue == null) return Optional.empty();
        return Optional.ofNullable(knowledge.get(issue.name()));
    }

    /** Issue keys with a knowledge entry — used by diagnostics and tests. */
    public Set<String> knownIssues() {
        return knowledge.keySet();
    }

    private static boolean isImageIssue(String name) {
        try {
            ImageIssue.valueOf(name);
            return true;
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private static List<String> asStringList(Object v) {
        if (v instanceof List<?> l) {
            List<String> out = new ArrayList<>(l.size());
            for (Object o : l) if (o != null) out.add(o.toString());
            return List.copyOf(out);
        }
        return List.of();
    }

    private static String str(Object v) {
        return v == null ? "" : v.toString();
    }

    private static String collapse(String s) {
        return s == null ? "" : s.replaceAll("\\s+", " ").trim();
    }
}
