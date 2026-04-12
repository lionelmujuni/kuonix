package app.restful.api.dto;

/**
 * Information about a single RAW image after preview decode.
 */
public record RawImageInfo(
    String previewPath,     // Path to half-size preview (immediate display)
    String rawPath,         // Path to original RAW file
    String taskId,          // UUID for tracking full decode progress
    int width,              // Preview image width
    int height,             // Preview image height
    String cameraModel      // Camera model (if detected)
) {
}
