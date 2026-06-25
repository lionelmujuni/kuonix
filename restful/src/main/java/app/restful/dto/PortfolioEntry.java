package app.restful.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record PortfolioEntry(
    String imagePath,
    double[] sceneVec,
    StyleProfile derivedProfile
) {}
