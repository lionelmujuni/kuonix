package app.restful.correction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.Map;

import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import app.restful.services.correction.CorrectionRegistry;
import app.restful.services.correction.saturation.HslTargetedAlgorithm;

@SpringBootTest
public class HslTargetedAlgorithmTest {

    @Autowired
    private CorrectionRegistry registry;

    // OpenCV 8-bit HSV: H is halved. Band centres (°) → 8-bit H:
    //   Red 0°→0, Yellow 60°→30, Green 120°→60, Cyan 180°→90, Blue 240°→120, Magenta 300°→150
    private Mat red;      // saturated red
    private Mat green;    // saturated green
    private Mat blue;     // saturated blue
    private Mat orange;   // 30° in deg = hue between red and yellow (weighted sum)

    @BeforeEach
    void setUp() {
        red    = fromHsv( 0, 220, 200);
        green  = fromHsv(60, 220, 200);
        blue   = fromHsv(120, 220, 200);
        orange = fromHsv(15, 220, 200);  // halfway between red (0) and yellow (30)
    }

    @AfterEach
    void tearDown() {
        for (Mat m : new Mat[]{red, green, blue, orange}) if (m != null) m.release();
    }

    @Test
    void registryResolvesHslTargeted() {
        assertTrue(registry.contains("hsl_targeted"));
        assertNotNull(registry.get("hsl_targeted"));
    }

    @Test
    void allZerosIsIdentity() {
        Map<String, Object> params = new HashMap<>();
        Mat out = registry.get("hsl_targeted").apply(red, params);
        assertPixelsNear(red, out, 2);
        out.release();
    }

    @Test
    void redSatNegativeDesaturatesRedPixels() {
        double before = meanSat(red);
        Mat out = registry.get("hsl_targeted").apply(red, Map.of("redSat", -1.0));
        double after  = meanSat(out);
        assertTrue(after < before * 0.25,
                "Red with redSat=-1 should be near-gray; before=" + before + " after=" + after);
        out.release();
    }

    @Test
    void redSatDoesNotTouchGreenOrBluePixels() {
        double greenBefore = meanSat(green);
        double blueBefore  = meanSat(blue);
        Mat outG = registry.get("hsl_targeted").apply(green, Map.of("redSat", -1.0));
        Mat outB = registry.get("hsl_targeted").apply(blue,  Map.of("redSat", -1.0));
        double greenAfter = meanSat(outG);
        double blueAfter  = meanSat(outB);
        // 180° away from red → Gaussian weight e^{-(90/10)^2}  ≈ e^{-81} ~ 0, so untouched.
        assertEquals(greenBefore, greenAfter, 2.0,
                "Green should be unaffected by redSat");
        assertEquals(blueBefore, blueAfter, 2.0,
                "Blue should be unaffected by redSat");
        outG.release(); outB.release();
    }

    @Test
    void gaussianFeatheringBlendsNeighbourBands() {
        // Orange (hue ≈ 30° actual = 8-bit H 15) sits between red (H=0) and yellow (H=30).
        // Pulling ONLY red down should partially desaturate orange — halfway effect.
        double baseline = meanSat(orange);
        Mat redOnly    = registry.get("hsl_targeted").apply(orange, Map.of("redSat", -1.0));
        Mat yellowOnly = registry.get("hsl_targeted").apply(orange, Map.of("yellowSat", -1.0));
        double redPulled    = meanSat(redOnly);
        double yellowPulled = meanSat(yellowOnly);

        // Both should drop roughly symmetrically (orange is equidistant from both bands).
        assertTrue(redPulled < baseline * 0.85,
                "Red pull should reduce orange saturation; baseline=" + baseline + " after=" + redPulled);
        assertTrue(yellowPulled < baseline * 0.85,
                "Yellow pull should reduce orange saturation; baseline=" + baseline + " after=" + yellowPulled);
        // Within ~15% of each other — orange is symmetrically placed between the two bands.
        assertEquals(redPulled, yellowPulled, baseline * 0.15,
                "Red and yellow pulls should hit orange about equally");
        redOnly.release(); yellowOnly.release();
    }

