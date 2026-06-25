package app.restful.services;

import app.restful.dto.ImageFeatures;
import app.restful.dto.StyleGap;
import app.restful.dto.StyleProfile;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class StyleGapService {

    public StyleGap compute(ImageFeatures current, StyleProfile target) {
        double brightnessDelta = target.targetMedianY() - current.medianY();
        double contrastDelta   = target.targetStdY()    - current.stdY();
        double saturationDelta = target.targetMeanS()   - current.meanS();
        double castAngleDelta  = target.targetCastAngleDeg()      - current.castAngleDeg();
        double noiseDelta      = target.targetShadowNoiseRatio()  - current.shadowNoiseRatio();
        double darkDelta       = target.targetDarkChannelMean()   - current.darkChannelMean();

        List<String> suggestions = new ArrayList<>();
        if (Math.abs(brightnessDelta) > 0.08)  suggestions.add("exposure");
        if (contrastDelta > 0.05)               suggestions.add("clahe_lab");
        if (saturationDelta > 0.10)             suggestions.add("vibrance");
        if (Math.abs(castAngleDelta) > 20.0)    suggestions.add("temperature_tint");
        if (noiseDelta < -0.08)                 suggestions.add("bm3d");
        if (darkDelta > 0.05)                   suggestions.add("dark_channel_dehaze");

        return new StyleGap(brightnessDelta, contrastDelta, saturationDelta,
                            castAngleDelta, noiseDelta, List.copyOf(suggestions));
    }
}
