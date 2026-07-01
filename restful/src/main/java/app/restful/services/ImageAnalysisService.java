package app.restful.services;

import app.restful.dto.ImageFeatures;
import org.bytedeco.javacpp.FloatPointer;
import org.bytedeco.javacpp.IntPointer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgcodecs;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.Semaphore;

/**
 * Computes image features for classification.
 * Why: mirrors the Python prototype for deterministic grouping.
 */
@Service
public class ImageAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(ImageAnalysisService.class);

    // The features are global statistics — percentiles, means, masked
    // histograms — so computing them on a bounded-size copy is equivalent.
    // Full 24MP decodes otherwise allocate ~10 frame-sized float Mats each.
    private static final int ANALYSIS_MAX_DIM = 2560;

    // Bounds concurrent analyses regardless of entry point. The /classify
    // endpoint runs on unbounded HTTP request threads, so the executor pool
    // alone can't enforce this. Sized to match analysisExecutor's max.
    private static final int MAX_CONCURRENT_ANALYSES =
        Math.max(2, Math.min(4, Runtime.getRuntime().availableProcessors()));

    private final Semaphore analysisSlots = new Semaphore(MAX_CONCURRENT_ANALYSES, true);

    private final RawProcessingService rawService;

    public ImageAnalysisService(RawProcessingService rawService) {
        this.rawService = rawService;
    }

    public ImageFeatures compute(Path path, boolean enableSkin) {
        analysisSlots.acquireUninterruptibly();
        try {
            return computeBounded(path, enableSkin);
        } finally {
            analysisSlots.release();
        }
    }

    private ImageFeatures computeBounded(Path path, boolean enableSkin) {
        if (!Files.exists(path)) {
            throw new IllegalArgumentException("File not found: " + path);
        }

        // Handle RAW images: use cached full decode if available, otherwise use preview
        Path imagePath = path;
        boolean isPreview = false;
        
        if (rawService.isRawFile(path)) {
            // Check if full decode is available in cache
            Path fullDecode = rawService.getImageCache().get(path, true);
            if (fullDecode != null && Files.exists(fullDecode)) {
                imagePath = fullDecode;
                log.debug("Using full RAW decode for analysis: {}", fullDecode);
            } else {
                // Try preview
                Path previewDecode = rawService.getImageCache().get(path, false);
                if (previewDecode != null && Files.exists(previewDecode)) {
                    imagePath = previewDecode;
                    isPreview = true;
                    log.info("Using RAW preview for analysis (full decode not ready): {}", path.getFileName());
                } else {
                    log.warn("No RAW decode available for analysis: {}", path);
                }
            }
        } else if (rawService.isPreviewImage(path)) {
            // This is already a preview/decoded image
            isPreview = true;
            log.debug("Analyzing preview image: {}", path.getFileName());
        }

        Mat bgr = opencv_imgcodecs.imread(imagePath.toString(), opencv_imgcodecs.IMREAD_COLOR);
        if (bgr == null || bgr.empty()) {
            throw new IllegalArgumentException("Unreadable image: " + imagePath);
        }

        // Reported dimensions stay those of the decoded file.
        int h = bgr.rows();
        int w = bgr.cols();

        // Analyse at a bounded resolution. Half-size previews already land
        // under this cap, so it also makes preview- and full-decode analyses
        // more consistent with each other.
        int maxSide = Math.max(w, h);
        if (maxSide > ANALYSIS_MAX_DIM) {
            double scale = (double) ANALYSIS_MAX_DIM / maxSide;
            Mat resized = new Mat();
            opencv_imgproc.resize(bgr, resized,
                    new Size((int) Math.round(w * scale), (int) Math.round(h * scale)),
                    0, 0, opencv_imgproc.INTER_AREA);
            bgr.release();
            bgr = resized;
        }

        // Luminance approx on sRGB: Rec.709 weights on gamma-decoded approximation (fast).
        Mat bgrF = new Mat();
        bgr.convertTo(bgrF, opencv_core.CV_32F, 1.0/255.0, 0.0);

        // Fast linearize: piecewise sRGB gamma inverse
        Mat lin = srgbToLinear(bgrF);

        Mat y = luminance709(lin); // 0..1

        // One luma histogram serves all three percentiles — a single native O(N)
        // pass replaces three full-array sorts of the same data.
        Mat yHist = hist01(y, null);
        double p5 = percentileFromHist(yHist, 5);
        double p95 = percentileFromHist(yHist, 95);
        double median = percentileFromHist(yHist, 50);
        yHist.release();

        Scalar meanYSc = opencv_core.mean(y);
        double meanY = meanYSc.get(0);
        double stdY = stddev(y);

        double blackPct = tailPct(y, 0.03, true);
        double whitePct = tailPct(y, 0.97, false);

        // HSV stats
        Mat hsv = new Mat();
        opencv_imgproc.cvtColor(bgr, hsv, opencv_imgproc.COLOR_BGR2HSV);
        MatVector hsvSplit = new MatVector(3);
        opencv_core.split(hsv, hsvSplit);
        Mat H = hsvSplit.get(0);  // 0..180
        Mat S = hsvSplit.get(1);  // 0..255
        Mat V = hsvSplit.get(2);

        Mat Sfloat = new Mat();
        S.convertTo(Sfloat, opencv_core.CV_32F, 1.0/255.0, 0.0);
        double meanS = opencv_core.mean(Sfloat).get(0);
        Mat sHist = hist01(Sfloat, null);
        double p95S = percentileFromHist(sHist, 95);
        sHist.release();

        boolean overRed      = oversatInHue(Sfloat, H, 345, 360) || oversatInHue(Sfloat, H, 0, 15);
        boolean overYellow   = oversatInHue(Sfloat, H, 45, 70);
        boolean overGreen    = oversatInHue(Sfloat, H, 80, 150);
        boolean overCyan     = oversatInHue(Sfloat, H, 165, 195);
        boolean overBlue     = oversatInHue(Sfloat, H, 200, 255);
        boolean overMagenta  = oversatInHue(Sfloat, H, 285, 325);

        // Lab centroid for cast
        Mat lab = new Mat();
        opencv_imgproc.cvtColor(bgr, lab, opencv_imgproc.COLOR_BGR2Lab);
        MatVector labSplit = new MatVector(3);
        opencv_core.split(lab, labSplit);
        Mat a = labSplit.get(1); // around 128 center
        Mat b = labSplit.get(2);
        double aMean = opencv_core.mean(a).get(0) - 128.0;
        double bMean = opencv_core.mean(b).get(0) - 128.0;
        double abDist = Math.hypot(aMean, bMean);
        double castAngle = angleDeg(aMean, bMean);

        // Noise in shadows: residual std over mean
        Mat shadowMask = compareFloat(y, /*<=*/ true, 0.35);
        double noiseRatio = shadowResidualRatio(y, shadowMask);

        // Dark-channel haze proxy (He et al. 2009). Per-pixel min over BGR,
        // eroded with a small kernel, then averaged. Clear images sit near 0;
        // hazy images push it above ~0.25.
        double darkChannelMean = darkChannelMean(bgrF);

        // Skin (optional): OFF by default to avoid cascade shipping. Hook present for future.
        boolean hasSkin = false;
        double skinHueMean = 0.0;
        double skinSatMean = 0.0;

        // Global cleanup
        bgr.release(); bgrF.release(); lin.release(); y.release(); hsv.release(); lab.release();
        hsvSplit.close();
        labSplit.close();
        Sfloat.release(); shadowMask.release();

        return new ImageFeatures(
                w, h,
                median, meanY, p5, p95,
                blackPct, whitePct, stdY,
                meanS, p95S,
                overRed, overGreen, overBlue, overCyan, overMagenta, overYellow,
                aMean, bMean, abDist, castAngle,
                noiseRatio,
                hasSkin, skinHueMean, skinSatMean,
                darkChannelMean
        );
    }

    /**
     * Mean of the dark channel over [0, 1]. The dark channel is the per-pixel
     * minimum across BGR (after a small min-erosion). For haze-free outdoor
     * images this stays close to 0; haze adds a non-zero offset to all
     * channels, raising it sharply.
     */
    private static double darkChannelMean(Mat bgrF) {
        MatVector ch = new MatVector(3);
        opencv_core.split(bgrF, ch);
        Mat minBG = new Mat();
        opencv_core.min(ch.get(0), ch.get(1), minBG);
        Mat minBGR = new Mat();
        opencv_core.min(minBG, ch.get(2), minBGR);
        Mat eroded = new Mat();
        Mat kernel = opencv_imgproc.getStructuringElement(
                opencv_imgproc.MORPH_RECT, new Size(7, 7));
        opencv_imgproc.erode(minBGR, eroded, kernel);
        double m = opencv_core.mean(eroded).get(0);
        ch.close();
        minBG.release(); minBGR.release(); eroded.release(); kernel.release();
        return m;
    }

    // --- helpers ---

    private static Mat srgbToLinear(Mat srgb) {
        // piecewise: x<=0.04045 -> x/12.92 else ((x+0.055)/1.055)^2.4
        Mat lin = new Mat(srgb.size(), srgb.type());
        Mat mask = new Mat();
        Mat thrMat = new Mat(srgb.size(), srgb.type(), new Scalar(0.04045,0.04045,0.04045,0));
        opencv_core.compare(srgb, thrMat, mask, opencv_core.CMP_LE);
        thrMat.release();
        // low
        Mat low = new Mat();
        Mat divMat = new Mat(srgb.size(), srgb.type(), new Scalar(12.92,12.92,12.92,0));
        opencv_core.divide(srgb, divMat, low);
        divMat.release();
        // high
        Mat high = new Mat();
        Mat tmp = new Mat();
        Mat addMat = new Mat(srgb.size(), srgb.type(), new Scalar(0.055,0.055,0.055,0));
        opencv_core.add(srgb, addMat, tmp);
        addMat.release();
        Mat divMat2 = new Mat(tmp.size(), tmp.type(), new Scalar(1.055,1.055,1.055,0));
        opencv_core.divide(tmp, divMat2, tmp);
        divMat2.release();
        opencv_core.pow(tmp, 2.4, high);
        // blend
        low.copyTo(lin, mask);
        Mat invMask = new Mat();
        opencv_core.bitwise_not(mask, invMask);
        high.copyTo(lin, invMask);
        mask.release(); low.release(); high.release(); tmp.release(); invMask.release();
        return lin;
    }

    private static Mat luminance709(Mat linBgr) {
        MatVector ch = new MatVector(3);
        opencv_core.split(linBgr, ch);
        Mat b = ch.get(0), g = ch.get(1), r = ch.get(2);
        Mat y = new Mat(linBgr.size(), opencv_core.CV_32F);
        // y = 0.2126*r + 0.7152*g + 0.0722*b
        opencv_core.addWeighted(r, 0.2126, g, 0.7152, 0.0, y);
        opencv_core.addWeighted(y, 1.0, b, 0.0722, 0.0, y);
        ch.close();
        return y;
    }

    /** Histogram bins for percentile estimation over [0, 1]. 1024 → ~0.001 error. */
    private static final int HIST_BINS = 1024;
    /** Upper range nudged past 1.0 so pixels at exactly 1.0 are counted (calcHist ranges are half-open). */
    private static final float HIST_UPPER = 1.0001f;

    /**
     * Histogram of a single-channel {@code src} (values in [0,1]) over an
     * optional {@code mask}. One native O(N) pass; reuse it for every percentile
     * needed from the same data instead of allocating a {@code float[N]} and
     * sorting per call.
     */
    private static Mat hist01(Mat src, Mat mask) {
        Mat hist = new Mat();
        opencv_imgproc.calcHist(
                src, 1, new IntPointer(new int[]{0}),
                mask == null ? new Mat() : mask,
                hist, 1, new IntPointer(new int[]{HIST_BINS}),
                new FloatPointer(new float[]{0f, HIST_UPPER}));
        return hist;
    }

    /**
     * Percentile {@code p} (0..100) read from a cumulative {@link #hist01}
     * histogram: the centre of the bin where the running count first reaches the
     * target, mapped back to [0,1]. O(bins) and never touches the pixel buffer.
     */
    private static double percentileFromHist(Mat hist, double p) {
        int bins = (int) hist.total();
        org.bytedeco.javacpp.indexer.FloatIndexer idx = hist.createIndexer();
        double total = 0.0;
        for (int i = 0; i < bins; i++) total += idx.get(i, 0);
        if (total <= 0.0) { idx.close(); return 0.0; }
        double target = (p / 100.0) * total;
        double cum = 0.0;
        int bin = bins - 1;
        for (int i = 0; i < bins; i++) {
            cum += idx.get(i, 0);
            if (cum >= target) { bin = i; break; }
        }
        idx.close();
        return (bin + 0.5) * HIST_UPPER / bins;
    }

    private static double stddev(Mat mFloat) {
        Mat mean = new Mat();
        Mat sd = new Mat();
        opencv_core.meanStdDev(mFloat, mean, sd);
        org.bytedeco.javacpp.indexer.DoubleIndexer idx = sd.createIndexer();
        double v = idx.get(0, 0);
        idx.close();
        mean.release(); sd.release();
        return v;
    }

    private static double tailPct(Mat y, double thr, boolean lower) {
        Mat mask = compareFloat(y, lower, thr);
        double pct = (double)opencv_core.countNonZero(mask) / (double)y.total();
        mask.release();
        return pct;
    }

    private static Mat compareFloat(Mat m, boolean le, double thr) {
        Mat thrMat = new Mat(m.size(), m.type(), new Scalar(thr));
        Mat mask = new Mat();
        opencv_core.compare(m, thrMat, mask, le ? opencv_core.CMP_LE : opencv_core.CMP_GE);
        thrMat.release();
        return mask;
    }

    private static boolean oversatInHue(Mat Sfloat, Mat H, int hmin, int hmax) {
        // Build mask for hue sector; OpenCV hue is 0..180, we multiplied by 2 notionally in Python.
        // We'll use 0..360 degrees on-the-fly: convert H to deg*2
        Mat H32 = new Mat();
        H.convertTo(H32, opencv_core.CV_32F, 2.0, 0.0); // 0..360
        Mat lo = new Mat(H32.size(), H32.type(), new Scalar(hmin));
        Mat hi = new Mat(H32.size(), H32.type(), new Scalar(hmax));
        Mat ge = new Mat(); Mat le = new Mat();
        opencv_core.compare(H32, lo, ge, opencv_core.CMP_GE);
        opencv_core.compare(H32, hi, le, opencv_core.CMP_LE);
        Mat mask = new Mat();
        if (hmin <= hmax) {
            opencv_core.bitwise_and(ge, le, mask);
        } else {
            opencv_core.bitwise_or(ge, le, mask);
        }
        lo.release(); hi.release(); ge.release(); le.release();

        // p95 of saturation within the sector, straight from a masked histogram —
        // no copyTo + sort of the gathered pixels.
        boolean any = opencv_core.countNonZero(mask) > 0;
        double p95 = 0.0;
        if (any) {
            Mat hist = hist01(Sfloat, mask);
            p95 = percentileFromHist(hist, 95);
            hist.release();
        }

        H32.release(); mask.release();
        return any && p95 >= 0.90;
    }

    private static double angleDeg(double x, double y) {
        double ang = Math.toDegrees(Math.atan2(y, x));
        if (ang < 0) ang += 360.0;
        return ang;
    }

    private static double shadowResidualRatio(Mat y, Mat shadowMask) {
        if (opencv_core.countNonZero(shadowMask) == 0) return 0.0;

        // Gaussian blur residual
        Mat yU8 = new Mat();
        y.convertTo(yU8, opencv_core.CV_8U, 255.0, 0.0);

        Mat blur = new Mat();
        opencv_imgproc.GaussianBlur(yU8, blur, new Size(0,0), 1.2);

        Mat resid = new Mat();
        // Use empty mask parameter - fourth parameter should be noArray() not new Mat()
        opencv_core.subtract(yU8, blur, resid, new Mat(), opencv_core.CV_32F);
        resid.convertTo(resid, opencv_core.CV_32F, 1.0/255.0, 0.0);

        // Std of the residual under the shadow mask in a single native call —
        // replaces the per-pixel Java scan that materialised and re-collected the
        // whole frame. (Population std, matching stddev(Mat) used for stdY.)
        Mat mean = new Mat();
        Mat sd = new Mat();
        opencv_core.meanStdDev(resid, mean, sd, shadowMask);
        org.bytedeco.javacpp.indexer.DoubleIndexer sdIdx = sd.createIndexer();
        double std = sdIdx.get(0, 0);
        sdIdx.close();

        double meanShadow = meanMasked(y, shadowMask);

        yU8.release(); blur.release(); resid.release(); mean.release(); sd.release();
        return std / Math.max(1e-3, meanShadow);
    }

    private static double meanMasked(Mat m, Mat mask) {
        Scalar sc = opencv_core.mean(m, mask);
        return sc.get(0);
    }
}
