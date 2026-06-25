package app.restful.dto;

import java.util.List;

public record UploadResponse(boolean success, List<String> paths, List<ExifData> exifList, String message) {}