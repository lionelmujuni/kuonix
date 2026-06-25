package app.restful.api.dto;

import app.restful.dto.ExifData;

/**
 * Information about a single RAW image after preview decode.
 */
public record RawImageInfo(
    String previewPath,
    String rawPath,
    String taskId,
    int width,
    int height,
    String cameraModel,
    ExifData exif
) {
}
