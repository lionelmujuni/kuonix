package app.restful.dto;

import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ColorCorrectionRequest(
        String method,
        Map<String, Object> parameters,
        String imagePath,
        RegionDto region   // optional — null means correct the whole image
) {}
