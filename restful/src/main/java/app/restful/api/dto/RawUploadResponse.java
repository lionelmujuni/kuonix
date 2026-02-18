package app.restful.api.dto;

import java.util.List;

/**
 * Response for RAW image upload with preview decode.
 * Contains preview paths for immediate display and task IDs for full decode tracking.
 */
public record RawUploadResponse(
    boolean success,
    List<RawImageInfo> images,
    String message
) {
}
