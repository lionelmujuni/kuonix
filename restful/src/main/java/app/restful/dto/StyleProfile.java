package app.restful.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record StyleProfile(
    String id,
    String name,
    ProfileSource source,
    double targetMedianY,
    double targetStdY,
    double targetMeanS,
    double targetCastAngleDeg,
    double targetShadowNoiseRatio,
    double targetDarkChannelMean,
    String referenceImagePath
) {
    public enum ProfileSource { SINGLE_REFERENCE, PORTFOLIO_BLEND }

    public static StyleProfile fromFeatures(String id, String name, ImageFeatures f, String refPath) {
        return new StyleProfile(
            id, name, ProfileSource.SINGLE_REFERENCE,
            f.medianY(), f.stdY(), f.meanS(), f.castAngleDeg(),
            f.shadowNoiseRatio(), f.darkChannelMean(),
            refPath
        );
    }
}
