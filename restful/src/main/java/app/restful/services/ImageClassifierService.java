package app.restful.services;

import app.restful.config.ClassifierThresholds;
import app.restful.dto.ImageFeatures;
import app.restful.dto.ImageIssue;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;

@Service
public class ImageClassifierService {
    private final ClassifierThresholds th;

    public ImageClassifierService(ClassifierThresholds th) {
        this.th = th;
    }

    public List<ImageIssue> classify(ImageFeatures f) {
        EnumSet<ImageIssue> labels = EnumSet.noneOf(ImageIssue.class);

        // Exposure
        if (f.medianY() <= th.getUnderexpMedianMax() && f.blackPct() >= th.getUnderexpBlackTailMinPct()) {
            labels.add(ImageIssue.Needs_Exposure_Increase);
        }
        if (f.medianY() >= th.getOverexpMedianMin() && f.whitePct() >= th.getOverexpWhiteTailMinPct()) {
            labels.add(ImageIssue.Needs_Exposure_Decrease);
        }

        // Contrast
        double span = f.p95Y() - f.p5Y();
        double tails = f.blackPct() + f.whitePct();
        if (span < th.getLowContrastMinSpan()) labels.add(ImageIssue.Needs_Contrast_Increase);
        if (tails >= th.getHighContrastTailPct()) labels.add(ImageIssue.Needs_Contrast_Decrease);

        // Saturation
        if (f.meanS() <= th.getDullMeanSMax() && f.p95S() <= th.getDullP95SMax()) {
            labels.add(ImageIssue.Needs_Saturation_Increase);
        }
        if (f.p95S() >= th.getOverSatGlobalP95Min()) labels.add(ImageIssue.Oversaturated_Global);

        if (f.overRed()) labels.add(ImageIssue.Oversaturated_Red);
        if (f.overGreen()) labels.add(ImageIssue.Oversaturated_Green);
        if (f.overBlue()) labels.add(ImageIssue.Oversaturated_Blue);
        if (f.overCyan()) labels.add(ImageIssue.Oversaturated_Cyan);
        if (f.overMagenta()) labels.add(ImageIssue.Oversaturated_Magenta);
        if (f.overYellow()) labels.add(ImageIssue.Oversaturated_Yellow);

        // Cast
        if (f.labABDist() >= th.getCastABDistMin()) {
            double ang = f.castAngleDeg();
            labels.add(nearestCast(ang));
        }

        // Noise
        if (f.shadowNoiseRatio() >= th.getNoiseShadowMinRatio()) {
            labels.add(ImageIssue.Needs_Noise_Reduction);
        }

        // Skin (currently feature OFF unless you add detection)
        if (f.hasSkin()) {
            double hue = f.skinHueMeanDeg();
            double line = th.getSkinLineDeg();
            double tol = th.getSkinLineTolDeg();
            double diff = angularDistance(hue, line);
            if (diff > tol) {
                // Direction heuristic: if hue > line, it's shifted towards green/yellow
                // if hue < line, it's shifted towards magenta/red
                double dir = ((hue - line) + 360.0) % 360.0;
                if (dir < 180) labels.add(ImageIssue.SkinTone_Too_Green);
                else labels.add(ImageIssue.SkinTone_Too_Magenta);
            }
            if (f.skinSatMean() < th.getSkinSatMin()) labels.add(ImageIssue.SkinTone_Too_Desaturated);
            if (f.skinSatMean() > th.getSkinOverSatMin()) labels.add(ImageIssue.SkinTone_Too_OrangeRed);
        }

        return labels.stream().sorted(Comparator.comparing(Enum::name)).toList();
    }

    private static double angularDistance(double a, double b) {
        double d = Math.abs(a-b);
        return Math.min(d, 360.0 - d);
    }

    private static ImageIssue nearestCast(double ang) {
        record Pair(ImageIssue issue, double deg){}
        Pair[] sectors = new Pair[]{
                new Pair(ImageIssue.ColorCast_Red, 0.0),
                new Pair(ImageIssue.ColorCast_Yellow, 90.0),
                new Pair(ImageIssue.ColorCast_Green, 180.0),
                new Pair(ImageIssue.ColorCast_Cyan, 135.0),
                new Pair(ImageIssue.ColorCast_Blue, 270.0),
                new Pair(ImageIssue.ColorCast_Magenta, 315.0),
        };
        Pair best = sectors[0];
        double bestd = 1e9;
        for (Pair s: sectors) {
            double d = Math.min(Math.abs(ang - s.deg), 360.0 - Math.abs(ang - s.deg));
            if (d < bestd) { bestd = d; best = s; }
        }
        return best.issue;
    }
}