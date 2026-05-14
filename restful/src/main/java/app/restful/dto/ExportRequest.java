package app.restful.dto;

import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ExportRequest(
        String method,
        Map<String, Object> parameters,
        String imagePath,
        RegionDto region,
        String format,      // "jpg" | "png" | "tiff"
        Integer quality,    // JPEG quality 1-100; null = 95
        String targetDir,   // null = workspace default
        String naming       // "suffix" | "original" | "timestamp"
) {}
