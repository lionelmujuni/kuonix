package app.restful.dto;

import java.util.List;

/**
 * Request to regenerate data URLs for persisted images.
 * Used by frontend to restore library images after app restart.
 */
public record ImageUrlRequest(List<String> paths) {
}
