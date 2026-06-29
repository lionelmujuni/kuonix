package app.restful.services;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import app.restful.dto.ExifData;
import app.restful.dto.ResourceLink;
import app.restful.services.CameraKnowledgeBase.IssueKnowledge;

/**
 * Builds the resource links shown alongside a camera tip: the curated reading
 * from the knowledge base, plus Google/YouTube search deep-links tailored to the
 * shot by seeding the query with the camera model from EXIF. The search links
 * never break (a search always resolves) and carry no hallucination risk.
 */
@Service
public class ResourceLinkService {

    /** Curated KB links followed by EXIF-tailored search deep-links. */
    public List<ResourceLink> linksFor(IssueKnowledge knowledge, ExifData exif) {
        List<ResourceLink> out = new ArrayList<>(knowledge.resources());
        out.addAll(searchLinks(knowledge.searchTerms(), exif));
        return List.copyOf(out);
    }

    /**
     * Google + YouTube search links for {@code terms}, prefixed with the camera
     * model when known. Returns empty when there are no terms.
     */
    public List<ResourceLink> searchLinks(String terms, ExifData exif) {
        if (terms == null || terms.isBlank()) return List.of();
        String camera = (exif != null && exif.camera() != null) ? exif.camera().trim() : "";
        String query = (camera.isEmpty() ? "" : camera + " ") + terms.trim();
        String q = URLEncoder.encode(query, StandardCharsets.UTF_8);
        return List.of(
                new ResourceLink("Search Google",  "https://www.google.com/search?q=" + q, "search"),
                new ResourceLink("Search YouTube", "https://www.youtube.com/results?search_query=" + q, "search"));
    }
}
