package app.restful.services.correction.auto;

import java.util.Map;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Size;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Fast Automatic Colour Equalization (ACE).
 *
 * <p>ACE (Rizzi et al., JOSA-A 2002) models the human visual system's ability
 * to adapt to local illumination: each pixel is normalised relative to the
 * chromatic contrast in its neighbourhood. The result simultaneously removes
 * colour casts, corrects exposure, and boosts local contrast — making it a
 * strong "one-click Auto" starting point.</p>
 *
 * <p>This implementation uses a fast O(N) local-normalisation approximation:
 * for each colour channel independently, the mean and standard deviation are
 * estimated with a box filter, and each pixel is re-centred and rescaled.
 * A variance floor of 1.0 prevents amplification of sensor noise in flat
 * regions (flat areas map to 128 / mid-gray rather than clipping).</p>
 *
 * <p>Parameters:</p>
 * <ul>
 *   <li>{@code alpha} (default 5.0, range 1–10) — correction strength.
 *       Higher α clips the normalised range more aggressively; 5 covers ±1σ
 *       in the mapped [0, 255] output.</li>
 *   <li>{@code subsample} (default 4, range 1–8) — controls the local window
 *       radius: {@code radius = max(3, minDim / (subsample × 8))}.
 *       Higher = smaller window = faster + less globally consistent.</li>
 * </ul>
 *
 * <p>Reference: Rizzi et al., "A new algorithm for unsupervised global and
 * local color correction", Pattern Recognition Letters 2003; fast variant
 * after Getreuer, "Automatic Color Enhancement (ACE) and its Fast
 * Implementation", IPOL 2012.</p>
 */
@Component
public class AceAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "ace";

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double alpha     = ParamUtils.getDouble(params, "alpha",     5.0);
        int    subsample = (int) Math.round(ParamUtils.getDouble(params, "subsample", 4.0));
        if (subsample < 1) subsample = 1;
        if (subsample > 8) subsample = 8;
        return applyCore(bgr, alpha, subsample);
    }

    public static Mat applyCore(Mat bgr, double alpha, int subsample) {
        alpha = Math.max(0.5, Math.min(10.0, alpha));

        Mat bgrF = new Mat();
        bgr.convertTo(bgrF, opencv_core.CV_32F);  // values in [0, 255]

        int localRadius = Math.max(3,
                Math.min(bgrF.rows(), bgrF.cols()) / (subsample * 8));

        MatVector channels = new MatVector(3);
        opencv_core.split(bgrF, channels);
        bgrF.release();

        Mat[] normalised = new Mat[3];
        for (int c = 0; c < 3; c++) {
            normalised[c] = normaliseChannel(channels.get(c), localRadius, alpha);
        }
        channels.close();

        MatVector outVec = new MatVector(normalised[0], normalised[1], normalised[2]);
        Mat result = new Mat();
        opencv_core.merge(outVec, result);
        outVec.close();
        normalised[0].release();
        normalised[1].release();
        normalised[2].release();

        return result;
    }

    /**
     * Normalises one float channel using local mean/std, then scales to
     * CV_8U [0, 255].
     *
     * <p>Formula per pixel:
     * <pre>out = clip((ch − localMean) / localStd · scale + 128, 0, 255)</pre>
     * where {@code scale = α × 128 / 5}. Higher α maps a smaller range of
     * the normalised signal onto [0, 255], producing stronger correction.
     * The localStd floor of 1.0 prevents blow-up in flat regions.</p>
     */
    private static Mat normaliseChannel(Mat ch, int radius, double alpha) {
        Size k = new Size(2 * radius + 1, 2 * radius + 1);

        // Local mean: E[X]
        Mat localMean = new Mat();
        opencv_imgproc.boxFilter(ch, localMean, -1, k);

        // E[X²] for variance computation
        Mat ch2 = new Mat();
        opencv_core.multiply(ch, ch, ch2);
        Mat localMean2 = new Mat();
        opencv_imgproc.boxFilter(ch2, localMean2, -1, k);
        ch2.release();
        k.close();

        // variance = E[X²] − E[X]²
        Mat meanSq = new Mat();
        opencv_core.multiply(localMean, localMean, meanSq);
        Mat variance = new Mat();
        opencv_core.subtract(localMean2, meanSq, variance);
        localMean2.release();
        meanSq.release();

        // std with floor: sqrt(variance + 1.0)  →  localStd ≥ 1.0
        // Flat regions (variance ≈ 0) become std = 1; centred pixels map to 128.
        Mat varianceFl = new Mat();
        variance.convertTo(varianceFl, -1, 1.0, 1.0);
        variance.release();
        Mat localStd = new Mat();
        opencv_core.sqrt(varianceFl, localStd);
        varianceFl.release();

        // Centred: ch − localMean
        Mat centred = new Mat();
        opencv_core.subtract(ch, localMean, centred);
        localMean.release();

        // Normalised: centred / localStd  (approximately N(0,1) per neighbourhood)
        Mat normalised = new Mat();
        opencv_core.divide(centred, localStd, normalised);
        centred.release();
        localStd.release();

        // Scale to [0, 255] and convert — saturate_cast clips out-of-range values.
        // At default α=5: scale=128, so ±1σ maps to full [0, 255] range.
        double scale = alpha * 128.0 / 5.0;
        Mat out = new Mat();
        normalised.convertTo(out, opencv_core.CV_8U, scale, 128.0);
        normalised.release();

        return out;
    }
}
