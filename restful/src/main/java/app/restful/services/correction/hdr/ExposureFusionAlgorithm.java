package app.restful.services.correction.hdr;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgcodecs;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_photo.MergeMertens;
import org.bytedeco.opencv.global.opencv_photo;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Multi-exposure fusion in the image domain (Mertens et al., 2007).
 *
 * <p>Wraps OpenCV's {@code cv::MergeMertens}. Blends a bracket of LDR
 * exposures using per-pixel weights derived from contrast (Laplacian),
 * saturation (per-pixel channel σ) and well-exposedness (Gaussian around
 * mid-gray). The result is a single LDR image — no tone mapping required —
 * that preserves detail in both shadows and highlights.</p>
 *
 * <p>Input shape: this algorithm needs a bracket of separate exposure files.
 * The {@code bgr} Mat passed in via {@link #apply} is ignored; the bracket is
 * loaded from the comma-separated absolute paths in the {@code imagePaths}
 * parameter.</p>
 *
 * <p>Parameters:</p>
 * <ul>
 *   <li>{@code imagePaths} (string, required) — comma-separated absolute paths
 *       of bracketed exposures. Two or more recommended.</li>
 *   <li>{@code contrastWeight}    (default 1.0, range [0.0, 2.0]) — Laplacian-contrast weight.</li>
 *   <li>{@code saturationWeight}  (default 1.0, range [0.0, 2.0]) — per-pixel saturation weight.</li>
 *   <li>{@code exposedWeight}     (default 1.0, range [0.0, 2.0]) — well-exposedness weight.</li>
 * </ul>
 */
@Component
public class ExposureFusionAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "exposure_fusion";

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        String paths = ParamUtils.getString(params, "imagePaths", "");
        double cw = ParamUtils.getDouble(params, "contrastWeight",   1.0);
        double sw = ParamUtils.getDouble(params, "saturationWeight", 1.0);
        double ew = ParamUtils.getDouble(params, "exposedWeight",    1.0);
        return applyCore(bgr, paths, cw, sw, ew);
    }

    /**
     * @param fallback used only if {@code imagePaths} is empty — returned as-is
     *                 so callers don't have to special-case the missing-bracket
     *                 path.
     */
    public static Mat applyCore(Mat fallback, String imagePaths,
                                double contrastWeight, double saturationWeight,
                                double exposedWeight) {
        List<Mat> bracket = loadBracket(imagePaths);
        if (bracket.isEmpty()) {
            throw new IllegalArgumentException(
                    "exposure_fusion requires `imagePaths` (comma-separated absolute paths)");
        }

        MergeMertens fuser = opencv_photo.createMergeMertens(
                (float) contrastWeight,
                (float) saturationWeight,
                (float) exposedWeight);
        MatVector vec = new MatVector(bracket.size());
        for (int i = 0; i < bracket.size(); i++) vec.put(i, bracket.get(i));

        Mat fusedF = new Mat();
        fuser.process(vec, fusedF);
        fuser.close();
        vec.close();
        for (Mat m : bracket) m.release();

        // MergeMertens emits CV_32FC3 in [0, 1]; clamp and convert to 8U.
        Mat clamped = clamp01(fusedF);
        fusedF.release();
        Mat out = new Mat();
        clamped.convertTo(out, opencv_core.CV_8U, 255.0, 0.0);
        clamped.release();
        return out;
    }

    private static List<Mat> loadBracket(String csv) {
        List<Mat> out = new ArrayList<>();
        if (csv == null || csv.isBlank()) return out;
        for (String raw : csv.split(",")) {
            String path = raw.trim();
            if (path.isEmpty()) continue;
            Mat m = opencv_imgcodecs.imread(path, opencv_imgcodecs.IMREAD_COLOR);
            if (m == null || m.empty()) {
                for (Mat loaded : out) loaded.release();
                throw new IllegalArgumentException("Failed to load bracket image: " + path);
            }
            out.add(m);
        }
        return out;
    }

    private static Mat clamp01(Mat src) {
        // Cheap clamp: max(min(src, 1), 0) via two threshold passes on a float image.
        Mat hi = new Mat();
        org.bytedeco.opencv.global.opencv_imgproc.threshold(
                src, hi, 1.0, 1.0, org.bytedeco.opencv.global.opencv_imgproc.THRESH_TRUNC);
        Mat lo = new Mat();
        org.bytedeco.opencv.global.opencv_imgproc.threshold(
                hi, lo, 0.0, 0.0, org.bytedeco.opencv.global.opencv_imgproc.THRESH_TOZERO);
        hi.release();
        return lo;
    }
}
