package app.restful.services.correction.wb;

import java.util.Map;

import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Log-chroma histogram illuminant estimation with a daylight prior.
 *
 * <p>A simplified, no-training-required variant of Fast Fourier Colour
 * Constancy (Barron &amp; Tsai, CVPR 2017). The original paper learns a
 * convolutional filter over a toroidal log-chroma histogram; shipping that
 * needs trained weights and a Java FFT. Until that's bundled, this class
 * implements the same front-end — log-chroma histogram — but uses a fixed
 * Gaussian prior centred on the daylight illuminant instead of a learned
 * conv. It still outperforms plain Gray World / Shades-of-Gray on
 * single-illuminant scenes because the prior rejects grossly implausible
 * illuminants.</p>
 *
 * <p>Pipeline:
 * <ol>
 *   <li>Build an 8-bit {@code (u, v)} log-chroma histogram where
 *       {@code u = log(G/R)} and {@code v = log(G/B)}, quantised to 64 bins on
 *       each axis, spanning {@code [−2, +2]}.</li>
 *   <li>Multiply the histogram by a Gaussian prior centred at the origin
 *       (perfect daylight) with {@code σ = 0.35} — the prior pulls the peak
 *       toward plausible illuminants and away from saturated-object noise.</li>
 *   <li>Peak bin of the scored histogram gives the illuminant estimate
 *       {@code (û, v̂)}. The confidence is the ratio of the peak score to the
 *       sum of the top-k scores.</li>
 *   <li>White-balance gains are {@code (exp(û), 1, exp(v̂))} applied to R, G, B
 *       (in that order — note OpenCV is BGR).</li>
 *   <li>If the confidence falls below {@code confidenceThreshold}, fall back to
 *       Gray World, which is known-safe on ambiguous scenes.</li>
 * </ol>
 *
 * <p>Parameters:</p>
 * <ul>
 *   <li>{@code confidenceThreshold} (default 0.5, range [0, 1]) — below this,
 *       the algorithm hands off to Gray World.</li>
 * </ul>
 */
