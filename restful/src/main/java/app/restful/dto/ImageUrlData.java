package app.restful.dto;

/**
 * Data URL information for a single image.
 */
public record ImageUrlData(
    String path,
    String dataUrl,  // Base64 data URL (data:image/jpeg;base64,...)
    boolean exists   // Whether file exists in workspace
) {
}
