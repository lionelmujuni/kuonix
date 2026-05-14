package app.restful.dto;

public record ImageFeatures(
        int width, int height,
        double medianY, double meanY, double p5Y, double p95Y,
        double blackPct, double whitePct, double stdY,
        double meanS, double p95S,
        boolean overRed, boolean overGreen, boolean overBlue,
        boolean overCyan, boolean overMagenta, boolean overYellow,
        double labAMean, double labBMean, double labABDist, double castAngleDeg,
        double shadowNoiseRatio,
        boolean hasSkin, double skinHueMeanDeg, double skinSatMean,
        double darkChannelMean
) {}
