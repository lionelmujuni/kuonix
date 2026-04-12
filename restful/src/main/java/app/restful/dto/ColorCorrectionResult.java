package app.restful.dto;

public record ColorCorrectionResult(
        String base64Image,
        boolean success,
        String message,
        String outputPath
) {}
