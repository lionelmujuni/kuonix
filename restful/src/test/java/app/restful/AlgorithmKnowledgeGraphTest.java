package app.restful;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import app.restful.services.AlgorithmKnowledgeGraph;
import app.restful.services.AlgorithmKnowledgeGraph.AlgorithmDoc;
import app.restful.services.AlgorithmKnowledgeGraph.Recommendation;
import app.restful.services.AlgorithmKnowledgeGraph.Workflow;

@SpringBootTest
public class AlgorithmKnowledgeGraphTest {

    @Autowired
    private AlgorithmKnowledgeGraph graph;

    @Test
    void loadsKnownAlgorithms() {
        assertTrue(graph.knownAlgorithmIds().contains("gray_world"));
        assertTrue(graph.knownAlgorithmIds().contains("clahe_lab"));
        assertTrue(graph.knownAlgorithmIds().contains("vibrance"));
        // Aspirational (not yet implemented) entries still load.
        assertTrue(graph.knownAlgorithmIds().contains("msrcr_retinex"));
    }

    @Test
    void describeReturnsDocForImplementedAlgorithm() {
        Optional<AlgorithmDoc> doc = graph.describe("clahe_lab");
        assertTrue(doc.isPresent());
        AlgorithmDoc d = doc.get();
        assertEquals("clahe_lab", d.id());
        assertEquals("contrast", d.family());
        assertTrue(d.available(), "clahe_lab is implemented in Phase 1");
        assertFalse(d.params().isEmpty());
        assertTrue(d.params().stream().anyMatch(p -> p.name().equals("clipLimit")));
    }

    @Test
    void describeAvailabilityMatchesRegistry() {
        // Every algorithm declared in the knowledge graph should be describable
        // and (now that all 21 are implemented) tagged available=true.
        for (String id : graph.knownAlgorithmIds()) {
            Optional<AlgorithmDoc> doc = graph.describe(id);
            assertTrue(doc.isPresent(), id + " should be describable");
            assertTrue(doc.get().available(),
                    id + " should be tagged available — its bean is missing from CorrectionRegistry");
        }
        // A made-up id is never describable.
        assertTrue(graph.describe("definitely_not_a_real_algo").isEmpty());
    }

    @Test
    void describeMarksHslTargetedAvailable() {
        Optional<AlgorithmDoc> doc = graph.describe("hsl_targeted");
        assertTrue(doc.isPresent());
        assertTrue(doc.get().available(), "hsl_targeted is implemented in Week 2");
        assertTrue(doc.get().params().stream().anyMatch(p -> p.name().equals("redSat")));
    }

    @Test
    void describeReturnsEmptyForUnknown() {
        assertTrue(graph.describe("fictional_algo").isEmpty());
        assertTrue(graph.describe(null).isEmpty());
    }

    @Test
    void recommendForContrastIncreaseReturnsClahe() {
        List<Recommendation> recs = graph.recommend(List.of("Needs_Contrast_Increase"));
        assertFalse(recs.isEmpty());
        // clahe_lab is primary and implemented; ace and local_laplacian are not.
        assertEquals("clahe_lab", recs.get(0).algorithmId());
        assertTrue(recs.get(0).score() >= 1.0);
    }

    @Test
    void recommendOnlyReturnsImplementedAlgorithms() {
        // Every recommendation, for every issue, must point at an algorithm
        // that the live CorrectionRegistry actually carries.
        Set<String> known = graph.knownAlgorithmIds();
        assertFalse(known.isEmpty());
        for (String issue : List.of("Needs_Exposure_Increase",
                                    "Needs_Exposure_Decrease",
                                    "Needs_Contrast_Increase",
                                    "Needs_Contrast_Decrease",
                                    "Needs_Saturation_Increase",
                                    "Oversaturated_Global",
                                    "ColorCast_Blue",
                                    "Needs_Noise_Reduction",
                                    "SkinTone_Too_Green",
                                    "Hazy",
                                    "Crushed_Shadows",
                                    "Clipped_Highlights")) {
            for (Recommendation r : graph.recommend(List.of(issue))) {
                assertTrue(known.contains(r.algorithmId()),
                        issue + " surfaced unknown algorithm " + r.algorithmId());
            }
        }
    }

    @Test
    void recommendEmptyIssuesReturnsEmpty() {
        assertTrue(graph.recommend(List.of()).isEmpty());
        assertTrue(graph.recommend(null).isEmpty());
    }

    @Test
    void recommendBadForOverlapDropsAlgorithmBelowAlternatives() {
        // Oversaturated_Global: primary=gamut_compress (unimpl),
        // alternative=saturation (impl). saturation has
        // bad_for=[Oversaturated_Global, SkinTone_Too_OrangeRed] — so its
        // -0.8 penalty outweighs its alternative score. The list may be
        // empty OR saturation may have negative total. Verify either:
        List<Recommendation> recs = graph.recommend(List.of("Oversaturated_Global"));
        // saturation should NOT appear since after penalty its score goes negative
        assertFalse(
                recs.stream().anyMatch(r -> r.algorithmId().equals("saturation")),
                "saturation's bad_for penalty should exclude it from results");
    }

    @Test
    void recommendCarriesParamHints() {
        // Needs_Exposure_Increase has a param_hint for `exposure`.
        List<Recommendation> recs = graph.recommend(List.of("Needs_Exposure_Increase"));
        Recommendation exposureRec = recs.stream()
                .filter(r -> r.algorithmId().equals("exposure"))
                .findFirst().orElse(null);
        assertNotNull(exposureRec);
        assertFalse(exposureRec.suggestedParams().isEmpty(),
                "exposure rec should carry the param_hint from issue_to_algorithms");
    }

    @Test
    void availableWorkflowsOnlyIncludesFullyImplementedChains() {
        List<Workflow> wfs = graph.availableWorkflows();
        assertFalse(wfs.isEmpty(), "expected at least one available workflow");
        // All returned workflows must have `available=true` and every step
        // must resolve in the live registry.
        assertTrue(wfs.stream().allMatch(Workflow::available));
        assertTrue(wfs.stream().allMatch(w ->
                w.steps().stream().allMatch(graph.knownAlgorithmIds()::contains)));
    }

    @Test
    void recommendForHazyReturnsDarkChannelDehazePrimary() {
        List<Recommendation> recs = graph.recommend(List.of("Hazy"));
        assertFalse(recs.isEmpty(), "Hazy must produce at least one recommendation");
        assertEquals("dark_channel_dehaze", recs.get(0).algorithmId());
    }

    @Test
    void recommendForCrushedShadowsReturnsLocalLaplacianPrimary() {
        List<Recommendation> recs = graph.recommend(List.of("Crushed_Shadows"));
        assertFalse(recs.isEmpty());
        assertEquals("local_laplacian", recs.get(0).algorithmId());
    }

    @Test
    void recommendForClippedHighlightsReturnsHighlightRecoveryPrimary() {
        List<Recommendation> recs = graph.recommend(List.of("Clipped_Highlights"));
        assertFalse(recs.isEmpty());
        assertEquals("highlight_recovery", recs.get(0).algorithmId());
    }

    @Test
    void scoresSortedDescending() {
        // ColorCast_Blue has many alternatives; verify scores are sorted desc.
        List<Recommendation> recs = graph.recommend(List.of("ColorCast_Blue"));
        for (int i = 1; i < recs.size(); i++) {
            assertTrue(recs.get(i - 1).score() >= recs.get(i).score(),
                    "scores must be sorted descending at index " + i);
        }
    }
}
