package app.restful.dto;

import java.util.List;

public record StyleGap(
    double brightnessDelta,
    double contrastDelta,
    double saturationDelta,
    double castAngleDelta,
    double noiseDelta,
    List<String> suggestedAlgorithms
) {}
