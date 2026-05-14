package app.restful.services.correction.primitives;

import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;

/**
 * Single-channel histogram utilities: percentile lookup, cumulative
 * distribution, and black/white-point auto-levels helpers.
 *
 * <p>Used by tone-mapping, highlight recovery, and auto-levels corrections.
 * OpenCV already provides {@code createCLAHE} for per-tile histogram
 * equalisation, so this helper focuses on global statistics.</p>
 */
public final class HistogramUtils {

    private HistogramUtils() {}

    /**
     * Compute a 256-bin histogram of an 8-bit single-channel image.
     */
    public static int[] histogram8U(Mat src8u1) {
        if (src8u1.channels() != 1 || src8u1.depth() != opencv_core.CV_8U) {
            throw new IllegalArgumentException("Expected CV_8UC1; got channels=" +
                    src8u1.channels() + " depth=" + src8u1.depth());
        }
        int[] hist = new int[256];
        UByteIndexer idx = src8u1.createIndexer();
        int rows = src8u1.rows();
        int cols = src8u1.cols();
        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                hist[idx.get(y, x)]++;
            }
        }
        idx.release();
        return hist;
    }

    /**
     * Return the intensity value below which {@code percentile} fraction of
     * the pixels lie. {@code percentile} in [0, 1]. Range [0, 255].
     */
    public static int percentile8U(int[] histogram, double percentile) {
        if (histogram.length != 256) {
            throw new IllegalArgumentException("histogram must have 256 bins");
        }
        if (percentile < 0) percentile = 0;
        if (percentile > 1) percentile = 1;

        long total = 0;
        for (int c : histogram) total += c;
        if (total == 0) return 0;

        long target = (long) Math.ceil(percentile * total);
        if (target == 0) target = 1;
        long running = 0;
        for (int i = 0; i < 256; i++) {
            running += histogram[i];
            if (running >= target) return i;
        }
        return 255;
    }

    /**
     * Convenience: compute p-low and p-high percentile values directly from a
     * CV_8UC1 image. Useful for auto-levels and highlight/shadow clip detection.
     *
     * @return {@code {lowValue, highValue}} in [0, 255].
     */
    public static int[] percentiles8U(Mat src8u1, double low, double high) {
        int[] h = histogram8U(src8u1);
        return new int[] { percentile8U(h, low), percentile8U(h, high) };
    }

    /** Normalised cumulative distribution from a histogram, length 256, values [0, 1]. */
    public static double[] cdf(int[] histogram) {
        if (histogram.length != 256) {
            throw new IllegalArgumentException("histogram must have 256 bins");
        }
        double[] cdf = new double[256];
        long total = 0;
        for (int c : histogram) total += c;
        if (total == 0) return cdf;
        long running = 0;
        for (int i = 0; i < 256; i++) {
            running += histogram[i];
            cdf[i] = (double) running / total;
        }
        return cdf;
    }
}
