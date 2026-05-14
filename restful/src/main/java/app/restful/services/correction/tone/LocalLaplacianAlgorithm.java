package app.restful.services.correction.tone;

import java.util.Map;

import org.bytedeco.javacpp.indexer.FloatIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;
import app.restful.services.correction.primitives.GaussianPyramid;
import app.restful.services.correction.primitives.LaplacianPyramid;

/**
 * Edge-aware tone compression via Local Laplacian filtering
 * (Paris, Hasinoff &amp; Kautz, SIGGRAPH 2011 — fast variant from CACM 2015).
 *
 * <p>Operates on the Lab L* channel only (a*, b* preserved). For each
 * Gaussian-pyramid level of the luminance, we look up the appropriate
 * Laplacian-pyramid level of an intensity-remapped copy of the image; nearby
 * pixels in similar brightness get detail enhancement, while pixels straddling
 * a true edge are tone-compressed without ringing.</p>
 *
 * <p>Parameters:</p>
 * <ul>
 *   <li>{@code alpha} (default 0.4, range [0.1, 1.0]) — detail remap.
 *       {@code <1} enhances micro-contrast, {@code >1} smooths.</li>
 *   <li>{@code beta} (default 0.5, range [0.1, 1.0]) — tone-compression of
 *       large-amplitude edges. Lower = stronger compression.</li>
 *   <li>{@code sigma} (default 0.2, range [0.05, 0.5]) — edge threshold in
 *       normalised luminance units. Above this magnitude the edge branch fires.</li>
 * </ul>
 *
 * <p>Cost is {@code O(K · L · N)} for {@code K} intensity bins, {@code L}
 * pyramid levels and {@code N} pixels — slow enough to live in the {@code high}
 * cost class. Defaults: K=8 bins, L=5 levels.</p>
 */
