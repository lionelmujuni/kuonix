package app.restful.dto;

import java.util.List;

/**
 * In-camera advice for one detected issue, with optional "learn more" resource
 * links (curated reading + EXIF-tailored search deep-links).
 */
public record CameraFeedback(String issue, String tip, String severity, List<ResourceLink> resources) {

    public CameraFeedback {
        resources = resources == null ? List.of() : List.copyOf(resources);
    }

    /** Convenience for feedback without resource links. */
    public CameraFeedback(String issue, String tip, String severity) {
        this(issue, tip, severity, List.of());
    }
}
