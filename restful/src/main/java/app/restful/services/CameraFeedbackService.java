package app.restful.services;

import app.restful.dto.CameraFeedback;
import app.restful.dto.ExifData;
import app.restful.dto.ImageIssue;
import app.restful.services.CameraKnowledgeBase.ConditionTip;
import app.restful.services.CameraKnowledgeBase.IssueKnowledge;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns detected {@link ImageIssue}s + the image's EXIF into actionable
 * in-camera advice. Tip content lives in {@link CameraKnowledgeBase}
 * ({@code photography/camera-feedback.yaml}); this service selects the right
 * EXIF-conditional branch, substitutes EXIF values, and adds the cross-cutting
 * motion-blur check that is computed rather than looked up.
 */
@Service
public class CameraFeedbackService {

    private static final Pattern FRACTION = Pattern.compile("(\\d+)/(\\d+)");
    private static final Pattern DECIMAL  = Pattern.compile("([\\d.]+)\\s*sec");

    private final CameraKnowledgeBase knowledgeBase;

    public CameraFeedbackService(CameraKnowledgeBase knowledgeBase) {
        this.knowledgeBase = knowledgeBase;
    }

    public List<CameraFeedback> evaluate(List<ImageIssue> issues, ExifData exif) {
        List<CameraFeedback> feedback = new ArrayList<>();
        if (issues == null || issues.isEmpty()) return feedback;

        Integer iso = exif != null ? exif.iso() : null;
        Double  focalLength = exif != null ? exif.focalLength() : null;
        String  wbMode = exif != null ? exif.wbMode() : null;
        Double  shutterSec = exif != null ? parseShutterSeconds(exif.shutterSpeed()) : null;

        for (ImageIssue issue : issues) {
            IssueKnowledge k = knowledgeBase.describe(issue).orElse(null);
            if (k == null) continue; // no in-camera remedy for this issue

            String tip = k.baseTip();
            String severity = k.severity();
            for (ConditionTip c : k.conditions()) {
                if (matches(c.when(), iso, focalLength, wbMode)) {
                    tip = c.tip();
                    severity = c.severity();
                    break;
                }
            }
            feedback.add(new CameraFeedback(issue.name(), interpolate(tip, exif), severity));
        }

        // Cross-cutting motion-blur check — computed from the reciprocal rule
        // rather than looked up, so it lives here and not in the knowledge base.
        if (shutterSec != null && focalLength != null) {
            double minShutter = 1.0 / focalLength;
            if (shutterSec > minShutter * 1.2) {
                feedback.add(new CameraFeedback("MOTION_BLUR",
                    String.format("Shutter %.4f s is slower than the 1/%.0f s minimum for handheld at %.0f mm. Use a faster shutter, IS, or a tripod.",
                        shutterSec, focalLength, focalLength),
                    "high"));
            }
        }
        return feedback;
    }

    // Evaluates a knowledge-base condition token against the image's EXIF.
    private static boolean matches(String when, Integer iso, Double focal, String wb) {
        if (when == null) return false;
        return switch (when) {
            case "iso_gt_3200" -> iso != null && iso > 3200;
            case "iso_gt_1600" -> iso != null && iso > 1600;
            case "iso_lte_800" -> iso != null && iso <= 800;
            case "wb_auto"     -> "AUTO".equals(wb);
            case "wb_manual"   -> "MANUAL".equals(wb);
            case "focal_gt_85" -> focal != null && focal > 85;
            default            -> false;
        };
    }

    // Substitutes {iso} / {focalLength} placeholders with the image's EXIF.
    private static String interpolate(String tip, ExifData exif) {
        if (tip == null) return "";
        String out = tip;
        if (exif != null) {
            if (exif.iso() != null) out = out.replace("{iso}", String.valueOf(exif.iso()));
            if (exif.focalLength() != null) out = out.replace("{focalLength}", String.format("%.0f", exif.focalLength()));
        }
        return out;
    }

    private static Double parseShutterSeconds(String shutterSpeed) {
        if (shutterSpeed == null) return null;
        Matcher frac = FRACTION.matcher(shutterSpeed);
        if (frac.find()) {
            long num = Long.parseLong(frac.group(1));
            long den = Long.parseLong(frac.group(2));
            return den == 0 ? null : (double) num / den;
        }
        Matcher dec = DECIMAL.matcher(shutterSpeed);
        if (dec.find()) {
            try { return Double.parseDouble(dec.group(1)); } catch (NumberFormatException ignored) {}
        }
        return null;
    }
}
