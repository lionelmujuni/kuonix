package app.restful.api;

import app.restful.dto.ImageFeatures;
import app.restful.dto.PortfolioEntry;
import app.restful.dto.StyleGap;
import app.restful.dto.StyleProfile;
import app.restful.services.ImageAnalysisService;
import app.restful.services.ImageFeaturesCache;
import app.restful.services.StyleGapService;
import app.restful.services.StyleProfileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/style-profiles")
@CrossOrigin(origins = "*")
public class StyleProfileController {

    private static final Logger log = LoggerFactory.getLogger(StyleProfileController.class);

    private final StyleProfileService profileService;
    private final StyleGapService gapService;
    private final ImageFeaturesCache featuresCache;
    private final ImageAnalysisService analysisService;

    public StyleProfileController(StyleProfileService profileService,
                                  StyleGapService gapService,
                                  ImageFeaturesCache featuresCache,
                                  ImageAnalysisService analysisService) {
        this.profileService  = profileService;
        this.gapService      = gapService;
        this.featuresCache   = featuresCache;
        this.analysisService = analysisService;
    }

    @GetMapping
    public List<StyleProfile> listProfiles() {
        return profileService.getProfiles();
    }

    @PostMapping
    public ResponseEntity<?> createProfile(@RequestBody CreateProfileRequest req) {
        try {
            StyleProfile profile = profileService.createFromReference(req.imagePath(), req.name());
            return ResponseEntity.ok(profile);
        } catch (Exception e) {
            log.error("Create profile failed: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteProfile(@PathVariable String id) {
        boolean removed = profileService.delete(id);
        return removed
            ? ResponseEntity.ok(Map.of("success", true))
            : ResponseEntity.notFound().build();
    }

    @PostMapping("/index-portfolio")
    public ResponseEntity<?> indexPortfolio(@RequestBody IndexPortfolioRequest req) {
        try {
            List<PortfolioEntry> entries = profileService.indexPortfolio(req.paths());
            log.info("Portfolio indexed: {} entries", entries.size());
            return ResponseEntity.ok(Map.of("indexed", entries.size()));
        } catch (Exception e) {
            log.error("Portfolio indexing failed: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/gap")
    public ResponseEntity<?> computeGap(
            @RequestParam String imagePath,
            @RequestParam(required = false) String profileId) {
        try {
            ImageFeatures features = featuresCache.get(Paths.get(imagePath), false);

            Optional<StyleProfile> target = profileId != null
                ? profileService.getProfiles().stream().filter(p -> p.id().equals(profileId)).findFirst()
                : profileService.resolveTarget(features);

            if (target.isEmpty()) {
                return ResponseEntity.ok(Map.of("gap", (Object) null, "message", "No style profile configured"));
            }

            StyleGap gap = gapService.compute(features, target.get());
            return ResponseEntity.ok(Map.of("gap", gap, "profile", target.get()));
        } catch (Exception e) {
            log.error("Gap computation failed for {}: {}", imagePath, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    record CreateProfileRequest(String name, String imagePath) {}
    record IndexPortfolioRequest(List<String> paths) {}
}
