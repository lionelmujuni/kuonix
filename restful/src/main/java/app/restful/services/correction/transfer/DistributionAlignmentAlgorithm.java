package app.restful.services.correction.transfer;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.bytedeco.javacpp.indexer.DoubleIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgcodecs;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.springframework.stereotype.Component;

import app.restful.services.RawProcessingService;
import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Statistical LAB-space color distribution alignment (Dal'Col et al. 2023).
 * Matches source image's per-channel mean/std in LAB to a target reference.
 *
 * Reference: Dal'Col, L.; Coelho, D.; Madeira, T.; Dias, P.; Oliveira, M.
 * "A Sequential Color Correction Approach for Texture Mapping of 3D Meshes."
 * Sensors 2023, 23, 607.
 */
@Component
public class DistributionAlignmentAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "color_distribution_alignment";

    private final RawProcessingService rawService;

    public DistributionAlignmentAlgorithm(RawProcessingService rawService) {
        this.rawService = rawService;
    }

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        String refImagePath = ParamUtils.getString(params, "referenceImagePath", null);
        if (refImagePath == null || refImagePath.isEmpty()) {
            throw new IllegalArgumentException(
                    "Reference image path required for color_distribution_alignment");
        }

        Path refPath = Path.of(refImagePath);
        if (!Files.exists(refPath)) {
            throw new IllegalArgumentException("Reference image not found: " + refImagePath);
        }

        Path refImageToProcess = refPath;
        if (rawService.isRawFile(refPath)) {
            Path fullDecode = rawService.getImageCache().get(refPath, true);
            if (fullDecode != null && Files.exists(fullDecode)) {
                refImageToProcess = fullDecode;
            } else {
                Path previewDecode = rawService.getImageCache().get(refPath, false);
                if (previewDecode != null && Files.exists(previewDecode)) {
                    refImageToProcess = previewDecode;
                } else {
                    throw new IllegalArgumentException(
                            "Reference RAW file not yet decoded: " + refImagePath);
                }
            }
        }

        Mat tgtBgr = opencv_imgcodecs.imread(
                refImageToProcess.toString(), opencv_imgcodecs.IMREAD_COLOR);
        if (tgtBgr == null || tgtBgr.empty()) {
            throw new IllegalArgumentException("Cannot read reference image: " + refImageToProcess);
        }

        try {
            double strength = ParamUtils.getDouble(params, "strength", 1.0);
            return applyCore(bgr, tgtBgr, strength);
        } finally {
            tgtBgr.release();
        }
    }

    public static Mat applyCore(Mat srcBgr, Mat tgtBgr, double strength) {
        Mat srcLab = new Mat();
        Mat tgtLab = new Mat();
        opencv_imgproc.cvtColor(srcBgr, srcLab, opencv_imgproc.COLOR_BGR2Lab);
        opencv_imgproc.cvtColor(tgtBgr, tgtLab, opencv_imgproc.COLOR_BGR2Lab);

        Mat srcLabFloat = new Mat();
        Mat tgtLabFloat = new Mat();
        srcLab.convertTo(srcLabFloat, opencv_core.CV_32F);
        tgtLab.convertTo(tgtLabFloat, opencv_core.CV_32F);

        MatVector srcChannels = new MatVector(3);
        MatVector tgtChannels = new MatVector(3);
        opencv_core.split(srcLabFloat, srcChannels);
        opencv_core.split(tgtLabFloat, tgtChannels);

        Mat srcMean = new Mat();
        Mat srcStd  = new Mat();
        Mat tgtMean = new Mat();
        Mat tgtStd  = new Mat();

        opencv_core.meanStdDev(srcLabFloat, srcMean, srcStd);
        opencv_core.meanStdDev(tgtLabFloat, tgtMean, tgtStd);

        MatVector correctedChannels = new MatVector(3);
        for (int i = 0; i < 3; i++) {
            Mat srcChannel = srcChannels.get(i).clone();

            DoubleIndexer srcMeanIdx = srcMean.createIndexer();
            DoubleIndexer srcStdIdx  = srcStd.createIndexer();
            DoubleIndexer tgtMeanIdx = tgtMean.createIndexer();
            DoubleIndexer tgtStdIdx  = tgtStd.createIndexer();

            double srcMeanVal = srcMeanIdx.get(i, 0);
            double srcStdVal  = srcStdIdx.get(i, 0);
            double tgtMeanVal = tgtMeanIdx.get(i, 0);
            double tgtStdVal  = tgtStdIdx.get(i, 0);

            srcMeanIdx.close();
            srcStdIdx.close();
            tgtMeanIdx.close();
            tgtStdIdx.close();

            double scale = srcStdVal < 1e-8 ? 1.0 : (tgtStdVal / srcStdVal);

            Mat centered = new Mat();
            srcChannel.convertTo(centered, -1, 1.0, -srcMeanVal);

            Mat adjusted = new Mat();
            centered.convertTo(adjusted, -1, scale, tgtMeanVal);

            correctedChannels.put(i, adjusted);

            srcChannel.release();
            centered.release();
        }

        Mat correctedLabFloat = new Mat();
        opencv_core.merge(correctedChannels, correctedLabFloat);

        Mat correctedLab = new Mat();
        correctedLabFloat.convertTo(correctedLab, opencv_core.CV_8U);

        Mat correctedBgr = new Mat();
        opencv_imgproc.cvtColor(correctedLab, correctedBgr, opencv_imgproc.COLOR_Lab2BGR);

        Mat result = new Mat();
        if (Math.abs(strength - 1.0) < 1e-6) {
            correctedBgr.copyTo(result);
        } else {
            Mat srcBgrFloat       = new Mat();
            Mat correctedBgrFloat = new Mat();
            srcBgr.convertTo(srcBgrFloat, opencv_core.CV_32F);
            correctedBgr.convertTo(correctedBgrFloat, opencv_core.CV_32F);

            Mat blendedFloat = new Mat();
            opencv_core.addWeighted(
                    srcBgrFloat,       1.0 - strength,
                    correctedBgrFloat, strength,
                    0.0, blendedFloat);

            blendedFloat.convertTo(result, opencv_core.CV_8U);

            srcBgrFloat.release();
            correctedBgrFloat.release();
            blendedFloat.release();
        }

        srcLab.release();
        tgtLab.release();
        srcLabFloat.release();
        tgtLabFloat.release();
        srcChannels.close();
        tgtChannels.close();
        srcMean.release();
        srcStd.release();
        tgtMean.release();
        tgtStd.release();
        correctedChannels.close();
        correctedLabFloat.release();
        correctedLab.release();
        correctedBgr.release();

        return result;
    }
}
