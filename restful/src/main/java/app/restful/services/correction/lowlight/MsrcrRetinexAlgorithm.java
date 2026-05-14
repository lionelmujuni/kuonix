package app.restful.services.correction.lowlight;

import java.util.Map;

import org.bytedeco.javacpp.indexer.DoubleIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.bytedeco.opencv.opencv_core.Size;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Multi-Scale Retinex with Colour Restoration (MSRCR).
 *
 * <p>MSRCR separates illumination from reflectance across multiple Gaussian
 * scales, then restores per-pixel colour balance via a log-ratio Colour
 * Restoration Factor (CRF). The result lifts shadow detail and suppresses
 * colour casts without clipping the highlights that a simple exposure gain
 * would blow.</p>
 *
 * <p>Algorithm (Land / Rahman / Jobson):</p>
 * <ol>
 *   <li>For each scale σ: SSR_c = log(I_c + 1) − log(Gauss(I_c, σ) + 1)</li>
 *   <li>MSR_c = mean of SSR_c over all scales</li>
 *   <li>CRF_c = colorRestoration · log(125 · I_c / (ΣI + 1) + 1)</li>
 *   <li>MSRCR_c = MSR_c · CRF_c, normalised to [0, 255] via mean ± 3σ</li>
 *   <li>Output = strength · MSRCR + (1 − strength) · original</li>
 * </ol>
 *
 * <p>Reference: Rahman et al., "Multiscale Retinex for Color Image
 * Enhancement", ICIP 1996; Jobson et al., "A Multiscale Retinex for Bridging
 * the Gap Between Color Images and the Human Observation of Scenes", IEEE
 * Transactions on Image Processing 1997.</p>
 */
