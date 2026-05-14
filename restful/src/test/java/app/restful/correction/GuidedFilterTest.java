package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Random;

import org.bytedeco.javacpp.indexer.FloatIndexer;
import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.junit.jupiter.api.Test;

import app.restful.services.correction.primitives.GuidedFilter;

/**
 * Unit tests for {@link GuidedFilter}. These are pure-function tests — no
 * Spring context needed.
 */
public class GuidedFilterTest {

    @Test
    void dimensionsPreservedSingleChannel() {
        Mat src = new Mat(64, 48, opencv_core.CV_8UC1, new Scalar(128.0));
        Mat q = GuidedFilter.filterSelf(src, 4, 100.0);
        assertNotNull(q);
        assertEquals(src.rows(), q.rows());
        assertEquals(src.cols(), q.cols());
        assertEquals(1, q.channels());
        assertEquals(opencv_core.CV_32F, q.depth());
        src.release(); q.release();
    }

    @Test
    void dimensionsPreservedThreeChannel() {
        Mat src = new Mat(40, 40, opencv_core.CV_8UC3, new Scalar(60.0, 120.0, 200.0, 0.0));
        Mat guide = new Mat();
        MatVector ch = new MatVector(3);
        opencv_core.split(src, ch);
        ch.get(1).copyTo(guide); // luminance-ish
        Mat q = GuidedFilter.filter3(guide, src, 4, 100.0);
        assertEquals(src.rows(), q.rows());
        assertEquals(src.cols(), q.cols());
        assertEquals(3, q.channels());
        assertEquals(opencv_core.CV_32F, q.depth());
        ch.close(); guide.release(); src.release(); q.release();
    }

    @Test
    void preservesStepEdgeUnderSelfGuidance() {
        // Half-and-half image: left=50, right=200 (8-bit).
        Mat src = new Mat(80, 80, opencv_core.CV_8UC1);
        UByteIndexer idx = src.createIndexer();
        for (int y = 0; y < 80; y++) {
            for (int x = 0; x < 80; x++) {
                idx.put(y, x, x < 40 ? 50 : 200);
            }
        }
        idx.release();

        // Small eps (relative to a 255-scale image, jump is 150, 150^2 = 22500).
        // eps well below jump^2 keeps the edge; we want eps=50 (essentially nothing).
        Mat q = GuidedFilter.filterSelf(src, 4, 50.0);

        FloatIndexer fidx = q.createIndexer();
        float leftCenter  = fidx.get(40, 10);   // well inside left region
        float rightCenter = fidx.get(40, 70);   // well inside right region
        float atEdge      = Math.abs(fidx.get(40, 39) - fidx.get(40, 40));
        fidx.release();

        // Regions should hold their mean.
        assertEquals(50.0f, leftCenter, 5.0);
        assertEquals(200.0f, rightCenter, 5.0);
        // Edge magnitude should stay > 50% of original 150.
        assertTrue(atEdge > 75, "Edge jump should remain sharp; got " + atEdge);

        src.release(); q.release();
    }

    @Test
    void smoothsGaussianNoiseOnFlatRegion() {
        // Constant 128 gray + per-pixel Gaussian noise, stddev ~15.
        Mat src = new Mat(80, 80, opencv_core.CV_8UC1);
        UByteIndexer idx = src.createIndexer();
        Random r = new Random(42);
        for (int y = 0; y < 80; y++) {
            for (int x = 0; x < 80; x++) {
                int v = 128 + (int) Math.round(r.nextGaussian() * 15);
                if (v < 0) v = 0;
                if (v > 255) v = 255;
                idx.put(y, x, v);
            }
        }
        idx.release();

        double srcStd = stdDevSingleChannel(src);
        // Large eps relative to noise variance: noise stddev 15 → var 225.
        // Pass eps > var^2 ≈ 225^2 for strong smoothing. Using eps=2000 is enough.
        Mat q = GuidedFilter.filterSelf(src, 6, 2000.0);
        double qStd = stdDevSingleChannel(q);

        assertTrue(qStd < srcStd * 0.5,
                "Guided filter should at least halve noise stddev; before=" + srcStd + " after=" + qStd);
        src.release(); q.release();
    }

    @Test
    void largeEpsTendsTowardLocalMean() {
        // Checker with sub-radius detail: self-guidance + huge eps → box mean.
        Mat src = new Mat(60, 60, opencv_core.CV_8UC1);
        UByteIndexer idx = src.createIndexer();
        for (int y = 0; y < 60; y++) {
            for (int x = 0; x < 60; x++) {
                idx.put(y, x, ((x / 4 + y / 4) % 2 == 0) ? 100 : 200);
            }
        }
        idx.release();

        // With eps ≫ varI, `a → 0` and `b → meanP`, so output → mean of local window.
        Mat q = GuidedFilter.filterSelf(src, 10, 1_000_000.0);
        Scalar m = opencv_core.mean(q);
        // Image-wide mean is 150; local box means cluster tightly around it.
        FloatIndexer fidx = q.createIndexer();
        float center = fidx.get(30, 30);
        fidx.release();
        assertEquals(150.0, m.get(0), 2.0);
        assertEquals(150.0f, center, 5.0);
        src.release(); q.release();
    }

    @Test
    void tinyEpsAndRadiusKeepsSourceCloseToIdentity() {
        Mat src = new Mat(30, 30, opencv_core.CV_8UC1, new Scalar(177.0));
        Mat q = GuidedFilter.filterSelf(src, 1, 0.01);
        FloatIndexer fidx = q.createIndexer();
        float v = fidx.get(15, 15);
        fidx.release();
        assertEquals(177.0f, v, 1.5);
        src.release(); q.release();
    }

    private static double stdDevSingleChannel(Mat m) {
        Mat mean = new Mat();
        Mat std  = new Mat();
        opencv_core.meanStdDev(m, mean, std);
        org.bytedeco.javacpp.indexer.DoubleIndexer idx = std.createIndexer();
        double v = idx.get(0);
        idx.release();
        mean.release(); std.release();
        return v;
    }
}
