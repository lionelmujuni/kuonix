package app.restful.services.correction.primitives;

import java.util.ArrayList;
import java.util.List;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.Size;

/**
 * Laplacian image pyramid — band-pass decomposition of an image.
 *
 * <p>Level {@code i} of the Laplacian pyramid is
 * {@code G_i − upsample(G_{i+1})}, where {@code G_i} is the Gaussian pyramid
 * at level {@code i}. The top (coarsest) level is a copy of the matching
 * Gaussian level. Perfect reconstruction: summing {@code upsample(L_{i+1}) + L_i}
 * recursively rebuilds the original image within float rounding.</p>
 *
 * <p>Used by Local Laplacian tone mapping, multi-exposure fusion, and
 * band-limited detail transfer.</p>
 */
public final class LaplacianPyramid {

    private final List<Mat> levels;

    private LaplacianPyramid(List<Mat> levels) {
        this.levels = levels;
    }

    /** Build a Laplacian pyramid with the given number of levels from a source image. */
    public static LaplacianPyramid build(Mat src, int numLevels) {
        GaussianPyramid g = GaussianPyramid.build(src, numLevels);
        LaplacianPyramid l = fromGaussian(g);
        g.release();
        return l;
    }

    /**
     * Build a Laplacian pyramid from an already-constructed Gaussian pyramid.
     * The Gaussian pyramid is not consumed — caller still owns its release.
     */
    public static LaplacianPyramid fromGaussian(GaussianPyramid gauss) {
        int n = gauss.size();
        List<Mat> laps = new ArrayList<>(n);

        for (int i = 0; i < n - 1; i++) {
            Mat cur  = gauss.get(i);
            Mat next = gauss.get(i + 1);
            Size target = cur.size();
            Mat upsampled = GaussianPyramid.upsampleTo(next, target);
            Mat band = new Mat();
            opencv_core.subtract(cur, upsampled, band);
            upsampled.release();
            laps.add(band);
        }
        // Top level is the residual (coarsest Gaussian level, copied).
        Mat top = new Mat();
        gauss.get(n - 1).copyTo(top);
        laps.add(top);
        return new LaplacianPyramid(laps);
    }

    public int size() { return levels.size(); }

    public Mat get(int level) { return levels.get(level); }

    public List<Mat> levels() { return List.copyOf(levels); }

    /**
     * Reconstruct a single image from this pyramid. The result is
     * {@code CV_32F} and numerically matches the source up to float rounding
     * (PSNR typically > 60 dB for CV_8U sources).
     */
    public Mat collapse() {
        int n = levels.size();
        Mat cur = new Mat();
        levels.get(n - 1).copyTo(cur);
        for (int i = n - 2; i >= 0; i--) {
            Mat target = levels.get(i);
            Mat up = GaussianPyramid.upsampleTo(cur, target.size());
            cur.release();
            cur = new Mat();
            opencv_core.add(up, target, cur);
            up.release();
        }
        return cur;
    }

    public void release() {
        for (Mat m : levels) m.release();
        levels.clear();
    }
}
