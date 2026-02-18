package app.restful.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "classifier.thresholds")
public class ClassifierThresholds {
    private double underexpMedianMax;
    private double underexpBlackTailMinPct;
    private double overexpMedianMin;
    private double overexpWhiteTailMinPct;
    private double blackClipLevel;
    private double whiteClipLevel;
    private double lowContrastMinSpan;
    private double highContrastTailPct;
    private double dullMeanSMax;
    private double dullP95SMax;
    private double overSatGlobalP95Min;
    private double overSatChannelP95Min;
    private double castABDistMin;
    private double noiseShadowMinRatio;
    private double shadowMaskThreshold;
    private double skinDetectMinPixels;
    private double skinSatMin;
    private double skinSatMax;
    private double skinLineDeg;
    private double skinLineTolDeg;
    private double skinOverSatMin;

    // Getters
    public double getUnderexpMedianMax() { return underexpMedianMax; }
    public double getUnderexpBlackTailMinPct() { return underexpBlackTailMinPct; }
    public double getOverexpMedianMin() { return overexpMedianMin; }
    public double getOverexpWhiteTailMinPct() { return overexpWhiteTailMinPct; }
    public double getBlackClipLevel() { return blackClipLevel; }
    public double getWhiteClipLevel() { return whiteClipLevel; }
    public double getLowContrastMinSpan() { return lowContrastMinSpan; }
    public double getHighContrastTailPct() { return highContrastTailPct; }
    public double getDullMeanSMax() { return dullMeanSMax; }
    public double getDullP95SMax() { return dullP95SMax; }
    public double getOverSatGlobalP95Min() { return overSatGlobalP95Min; }
    public double getOverSatChannelP95Min() { return overSatChannelP95Min; }
    public double getCastABDistMin() { return castABDistMin; }
    public double getNoiseShadowMinRatio() { return noiseShadowMinRatio; }
    public double getShadowMaskThreshold() { return shadowMaskThreshold; }
    public double getSkinDetectMinPixels() { return skinDetectMinPixels; }
    public double getSkinSatMin() { return skinSatMin; }
    public double getSkinSatMax() { return skinSatMax; }
    public double getSkinLineDeg() { return skinLineDeg; }
    public double getSkinLineTolDeg() { return skinLineTolDeg; }
    public double getSkinOverSatMin() { return skinOverSatMin; }

    // Setters (required for @ConfigurationProperties binding)
    public void setUnderexpMedianMax(double value) { this.underexpMedianMax = value; }
    public void setUnderexpBlackTailMinPct(double value) { this.underexpBlackTailMinPct = value; }
    public void setOverexpMedianMin(double value) { this.overexpMedianMin = value; }
    public void setOverexpWhiteTailMinPct(double value) { this.overexpWhiteTailMinPct = value; }
    public void setBlackClipLevel(double value) { this.blackClipLevel = value; }
    public void setWhiteClipLevel(double value) { this.whiteClipLevel = value; }
    public void setLowContrastMinSpan(double value) { this.lowContrastMinSpan = value; }
    public void setHighContrastTailPct(double value) { this.highContrastTailPct = value; }
    public void setDullMeanSMax(double value) { this.dullMeanSMax = value; }
    public void setDullP95SMax(double value) { this.dullP95SMax = value; }
    public void setOverSatGlobalP95Min(double value) { this.overSatGlobalP95Min = value; }
    public void setOverSatChannelP95Min(double value) { this.overSatChannelP95Min = value; }
    public void setCastABDistMin(double value) { this.castABDistMin = value; }
    public void setNoiseShadowMinRatio(double value) { this.noiseShadowMinRatio = value; }
    public void setShadowMaskThreshold(double value) { this.shadowMaskThreshold = value; }
    public void setSkinDetectMinPixels(double value) { this.skinDetectMinPixels = value; }
    public void setSkinSatMin(double value) { this.skinSatMin = value; }
    public void setSkinSatMax(double value) { this.skinSatMax = value; }
    public void setSkinLineDeg(double value) { this.skinLineDeg = value; }
    public void setSkinLineTolDeg(double value) { this.skinLineTolDeg = value; }
    public void setSkinOverSatMin(double value) { this.skinOverSatMin = value; }
}
