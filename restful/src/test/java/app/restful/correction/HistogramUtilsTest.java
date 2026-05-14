package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.junit.jupiter.api.Test;

import app.restful.services.correction.primitives.HistogramUtils;

public class HistogramUtilsTest {

    @Test
    void histogramSumsToPixelCount() {
        Mat m = new Mat(32, 32, opencv_core.CV_8UC1, new Scalar(100.0));
        int[] h = HistogramUtils.histogram8U(m);
        int sum = 0;
        for (int c : h) sum += c;
        assertEquals(32 * 32, sum);
        assertEquals(32 * 32, h[100], "All pixels should land in bin 100");
        m.release();
    }

    @Test
    void rejectsMultiChannelInput() {
        Mat m = new Mat(16, 16, opencv_core.CV_8UC3, new Scalar(1.0, 2.0, 3.0, 0.0));
        assertThrows(IllegalArgumentException.class, () -> HistogramUtils.histogram8U(m));
        m.release();
    }

    @Test
    void percentile50OfUniformGradientIsMedian() {
        Mat m = new Mat(16, 256, opencv_core.CV_8UC1);
        UByteIndexer idx = m.createIndexer();
        // Each column x gets value x, so the distribution is uniform on [0, 255].
        for (int y = 0; y < 16; y++) {
            for (int x = 0; x < 256; x++) {
                idx.put(y, x, x);
            }
        }
        idx.release();
        int[] h = HistogramUtils.histogram8U(m);
        int p50 = HistogramUtils.percentile8U(h, 0.5);
        assertTrue(Math.abs(p50 - 127) <= 2, "Expected median near 127; got " + p50);
        m.release();
    }

    @Test
    void percentilesLowHighBracketTheData() {
        Mat m = new Mat(16, 256, opencv_core.CV_8UC1);
        UByteIndexer idx = m.createIndexer();
        for (int y = 0; y < 16; y++) {
            for (int x = 0; x < 256; x++) {
                idx.put(y, x, x);
            }
        }
        idx.release();
        int[] p = HistogramUtils.percentiles8U(m, 0.05, 0.95);
        assertTrue(p[0] < p[1]);
        assertTrue(p[0] < 40, "p05 should be small; got " + p[0]);
        assertTrue(p[1] > 215, "p95 should be large; got " + p[1]);
        m.release();
    }

    @Test
    void cdfEndsAtOne() {
        Mat m = new Mat(8, 8, opencv_core.CV_8UC1, new Scalar(200.0));
        int[] h = HistogramUtils.histogram8U(m);
        double[] c = HistogramUtils.cdf(h);
        assertEquals(1.0, c[255], 1e-9);
        // Before bin 200, all zero; at 200, all one.
        assertEquals(0.0, c[199], 1e-9);
        assertEquals(1.0, c[200], 1e-9);
        m.release();
    }

    @Test
    void emptyHistogramYieldsZeroCdf() {
        int[] h = new int[256];
        double[] c = HistogramUtils.cdf(h);
        for (double v : c) assertEquals(0.0, v);
        assertEquals(0, HistogramUtils.percentile8U(h, 0.5));
    }
}
