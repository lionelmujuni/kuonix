package app.restful.dto;

import java.util.List;

/**
 * Response containing Base64 data URLs for persisted images.
 */
public record ImageUrlResponse(
    boolean success,
    List<ImageUrlData> images,
    String message
) {
}