@Component
public class MsrcrRetinexAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "msrcr_retinex";

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double   strength         = ParamUtils.getDouble(params, "strength",         0.7);
        String   sigmaStr         = ParamUtils.getString(params, "sigmas",           "15,80,250");
        double   colorRestoration = ParamUtils.getDouble(params, "colorRestoration", 1.2);
        double[] sigmas           = parseSigmas(sigmaStr);
        return applyCore(bgr, sigmas, strength, colorRestoration);
    }

    public static Mat applyCore(Mat bgr, double[] sigmas, double strength,
            double colorRestoration) {
        strength = Math.max(0.0, Math.min(1.0, strength));
        if (sigmas == null || sigmas.length == 0) sigmas = new double[]{15, 80, 250};

        Mat bgrF = new Mat();
        bgr.convertTo(bgrF, opencv_core.CV_32F);

        MatVector channels = new MatVector(3);
        opencv_core.split(bgrF, channels);

        // Channel sum for CRF denominator (+ 1 avoids log(0) later)
        Mat chanSum = new Mat(bgrF.rows(), bgrF.cols(), opencv_core.CV_32F,
                new Scalar(1.0, 0.0, 0.0, 0.0));
        for (int c = 0; c < 3; c++) {
            opencv_core.add(chanSum, channels.get(c), chanSum);
        }
        bgrF.release();

        Mat[] result = new Mat[3];
        for (int c = 0; c < 3; c++) {
            Mat ch = channels.get(c);

            // Step 1: multi-scale retinex for this channel
            Mat msr = multiScaleRetinex(ch, sigmas);

            // Step 2: colour restoration factor
            //   CRF = colorRestoration * log(125 * ch / chanSum + 1)
            Mat scaled = new Mat();
            ch.convertTo(scaled, -1, 125.0, 0.0);          // 125 * ch
            Mat crf = new Mat();
            opencv_core.divide(scaled, chanSum, crf);       // 125 * ch / chanSum
            crf.convertTo(crf, -1, 1.0, 1.0);              // + 1
            Mat crfLog = new Mat();
            opencv_core.log(crf, crfLog);                   // log(...)
            crfLog.convertTo(crfLog, -1, colorRestoration, 0.0);
            scaled.release();
            crf.release();

            // Step 3: MSRCR = MSR * CRF
            Mat msrcr = new Mat();
            opencv_core.multiply(msr, crfLog, msrcr);
            msr.release();
            crfLog.release();

            // Step 4: normalise channel to [0, 255] via mean ± 3σ
            result[c] = normalizeToUint8(msrcr);
            msrcr.release();
        }

        chanSum.release();
        channels.close();

        // Reassemble and blend
        MatVector resultVec = new MatVector(result[0], result[1], result[2]);
        Mat retinex8 = new Mat();
        opencv_core.merge(resultVec, retinex8);
        resultVec.close();
        result[0].release();
        result[1].release();
        result[2].release();

        if (strength >= 0.999) {
            return retinex8;
        }
        Mat blended = new Mat();
        opencv_core.addWeighted(retinex8, strength, bgr, 1.0 - strength, 0.0, blended);
        retinex8.release();
        return blended;
    }

    /**
     * Computes the average single-scale retinex across all provided sigmas.
     * Returns a CV_32F Mat (unbounded float, can be negative).
     */
    private static Mat multiScaleRetinex(Mat ch, double[] sigmas) {
        // log(ch + 1) — add 1 to shift domain away from 0
        Mat chP1 = new Mat();
        ch.convertTo(chP1, -1, 1.0, 1.0);
        Mat logCh = new Mat();
        opencv_core.log(chP1, logCh);
        chP1.release();

        Mat msr = new Mat(ch.rows(), ch.cols(), opencv_core.CV_32F,
                new Scalar(0.0, 0.0, 0.0, 0.0));

        for (double sigma : sigmas) {
            int k = kernelSize(sigma);
            Size ksize = new Size(k, k);
            Mat blurred = new Mat();
            opencv_imgproc.GaussianBlur(ch, blurred, ksize, sigma, sigma,
                    opencv_core.BORDER_REFLECT);
            ksize.close();

            // log(blur + 1)
            Mat blurP1 = new Mat();
            blurred.convertTo(blurP1, -1, 1.0, 1.0);
            blurred.release();
            Mat logBlur = new Mat();
            opencv_core.log(blurP1, logBlur);
            blurP1.release();

            // SSR = log(ch+1) - log(blur+1)
            Mat ssr = new Mat();
            opencv_core.subtract(logCh, logBlur, ssr);
            logBlur.release();

            opencv_core.add(msr, ssr, msr);
            ssr.release();
        }

        logCh.release();

        // Average across scales
        msr.convertTo(msr, -1, 1.0 / sigmas.length, 0.0);
        return msr;
    }

    /**
     * Maps a float channel to CV_8U by centering on [mean − 3σ, mean + 3σ].
     * Values outside that window are clipped by the CV_8U saturate_cast.
     */
    private static Mat normalizeToUint8(Mat channel) {
        Mat mean   = new Mat();
        Mat stddev = new Mat();
        opencv_core.meanStdDev(channel, mean, stddev);

        DoubleIndexer mi = mean.createIndexer();
        DoubleIndexer si = stddev.createIndexer();
        double m = mi.get(0, 0);
        double s = si.get(0, 0);
        mi.release();
        si.release();
        mean.release();
        stddev.release();

        // linear map: [m − 3s, m + 3s] → [0, 255]
        double range = 6.0 * s + 1e-6;
        double alpha = 255.0 / range;
        double beta  = (3.0 * s - m) * 255.0 / range;

        Mat out = new Mat();
        channel.convertTo(out, opencv_core.CV_8U, alpha, beta);
        return out;
    }

    /** Kernel size for a given sigma: first odd integer ≥ 6σ, minimum 3. */
    private static int kernelSize(double sigma) {
        int k = (int) Math.ceil(6.0 * sigma);
        if (k < 3) k = 3;
        if (k % 2 == 0) k++;
        return k;
    }

    /** Parses "15,80,250" → [15.0, 80.0, 250.0]. Falls back on parse errors. */
    private static double[] parseSigmas(String s) {
        String[] parts = s.split(",");
        double[] result = new double[parts.length];
        double[] fallback = {15.0, 80.0, 250.0};
        for (int i = 0; i < parts.length; i++) {
            try {
                result[i] = Double.parseDouble(parts[i].trim());
            } catch (NumberFormatException e) {
                result[i] = (i < fallback.length) ? fallback[i] : 80.0;
            }
        }
        return result;
    }
}