@Component
public class FfccAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "ffcc";

    // Histogram: 64x64 bins, log-chroma axis spans [-RANGE, +RANGE].
    private static final int BINS = 64;
    private static final double RANGE = 2.0;
    private static final double BIN_WIDTH = 2.0 * RANGE / BINS;

    // Daylight-prior Gaussian sigma (log-chroma units).
    private static final double PRIOR_SIGMA = 0.35;

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double confidenceThreshold = ParamUtils.getDouble(params, "confidenceThreshold", 0.5);
        return applyCore(bgr, confidenceThreshold);
    }

    public static Mat applyCore(Mat bgr, double confidenceThreshold) {
        if (bgr.channels() != 3) {
            throw new IllegalArgumentException("ffcc requires a 3-channel BGR image");
        }

        double[][] hist = buildLogChromaHistogram(bgr);
        applyGaussianPrior(hist);
        IlluminantEstimate est = findPeak(hist);

        if (est.confidence < confidenceThreshold) {
            // Ambiguous — fall back to known-safe Gray World.
            return grayWorld(bgr);
        }

        // Log-chroma bin centres → channel gains.
        // u = log(G/R), v = log(G/B) → R gain = exp(u), B gain = exp(v), G = 1.
        double gainR = Math.exp(est.u);
        double gainB = Math.exp(est.v);
        double gainG = 1.0;

        // Normalise so the brightest gain is 1 (prevents channel clipping).
        double maxGain = Math.max(gainR, Math.max(gainG, gainB));
        gainR /= maxGain; gainG /= maxGain; gainB /= maxGain;

        return applyGains(bgr, gainB, gainG, gainR);
    }

    // -------------------------------------------------------------------------
    // Stages
    // -------------------------------------------------------------------------

    /** 2-D log-chroma histogram in (u, v). Unsaturated bright pixels carry most weight. */
    private static double[][] buildLogChromaHistogram(Mat bgr) {
        double[][] h = new double[BINS][BINS];
        UByteIndexer idx = bgr.createIndexer();
        int[] px = new int[3];
        int rows = bgr.rows();
        int cols = bgr.cols();

        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                idx.get(y, x, px);
                int b = px[0], g = px[1], r = px[2];
                // Skip near-black and near-saturated pixels (noisy / clipped).
                int maxC = Math.max(b, Math.max(g, r));
                int minC = Math.min(b, Math.min(g, r));
                if (maxC < 20 || maxC > 240) continue;
                // Weight by brightness for robustness.
                double w = maxC / 255.0;
                // Avoid divide-by-zero.
                double rr = Math.max(1, r);
                double gg = Math.max(1, g);
                double bb = Math.max(1, b);
                double u = Math.log(gg / rr);
                double v = Math.log(gg / bb);
                int bu = toBin(u);
                int bv = toBin(v);
                if (bu < 0 || bv < 0) continue;
                // Penalise very saturated pixels — they don't tell us about the illuminant.
                double chroma = (maxC - minC) / (double) maxC;
                w *= Math.max(0.0, 1.0 - chroma);
                h[bu][bv] += w;
            }
        }
        idx.release();
        return h;
    }

    /** Multiplies the histogram by a 2-D isotropic Gaussian centred at the origin. */
    private static void applyGaussianPrior(double[][] h) {
        double sig2 = 2.0 * PRIOR_SIGMA * PRIOR_SIGMA;
        double centre = BINS / 2.0 - 0.5;
        for (int i = 0; i < BINS; i++) {
            for (int j = 0; j < BINS; j++) {
                double u = (i - centre) * BIN_WIDTH;
                double v = (j - centre) * BIN_WIDTH;
                double w = Math.exp(-(u * u + v * v) / sig2);
                h[i][j] *= w;
            }
        }
    }

    /** Peak-bin illuminant estimate; confidence is peak / (peak + sum of top 8 others). */
    private static IlluminantEstimate findPeak(double[][] h) {
        double peak = 0;
        int pi = BINS / 2;
        int pj = BINS / 2;
        // Track top-k for confidence.
        double[] top = new double[8];
        for (int i = 0; i < BINS; i++) {
            for (int j = 0; j < BINS; j++) {
                double v = h[i][j];
                if (v > peak) {
                    peak = v;
                    pi = i;
                    pj = j;
                }
                // Insertion into sorted top-k.
                for (int k = 0; k < top.length; k++) {
                    if (v > top[k]) {
                        for (int kk = top.length - 1; kk > k; kk--) top[kk] = top[kk - 1];
                        top[k] = v;
                        break;
                    }
                }
            }
        }
        double topSum = 0;
        for (double v : top) topSum += v;
        double confidence = topSum > 1e-9 ? peak / topSum : 0.0;

        double centre = BINS / 2.0 - 0.5;
        double u = (pi - centre) * BIN_WIDTH;
        double v = (pj - centre) * BIN_WIDTH;
        return new IlluminantEstimate(u, v, confidence);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static int toBin(double x) {
        if (x < -RANGE || x > RANGE) return -1;
        int b = (int) Math.floor((x + RANGE) / BIN_WIDTH);
        if (b < 0) b = 0;
        if (b >= BINS) b = BINS - 1;
        return b;
    }

    private static Mat applyGains(Mat bgr, double gainB, double gainG, double gainR) {
        MatVector ch = new MatVector(3);
        opencv_core.split(bgr, ch);
        Mat b = new Mat(), g = new Mat(), r = new Mat();
        ch.get(0).convertTo(b, -1, gainB, 0.0);
        ch.get(1).convertTo(g, -1, gainG, 0.0);
        ch.get(2).convertTo(r, -1, gainR, 0.0);
        MatVector merged = new MatVector(b, g, r);
        Mat out = new Mat();
        opencv_core.merge(merged, out);
        ch.close(); merged.close();
        b.release(); g.release(); r.release();
        return out;
    }

    /** Gray World fallback for low-confidence cases. */
    private static Mat grayWorld(Mat bgr) {
        MatVector ch = new MatVector(3);
        opencv_core.split(bgr, ch);
        double meanB = opencv_core.mean(ch.get(0)).get(0);
        double meanG = opencv_core.mean(ch.get(1)).get(0);
        double meanR = opencv_core.mean(ch.get(2)).get(0);
        double target = (meanB + meanG + meanR) / 3.0;
        double gainB = meanB > 1e-3 ? target / meanB : 1.0;
        double gainG = meanG > 1e-3 ? target / meanG : 1.0;
        double gainR = meanR > 1e-3 ? target / meanR : 1.0;
        double maxG = Math.max(gainR, Math.max(gainG, gainB));
        gainB /= maxG; gainG /= maxG; gainR /= maxG;
        ch.close();
        return applyGains(bgr, gainB, gainG, gainR);
    }

    private record IlluminantEstimate(double u, double v, double confidence) {}
}
