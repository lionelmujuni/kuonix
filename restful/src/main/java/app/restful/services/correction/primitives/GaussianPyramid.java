package app.restful.services.correction.primitives;

import java.util.ArrayList;
import java.util.List;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.Size;

/**
 * Gaussian image pyramid — successive low-pass + downsample.
 *
 * <p>Each level halves resolution. Level 0 is the source (converted to
 * {@code CV_32F}); level {@code n} is the {@code pyrDown} of level {@code n-1}.
 * Used as the base for {@link LaplacianPyramid} and for multi-scale fusion
 * (Mertens exposure fusion).</p>
 *
 * <p>The pyramid owns its levels. Call {@link #release()} when done.</p>
 */
public final class GaussianPyramid {

    private final List<Mat> levels;

    private GaussianPyramid(List<Mat> levels) {
        this.levels = levels;
    }

    /**
     * Build a Gaussian pyramid with {@code levels} levels (including the base).
     * Source is not mutated; level 0 is an independent {@code CV_32F} copy.
     *
     * @param src     input image (CV_8U or CV_32F, any channel count)
     * @param levels  number of levels, ≥ 1. Level 0 is the same size as src.
     */
    public static GaussianPyramid build(Mat src, int levels) {
        if (levels < 1) throw new IllegalArgumentException("levels must be ≥ 1");

        List<Mat> pyr = new ArrayList<>(levels);

        Mat base = new Mat();
        src.convertTo(base, opencv_core.CV_32F);
        pyr.add(base);

        for (int i = 1; i < levels; i++) {
            Mat prev = pyr.get(i - 1);
            if (prev.rows() < 2 || prev.cols() < 2) break;
            Mat next = new Mat();
            opencv_imgproc.pyrDown(prev, next);
            pyr.add(next);
        }
        return new GaussianPyramid(pyr);
    }

    public int size() { return levels.size(); }

    public Mat get(int level) { return levels.get(level); }

    public List<Mat> levels() { return List.copyOf(levels); }

    /**
     * Upsample the given level to match {@code targetSize}. Uses
     * {@code pyrUp} recursively until the result is ≥ target, then a final
     * resize to the exact dimensions — pyrUp alone only yields even sizes.
     */
    public static Mat upsampleTo(Mat src, Size targetSize) {
        Mat cur = src;
        boolean ownsCur = false;
        while (cur.rows() * 2 <= targetSize.height() && cur.cols() * 2 <= targetSize.width()) {
            Mat up = new Mat();
            opencv_imgproc.pyrUp(cur, up);
            if (ownsCur) cur.release();
            cur = up;
            ownsCur = true;
        }
        if (cur.rows() != targetSize.height() || cur.cols() != targetSize.width()) {
            Mat resized = new Mat();
            opencv_imgproc.resize(cur, resized, targetSize, 0, 0, opencv_imgproc.INTER_LINEAR);
            if (ownsCur) cur.release();
            return resized;
        }
        if (ownsCur) return cur;
        Mat copy = new Mat();
        cur.copyTo(copy);
        return copy;
    }

    public void release() {
        for (Mat m : levels) m.release();
        levels.clear();
    }
}
