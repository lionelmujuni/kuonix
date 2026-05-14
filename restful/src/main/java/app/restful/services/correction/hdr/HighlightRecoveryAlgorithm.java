package app.restful.services.correction.hdr;

import java.util.Map;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_photo;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_photo.MergeMertens;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Single-image highlight reconstruction via Mertens exposure fusion.
 *
 * <p>Synthesises virtual under-exposures from the source (per-pixel gains of
 * {@code 2^ev} for each EV offset), then fuses them with the original using
 * the Mertens algorithm. The fused weight maps favour well-exposed pixels, so
 * detail that was clipped in the source is pulled from the darker virtual
 * frames — without darkening correctly-exposed regions.</p>
 *
 * <p>This is not a true HDR workflow — the darker frames carry the same noise
 * as the source, scaled down. But for JPEG originals with blown highlights it
 * recovers most of what manual curves can, without the manual curve-pulling.</p>
 *
 * <p>Parameters:</p>
 * <ul>
 *   <li>{@code evOffsets} — CSV of EV offsets (default {@code "-1,-2"}).
 *       {@code 0} is the source frame; each value produces a virtual frame
 *       scaled by {@code 2^ev}.</li>
 *   <li>{@code strength} — 0..1 blend with the original (default 1.0).</li>
 * </ul>
 *
 * <p>Reference: Mertens, Kautz, Van Reeth, "Exposure Fusion", PG 2007.</p>
 */
@Component
public class HighlightRecoveryAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "highlight_recovery";

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        String evStr    = ParamUtils.getString(params, "evOffsets", "-1,-2");
        double strength = ParamUtils.getDouble(params, "strength", 1.0);
        double[] offsets = parseOffsets(evStr);
        return applyCore(bgr, offsets, strength);
    }

    public static Mat applyCore(Mat bgr, double[] evOffsets, double strength) {
        strength = Math.max(0.0, Math.min(1.0, strength));
        if (evOffsets == null || evOffsets.length == 0) evOffsets = new double[]{-1.0, -2.0};

        // Original + virtual exposures, all CV_8UC3 — MergeMertens requires 8U input.
        MatVector bracket = new MatVector(evOffsets.length + 1);
        Mat origCopy = new Mat();
        bgr.copyTo(origCopy);
        bracket.put(0, origCopy);

        for (int i = 0; i < evOffsets.length; i++) {
            double gain = Math.pow(2.0, evOffsets[i]);
            Mat virt = new Mat();
            bgr.convertTo(virt, opencv_core.CV_8U, gain, 0.0);
            bracket.put(i + 1, virt);
        }

        // Fuse — result is CV_32FC3 in [0, 1].
        MergeMertens merger = opencv_photo.createMergeMertens();
        Mat fusedF = new Mat();
        merger.process(bracket, fusedF);
        merger.close();

        // Rescale to [0, 255] CV_8UC3.
        Mat fused = new Mat();
        fusedF.convertTo(fused, opencv_core.CV_8U, 255.0, 0.0);
        fusedF.release();

        // Release virtual frames (MergeMertens kept its own copies).
        for (long i = 0; i < bracket.size(); i++) {
            bracket.get(i).release();
        }
        bracket.close();

        if (strength >= 0.999) return fused;
        Mat blended = new Mat();
        opencv_core.addWeighted(fused, strength, bgr, 1.0 - strength, 0.0, blended);
        fused.release();
        return blended;
    }

    private static double[] parseOffsets(String s) {
        String[] parts = s.split(",");
        double[] out = new double[parts.length];
        double[] fallback = {-1.0, -2.0};
        for (int i = 0; i < parts.length; i++) {
            try {
                out[i] = Double.parseDouble(parts[i].trim());
            } catch (NumberFormatException e) {
                out[i] = (i < fallback.length) ? fallback[i] : -1.0;
            }
        }
        return out;
    }
}