@Component
public class LocalLaplacianAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "local_laplacian";

    /** Discretisation of the intensity axis; higher = finer interpolation, higher cost. */
    private static final int INTENSITY_BINS = 8;

    /** Number of pyramid levels; 5 is standard for typical photo sizes. */
    private static final int PYRAMID_LEVELS = 5;

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double alpha = ParamUtils.getDouble(params, "alpha", 0.4);
        double beta  = ParamUtils.getDouble(params, "beta",  0.5);
        double sigma = ParamUtils.getDouble(params, "sigma", 0.2);
        return applyCore(bgr, alpha, beta, sigma);
    }

    public static Mat applyCore(Mat bgr, double alpha, double beta, double sigma) {
        if (bgr.channels() != 3) {
            throw new IllegalArgumentException("local_laplacian requires a 3-channel BGR image");
        }
        // BGR -> Lab (float; OpenCV native: L in [0, 100]).
        Mat bgrF = new Mat();
        bgr.convertTo(bgrF, opencv_core.CV_32F, 1.0 / 255.0, 0.0);
        Mat lab = new Mat();
        opencv_imgproc.cvtColor(bgrF, lab, opencv_imgproc.COLOR_BGR2Lab);
        bgrF.release();

        MatVector labCh = new MatVector(3);
        opencv_core.split(lab, labCh);
        Mat L = new Mat();
        labCh.get(0).convertTo(L, opencv_core.CV_32F, 1.0 / 100.0, 0.0);

        Mat refined = computeLocalLaplacian(L, alpha, beta, sigma);
        L.release();

        // Restore L to [0, 100] and reassemble Lab.
        Mat Lout = new Mat();
        refined.convertTo(Lout, opencv_core.CV_32F, 100.0, 0.0);
        refined.release();

        MatVector mergeIn = new MatVector(Lout, labCh.get(1), labCh.get(2));
        Mat labOut = new Mat();
        opencv_core.merge(mergeIn, labOut);
        mergeIn.close();
        labCh.close();
        Lout.release();
        lab.release();

        Mat bgrOutF = new Mat();
        opencv_imgproc.cvtColor(labOut, bgrOutF, opencv_imgproc.COLOR_Lab2BGR);
        labOut.release();
        Mat out = new Mat();
        bgrOutF.convertTo(out, opencv_core.CV_8U, 255.0, 0.0);
        bgrOutF.release();
        return out;
    }

    // -------------------------------------------------------------------------
    // Core algorithm
    // -------------------------------------------------------------------------

    /**
     * Fast Local Laplacian on a single-channel CV_32F luminance image in [0, 1].
     * Returns a refined CV_32F image, also in [0, 1].
     */
    private static Mat computeLocalLaplacian(Mat L, double alpha, double beta, double sigma) {
        GaussianPyramid g = GaussianPyramid.build(L, PYRAMID_LEVELS);
        int n = g.size();

        // Output Laplacian pyramid built up by bin-weighted accumulation.
        Mat[] outLevels = new Mat[n];
        for (int l = 0; l < n - 1; l++) {
            Mat gl = g.get(l);
            outLevels[l] = new Mat(gl.rows(), gl.cols(), opencv_core.CV_32F, new Scalar(0.0));
        }
        // Top (residual) level passes through — large-scale tone is unaffected.
        Mat top = new Mat();
        g.get(n - 1).copyTo(top);
        outLevels[n - 1] = top;

        // For each discrete reference brightness g_k, build a Laplacian pyramid
        // of the remapped image and contribute to outLevels weighted by the
        // triangular interpolation kernel over G_l(x, y).
        for (int k = 0; k < INTENSITY_BINS; k++) {
            double gk = (double) k / (INTENSITY_BINS - 1);
            Mat remap = remapImage(L, gk, alpha, beta, sigma);
            LaplacianPyramid lp = LaplacianPyramid.build(remap, n);
            remap.release();

            for (int l = 0; l < n - 1; l++) {
                accumulateLevel(g.get(l), lp.get(l), outLevels[l], gk);
            }
            lp.release();
        }
        g.release();

        // Collapse outLevels into a single image (same as LaplacianPyramid.collapse).
        Mat cur = new Mat();
        outLevels[n - 1].copyTo(cur);
        for (int i = n - 2; i >= 0; i--) {
            Mat target = outLevels[i];
            Mat up = GaussianPyramid.upsampleTo(cur, target.size());
            cur.release();
            cur = new Mat();
            opencv_core.add(up, target, cur);
            up.release();
        }
        for (Mat m : outLevels) m.release();

        // Clamp to [0, 1]; THRESH_TRUNC clips top, THRESH_TOZERO clears negatives.
        Mat clipped = new Mat();
        opencv_imgproc.threshold(cur, clipped, 1.0, 1.0, opencv_imgproc.THRESH_TRUNC);
        cur.release();
        Mat clamped = new Mat();
        opencv_imgproc.threshold(clipped, clamped, 0.0, 0.0, opencv_imgproc.THRESH_TOZERO);
        clipped.release();
        return clamped;
    }

    /**
     * Remap the source luminance around a reference brightness {@code g0} using
     * the Paris/Hasinoff piecewise function. Detail (|d| &lt; σ) gets
     * {@code |d|^α · σ^(1-α)} compression; edges (|d| ≥ σ) get linear scaling
     * by {@code β} on the magnitude beyond σ.
     */
    private static Mat remapImage(Mat L, double g0, double alpha, double beta, double sigma) {
        int rows = L.rows();
        int cols = L.cols();
        Mat out = new Mat(rows, cols, opencv_core.CV_32F);
        FloatIndexer in  = L.createIndexer();
        FloatIndexer oi  = out.createIndexer();
        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                double v = in.get(y, x);
                double d = v - g0;
                double mag = Math.abs(d);
                double sign = Math.signum(d);
                double rv;
                if (mag < sigma) {
                    // Detail manipulation around the reference level.
                    double t = mag / sigma;
                    rv = g0 + sign * sigma * Math.pow(t, alpha);
                } else {
                    // Edge tone-mapping: linearly compress magnitudes beyond σ.
                    rv = g0 + sign * (sigma + beta * (mag - sigma));
                }
                oi.put(y, x, (float) rv);
            }
        }
        in.release();
        oi.release();
        return out;
    }

    /**
     * Accumulate {@code lapLevel * triangle(gLevel, gk)} into {@code outLevel}.
     * Triangle width is 1 / (BINS-1) so contributions sum to 1 at every pixel.
     */
    private static void accumulateLevel(Mat gLevel, Mat lapLevel, Mat outLevel, double gk) {
        int rows = gLevel.rows();
        int cols = gLevel.cols();
        FloatIndexer gi = gLevel.createIndexer();
        FloatIndexer li = lapLevel.createIndexer();
        FloatIndexer oi = outLevel.createIndexer();
        double scale = INTENSITY_BINS - 1;
        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                double gv = gi.get(y, x);
                double t = 1.0 - Math.abs(gv - gk) * scale;
                if (t <= 0) continue;
                oi.put(y, x, (float) (oi.get(y, x) + t * li.get(y, x)));
            }
        }
        gi.release();
        li.release();
        oi.release();
    }
}
