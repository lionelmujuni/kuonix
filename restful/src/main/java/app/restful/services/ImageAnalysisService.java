package app.restful.services;

import app.restful.dto.ImageFeatures;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgcodecs;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

/**
 * Computes image features for classification.
 * Why: mirrors the Python prototype for deterministic grouping.
 */
@Service
public class ImageAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(ImageAnalysisService.class);
    
    private final RawProcessingService rawService;
    
    public ImageAnalysisService(RawProcessingService rawService) {
        this.rawService = rawService;
    }

    public ImageFeatures compute(Path path, boolean enableSkin) {
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

        int h = bgr.rows();
        int w = bgr.cols();

        // Luminance approx on sRGB: Rec.709 weights on gamma-decoded approximation (fast).
        Mat bgrF = new Mat();
        bgr.convertTo(bgrF, opencv_core.CV_32F, 1.0/255.0, 0.0);

        // Fast linearize: piecewise sRGB gamma inverse
        Mat lin = srgbToLinear(bgrF);

        Mat y = luminance709(lin); // 0..1

        double p5 = percentile(y, 5);
        double p95 = percentile(y, 95);
        double median = percentile(y, 50);
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
        double p95S = percentile(Sfloat, 95);

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
                hasSkin, skinHueMean, skinSatMean
        );
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

    private static double percentile(Mat mFloat, double p) {
        float[] arr = new float[(int)mFloat.total()];
        org.bytedeco.javacpp.indexer.FloatIndexer indexer = mFloat.createIndexer();
        indexer.get(0L, arr);
        indexer.close();
        Arrays.sort(arr);
        int index = (int)Math.round((p/100.0) * (arr.length - 1));
        index = Math.max(0, Math.min(arr.length-1, index));
        return arr[index];
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
        Mat range = new Mat();
        Mat mask;
        if (hmin <= hmax) {
            Mat ge = new Mat(); Mat le = new Mat();
            opencv_core.compare(H32, new Mat(H32.size(), H32.type(), new Scalar(hmin)), ge, opencv_core.CMP_GE);
            opencv_core.compare(H32, new Mat(H32.size(), H32.type(), new Scalar(hmax)), le, opencv_core.CMP_LE);
            mask = new Mat(); opencv_core.bitwise_and(ge, le, mask);
            ge.release(); le.release();
        } else {
            Mat ge = new Mat(); Mat le = new Mat(); Mat part = new Mat();
            opencv_core.compare(H32, new Mat(H32.size(), H32.type(), new Scalar(hmin)), ge, opencv_core.CMP_GE);
            opencv_core.compare(H32, new Mat(H32.size(), H32.type(), new Scalar(hmax)), le, opencv_core.CMP_LE);
            mask = new Mat(); opencv_core.bitwise_or(ge, le, mask);
            ge.release(); le.release(); part.release();
        }
        // gather S in mask
        Mat Smasked = new Mat();
        Sfloat.copyTo(Smasked, mask);
        boolean any = opencv_core.countNonZero(mask) > 0;
        double p95 = any ? percentile(Smasked, 95) : 0.0;

        H32.release(); mask.release(); Smasked.release();
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
        
        // Ensure resid is single channel and same size as shadowMask
        if (resid.channels() != 1) {
            Mat gray = new Mat();
            opencv_imgproc.cvtColor(resid, gray, opencv_imgproc.COLOR_BGR2GRAY);
            resid.release();
            resid = gray;
        }
        
        // Validate dimensions match
        if (resid.rows() != shadowMask.rows() || resid.cols() != shadowMask.cols()) {
            System.err.println(String.format(
                "Size mismatch in shadowResidualRatio: resid=%dx%d, mask=%dx%d",
                resid.cols(), resid.rows(), shadowMask.cols(), shadowMask.rows()
            ));
            yU8.release(); blur.release(); resid.release();
            return 0.0;
        }
        
        // collect residuals under mask
        float[] arr = maskedToArray(resid, shadowMask);
        double std = stddev(arr);
        double meanShadow = meanMasked(y, shadowMask);
        
        yU8.release(); blur.release(); resid.release();
        return std / Math.max(1e-3, meanShadow);
    }

    private static float[] maskedToArray(Mat m, Mat mask) {
        // Ensure both matrices have same total elements
        int total = (int)m.total();
        int maskTotal = (int)mask.total();
        
        if (total != maskTotal) {
            throw new IllegalArgumentException(
                String.format("Matrix size mismatch: m.total()=%d, mask.total()=%d. Dimensions: m=%dx%d, mask=%dx%d", 
                    total, maskTotal, m.cols(), m.rows(), mask.cols(), mask.rows())
            );
        }
        
        float[] src = new float[total];
        org.bytedeco.javacpp.indexer.FloatIndexer fidx = m.createIndexer();
        fidx.get(0L, src);
        fidx.close();
        
        byte[] mk = new byte[total];
        org.bytedeco.javacpp.indexer.UByteIndexer bidx = mask.createIndexer();
        int rows = mask.rows();
        int cols = mask.cols();
        for (int i = 0; i < total; i++) {
            int row = i / cols;
            int col = i % cols;
            mk[i] = (byte)bidx.get(row, col);
        }
        bidx.close();
        
        int count = 0;
        for (int i = 0; i < total; i++) {
            if ((mk[i] & 0xFF) != 0) count++;
        }
        
        float[] out = new float[count];
        int j = 0;
        for (int i = 0; i < total; i++) {
            if ((mk[i] & 0xFF) != 0) out[j++] = src[i];
        }
        return out;
    }

    private static double stddev(float[] arr) {
        if (arr.length==0) return 0.0;
        double mean = 0.0;
        for (float v: arr) mean += v;
        mean /= arr.length;
        double var = 0.0;
        for (float v: arr) { double d = v-mean; var += d*d; }
        var /= Math.max(1, arr.length-1);
        return Math.sqrt(var);
    }

    private static double meanMasked(Mat m, Mat mask) {
        Scalar sc = opencv_core.mean(m, mask);
        return sc.get(0);
    }
}