    @Test
    void positiveBoostIncreasesSaturation() {
        // Start from a half-saturated red so there's headroom above.
        Mat halfRed = fromHsv(0, 120, 200);
        double before = meanSat(halfRed);
        Mat out = registry.get("hsl_targeted").apply(halfRed, Map.of("redSat", 0.8));
        double after = meanSat(out);
        assertTrue(after > before + 20,
                "redSat=+0.8 should boost red saturation; before=" + before + " after=" + after);
        halfRed.release(); out.release();
    }

    @Test
    void grayPixelsStayGray() {
        // S=0 input can never gain saturation via multiplicative gain.
        Mat gray = new Mat(40, 40, opencv_core.CV_8UC3, new Scalar(128.0, 128.0, 128.0, 0.0));
        Mat out  = registry.get("hsl_targeted").apply(gray,
                Map.of("redSat", 1.0, "yellowSat", 1.0, "greenSat", 1.0,
                       "cyanSat", 1.0, "blueSat", 1.0, "magentaSat", 1.0));
        assertTrue(meanSat(out) < 2.0, "Gray pixels cannot gain saturation");
        gray.release(); out.release();
    }

    @Test
    void dimensionsPreserved() {
        Mat out = registry.get("hsl_targeted").apply(red, Map.of("redSat", -0.5));
        assertEquals(red.rows(), out.rows());
        assertEquals(red.cols(), out.cols());
        assertEquals(3, out.channels());
        out.release();
    }

    @Test
    void coreApiReachable() {
        double[] deltas = {-0.3, 0.0, 0.0, 0.0, 0.0, 0.0};
        Mat out = HslTargetedAlgorithm.applyCore(red, deltas);
        assertNotNull(out);
        out.release();
    }

    @Test
    void clampsOutOfRangeParams() {
        // Passing redSat=+10 should clamp to +1 internally — verify by checking
        // output is same as if we'd passed +1.
        Mat halfRed = fromHsv(0, 120, 200);
        Mat outBig  = registry.get("hsl_targeted").apply(halfRed, Map.of("redSat", 10.0));
        Mat outOne  = registry.get("hsl_targeted").apply(halfRed, Map.of("redSat",  1.0));
        assertPixelsNear(outBig, outOne, 2);
        halfRed.release(); outBig.release(); outOne.release();
    }

    // -------------------------------------------------------------------------
    // helpers
    // -------------------------------------------------------------------------

    /** Build a 40x40 BGR image from HSV components where hue is given in 8-bit units (0..179). */
    private static Mat fromHsv(int h8, int s, int v) {
        Mat hsv = new Mat(40, 40, opencv_core.CV_8UC3, new Scalar(h8, s, v, 0.0));
        Mat bgr = new Mat();
        opencv_imgproc.cvtColor(hsv, bgr, opencv_imgproc.COLOR_HSV2BGR);
        hsv.release();
        return bgr;
    }

    private static double meanSat(Mat bgr) {
        Mat hsv = new Mat();
        opencv_imgproc.cvtColor(bgr, hsv, opencv_imgproc.COLOR_BGR2HSV);
        MatVector ch = new MatVector(3);
        opencv_core.split(hsv, ch);
        double v = opencv_core.mean(ch.get(1)).get(0);
        ch.close(); hsv.release();
        return v;
    }

    private static void assertPixelsNear(Mat a, Mat b, int tol) {
        assertEquals(a.rows(), b.rows());
        assertEquals(a.cols(), b.cols());
        UByteIndexer ai = a.createIndexer();
        UByteIndexer bi = b.createIndexer();
        int[] pa = new int[3]; int[] pb = new int[3];
        ai.get(20, 20, pa);
        bi.get(20, 20, pb);
        ai.release(); bi.release();
        assertEquals(pa[0], pb[0], tol, "B channel mismatch");
        assertEquals(pa[1], pb[1], tol, "G channel mismatch");
        assertEquals(pa[2], pb[2], tol, "R channel mismatch");
    }
}
