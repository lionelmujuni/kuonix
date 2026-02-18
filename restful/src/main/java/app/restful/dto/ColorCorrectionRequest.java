package app.restful.dto;

import java.util.Map;

public record ColorCorrectionRequest(
        String method,
        Map<String, Object> parameters,  // Changed from Map<String, Double> to support mixed types
        String imagePath
) {}
