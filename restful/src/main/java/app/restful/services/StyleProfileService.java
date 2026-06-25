package app.restful.services;

import app.restful.dto.ImageFeatures;
import app.restful.dto.PortfolioEntry;
import app.restful.dto.StyleProfile;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class StyleProfileService {

    private static final Logger log = LoggerFactory.getLogger(StyleProfileService.class);
    private static final Path SETTINGS_DIR   = Paths.get(System.getProperty("user.home"), ".kuonix");
    private static final Path PROFILES_FILE  = SETTINGS_DIR.resolve("style-profiles.json");
    private static final Path PORTFOLIO_FILE = SETTINGS_DIR.resolve("portfolio-index.json");
    private static final int  SCENE_DIMS     = 6;

    private final ImageAnalysisService analysisService;
    private final ObjectMapper mapper = new ObjectMapper();

    private List<StyleProfile> profilesCache;
    private PortfolioIndex portfolioCache;

    public StyleProfileService(ImageAnalysisService analysisService) {
        this.analysisService = analysisService;
        try { Files.createDirectories(SETTINGS_DIR); } catch (IOException ignored) {}
    }

    // ---- Profiles CRUD ---------------------------------------------------

    public List<StyleProfile> getProfiles() {
        if (profilesCache != null) return profilesCache;
        if (Files.exists(PROFILES_FILE)) {
            try {
                profilesCache = mapper.readValue(PROFILES_FILE.toFile(),
                        new TypeReference<List<StyleProfile>>() {});
                return profilesCache;
            } catch (IOException e) {
                log.warn("Failed to load style profiles: {}", e.getMessage());
            }
        }
        profilesCache = new ArrayList<>();
        return profilesCache;
    }

    public StyleProfile save(StyleProfile profile) {
        List<StyleProfile> profiles = getProfiles();
        profiles.removeIf(p -> p.id().equals(profile.id()));
        profiles.add(profile);
        persist();
        return profile;
    }

    public boolean delete(String id) {
        List<StyleProfile> profiles = getProfiles();
        boolean removed = profiles.removeIf(p -> p.id().equals(id));
        if (removed) persist();
        return removed;
    }

    public StyleProfile createFromReference(String imagePath, String name) {
        ImageFeatures f = analysisService.compute(Paths.get(imagePath), false);
        StyleProfile profile = StyleProfile.fromFeatures(UUID.randomUUID().toString(), name, f, imagePath);
        return save(profile);
    }

    // ---- Portfolio indexing ----------------------------------------------

    public List<PortfolioEntry> indexPortfolio(List<String> paths) {
        List<double[]> rawVecs = new ArrayList<>();
        List<StyleProfile> profiles = new ArrayList<>();

        for (String p : paths) {
            try {
                ImageFeatures f = analysisService.compute(Paths.get(p), false);
                rawVecs.add(toRawSceneVec(f));
                profiles.add(StyleProfile.fromFeatures(UUID.randomUUID().toString(),
                        filenameOf(p), f, p));
            } catch (Exception e) {
                log.warn("Skipping portfolio entry {}: {}", p, e.getMessage());
            }
        }

        if (rawVecs.isEmpty()) return List.of();

        double[] min = new double[SCENE_DIMS];
        double[] max = new double[SCENE_DIMS];
        Arrays.fill(min, Double.MAX_VALUE);
        Arrays.fill(max, -Double.MAX_VALUE);
        for (double[] v : rawVecs) {
            for (int d = 0; d < SCENE_DIMS; d++) {
                if (v[d] < min[d]) min[d] = v[d];
                if (v[d] > max[d]) max[d] = v[d];
            }
        }

        List<PortfolioEntry> entries = new ArrayList<>();
        for (int i = 0; i < rawVecs.size(); i++) {
            double[] normalized = normalize(rawVecs.get(i), min, max);
            entries.add(new PortfolioEntry(paths.get(i), normalized, profiles.get(i)));
        }

        portfolioCache = new PortfolioIndex(entries, min, max);
        persistPortfolio();
        return entries;
    }

    // ---- Target resolution -----------------------------------------------

    public Optional<StyleProfile> resolveTarget(ImageFeatures current) {
        PortfolioIndex idx = getPortfolioIndex();

        if (idx == null || idx.entries().isEmpty()) {
            return getProfiles().stream()
                    .filter(p -> p.source() == StyleProfile.ProfileSource.SINGLE_REFERENCE)
                    .findFirst();
        }

        List<PortfolioEntry> entries = idx.entries();
        if (entries.size() == 1) return Optional.of(entries.get(0).derivedProfile());

        double[] queryVec = normalize(toRawSceneVec(current), idx.normMin(), idx.normMax());

        record Scored(PortfolioEntry entry, double sim) {}
        List<Scored> scored = entries.stream()
                .map(e -> new Scored(e, cosineSimilarity(queryVec, e.sceneVec())))
                .sorted(Comparator.comparingDouble(Scored::sim).reversed())
                .limit(3)
                .toList();

        double totalWeight = scored.stream().mapToDouble(Scored::sim).filter(s -> s > 0).sum();
        if (totalWeight < 1e-10) {
            double avgWeight = 1.0 / scored.size();
            return Optional.of(blend(scored.stream().map(Scored::entry)
                    .map(PortfolioEntry::derivedProfile).toList(),
                    Arrays.copyOf(new double[]{avgWeight, avgWeight, avgWeight}, scored.size())));
        }

        double[] weights = scored.stream()
                .mapToDouble(s -> Math.max(0, s.sim()) / totalWeight)
                .toArray();
        List<StyleProfile> top = scored.stream().map(s -> s.entry().derivedProfile()).toList();
        return Optional.of(blend(top, weights));
    }

    // ---- Internals -------------------------------------------------------

    private static double[] toRawSceneVec(ImageFeatures f) {
        return new double[]{f.medianY(), f.stdY(), f.meanS(), f.labABDist(),
                            f.darkChannelMean(), f.shadowNoiseRatio()};
    }

    private static double[] normalize(double[] v, double[] min, double[] max) {
        double[] norm = new double[v.length];
        for (int d = 0; d < v.length; d++) {
            double range = max[d] - min[d];
            norm[d] = range < 1e-10 ? 0.5 : (v[d] - min[d]) / range;
        }
        return norm;
    }

    private static double cosineSimilarity(double[] a, double[] b) {
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na  += a[i] * a[i];
            nb  += b[i] * b[i];
        }
        return dot / (Math.sqrt(na * nb) + 1e-10);
    }

    private static StyleProfile blend(List<StyleProfile> profiles, double[] weights) {
        double medY = 0, stdY = 0, meanS = 0, castA = 0, noise = 0, dark = 0;
        for (int i = 0; i < profiles.size(); i++) {
            StyleProfile p = profiles.get(i);
            double w = weights[i];
            medY  += w * p.targetMedianY();
            stdY  += w * p.targetStdY();
            meanS += w * p.targetMeanS();
            castA += w * p.targetCastAngleDeg();
            noise += w * p.targetShadowNoiseRatio();
            dark  += w * p.targetDarkChannelMean();
        }
        return new StyleProfile(
            "blend_" + UUID.randomUUID(), "Portfolio blend",
            StyleProfile.ProfileSource.PORTFOLIO_BLEND,
            medY, stdY, meanS, castA, noise, dark, null
        );
    }

    private void persist() {
        try {
            mapper.writerWithDefaultPrettyPrinter().writeValue(PROFILES_FILE.toFile(), profilesCache);
        } catch (IOException e) {
            log.error("Failed to save style profiles: {}", e.getMessage());
        }
    }

    private void persistPortfolio() {
        try {
            mapper.writerWithDefaultPrettyPrinter().writeValue(PORTFOLIO_FILE.toFile(), portfolioCache);
        } catch (IOException e) {
            log.error("Failed to save portfolio index: {}", e.getMessage());
        }
    }

    private PortfolioIndex getPortfolioIndex() {
        if (portfolioCache != null) return portfolioCache;
        if (Files.exists(PORTFOLIO_FILE)) {
            try {
                portfolioCache = mapper.readValue(PORTFOLIO_FILE.toFile(), PortfolioIndex.class);
                return portfolioCache;
            } catch (IOException e) {
                log.warn("Failed to load portfolio index: {}", e.getMessage());
            }
        }
        return null;
    }

    private static String filenameOf(String p) {
        if (p == null) return "";
        String[] parts = p.split("[/\\\\]");
        return parts[parts.length - 1];
    }

    // Internal holder for portfolio + normalization params.
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    record PortfolioIndex(List<PortfolioEntry> entries, double[] normMin, double[] normMax) {}
}
