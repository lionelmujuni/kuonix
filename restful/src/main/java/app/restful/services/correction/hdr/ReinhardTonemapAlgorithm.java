package app.restful.services.correction.hdr;

import java.util.Map;

import org.bytedeco.javacpp.indexer.FloatIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Photographic tone mapping (Reinhard et al., SIGGRAPH 2002).
 *
 * <p>The classical Reinhard global operator. Computes the log-average
 * luminance, scales to a key value (Ansel Adams Zone V), then maps with
 * {@code L_d = L · (1 + L / L_white²) / (1 + L)}. The result is the natural,
 * film-like default for compressing dynamic range while keeping mid-tones
 * intact.</p>
 *
 * <p>Operates on luminance only (preserves hue/saturation by scaling each
 * channel by {@code L_d / L}).</p>
 *
 * <p>Parameters:</p>
 * <ul>
 *   <li>{@code keyValue} (default 0.18, range [0.05, 0.5]) — target average
 *       brightness in linear-light terms. 0.18 is middle gray (Zone V).</li>
 *   <li>{@code whitePoint} (default 1.0, range [0.5, 4.0]) — burn-out
 *       threshold. Higher values preserve more highlight detail.</li>
 * </ul>
 */
@Component
public class ReinhardTonemapAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "reinhard_tonemap";

    private static final double LOG_EPSILON = 1e-4;

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double key   = ParamUtils.getDouble(params, "keyValue",  0.18);
        double white = ParamUtils.getDouble(params, "whitePoint", 1.0);
        return applyCore(bgr, key, white);
    }

    public static Mat applyCore(Mat bgr, double keyValue, double whitePoint) {
        if (bgr.channels() != 3) {
            throw new IllegalArgumentException("reinhard_tonemap requires a 3-channel BGR image");
        }
        keyValue   = Math.max(0.01, Math.min(1.0, keyValue));
        whitePoint = Math.max(0.1,  Math.min(8.0, whitePoint));

        // Convert to float [0, 1].
        Mat bgrF = new Mat();
        bgr.convertTo(bgrF, opencv_core.CV_32F, 1.0 / 255.0, 0.0);

        // Per-pixel luminance (Rec. 709): Y = 0.0722*B + 0.7152*G + 0.2126*R.
        Mat lum = computeLuminance(bgrF);

        // Log-average luminance for key-value scaling.
        double logAvg = logAverage(lum);
        double scale  = keyValue / Math.max(LOG_EPSILON, logAvg);
        double lWhite2 = whitePoint * whitePoint;

        // Per-pixel: scale luminance, apply Reinhard, then scale each channel by Ld/L.
        Mat out = applyReinhardPerPixel(bgrF, lum, scale, lWhite2);
        bgrF.release();
        lum.release();

        Mat result = new Mat();
        out.convertTo(result, opencv_core.CV_8U, 255.0, 0.0);
        out.release();
        return result;
    }

    // -------------------------------------------------------------------------
    // Stages
    // -------------------------------------------------------------------------

    private static Mat computeLuminance(Mat bgrF) {
        Mat lum = new Mat();
        opencv_imgproc.cvtColor(bgrF, lum, opencv_imgproc.COLOR_BGR2GRAY);
        return lum;
    }

    private static double logAverage(Mat lum) {
        int rows = lum.rows();
        int cols = lum.cols();
        FloatIndexer idx = lum.createIndexer();
        double sum = 0;
        long n = (long) rows * cols;
        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                sum += Math.log(LOG_EPSILON + idx.get(y, x));
            }
        }
        idx.release();
        return Math.exp(sum / n);
    }

    private static Mat applyReinhardPerPixel(Mat bgrF, Mat lum, double scale, double lWhite2) {
        int rows = bgrF.rows();
        int cols = bgrF.cols();
        Mat out = new Mat(rows, cols, opencv_core.CV_32FC3);
        FloatIndexer in  = bgrF.createIndexer();
        FloatIndexer li  = lum.createIndexer();
        FloatIndexer oi  = out.createIndexer();
        float[] px = new float[3];
        float[] op = new float[3];
        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                in.get(y, x, px);
                double L  = li.get(y, x);
                double Ls = L * scale;
                double Ld = Ls * (1.0 + Ls / lWhite2) / (1.0 + Ls);
                double ratio = (L > LOG_EPSILON) ? (Ld / L) : 0.0;
                for (int c = 0; c < 3; c++) {
                    double v = px[c] * ratio;
                    if (v < 0) v = 0;
                    if (v > 1) v = 1;
                    op[c] = (float) v;
                }
                oi.put(y, x, op);
            }
        }
        in.release();
        li.release();
        oi.release();
        return out;
    }
}
