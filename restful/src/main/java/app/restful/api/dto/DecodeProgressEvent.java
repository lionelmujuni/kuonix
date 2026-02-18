package app.restful.api.dto;

/**
 * SSE event for batched RAW image decode progress.
 * Single event stream can report progress for multiple concurrent decode tasks.
 */
public record DecodeProgressEvent(
    String taskId,
    String status,          // "pending", "decoding", "complete", "error"
    int progress,           // 0-100
    String currentFile,     // Filename being processed
    String fullPath,        // Full-resolution image path (only when complete)
    Integer width,          // Full image width (only when complete)
    Integer height,         // Full image height (only when complete)
    String error            // Error message (only when status="error")
) {
    
    /**
     * Create progress update event.
     */
    public static DecodeProgressEvent progress(String taskId, int progress, String filename) {
        return new DecodeProgressEvent(taskId, "decoding", progress, filename, null, null, null, null);
    }
    
    /**
     * Create completion event.
     */
    public static DecodeProgressEvent complete(String taskId, String fullPath, int width, int height) {
        return new DecodeProgressEvent(taskId, "complete", 100, null, fullPath, width, height, null);
    }
    
    /**
     * Create error event.
     */
    public static DecodeProgressEvent error(String taskId, String errorMessage) {
        return new DecodeProgressEvent(taskId, "error", 0, null, null, null, null, errorMessage);
    }
}
