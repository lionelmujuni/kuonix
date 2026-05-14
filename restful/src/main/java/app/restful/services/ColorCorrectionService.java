package app.restful.services;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import org.bytedeco.javacpp.IntPointer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgcodecs;
import org.bytedeco.opencv.opencv_core.Mat;
import org.springframework.stereotype.Service;

import app.restful.services.correction.CorrectionRegistry;
import app.restful.services.correction.basic.ColorMatrixAlgorithm;
import app.restful.services.correction.basic.ExposureAlgorithm;
import app.restful.services.correction.basic.SaturationAlgorithm;
import app.restful.services.correction.transfer.DistributionAlignmentAlgorithm;
import app.restful.services.correction.wb.GrayWorldAlgorithm;
import app.restful.services.correction.wb.ShadesOfGrayAlgorithm;
import app.restful.services.correction.wb.TemperatureTintAlgorithm;
import app.restful.services.correction.wb.WhitePatchAlgorithm;

/**
 * Orchestrator for color correction. Algorithm implementations live in
 * {@code app.restful.services.correction.*} and are routed via
 * {@link CorrectionRegistry}. This class owns the non-algorithmic concerns:
 * RAW decoding, Base64 encoding, ROI compositing, file I/O.
 *
 * <p>The per-algorithm public methods ({@code applyGrayWorld}, etc.) are
 * kept as thin facades over the strategy classes so existing unit tests
 * continue to work.</p>
 *
 * Reference: Bianco, S. (2010). Color Correction Algorithms for Digital Cameras. PhD Thesis.
 */
@Service
public class ColorCorrectionService {

    private final RawProcessingService rawService;
    private final CorrectionRegistry   registry;

    public ColorCorrectionService(RawProcessingService rawService,
                                  CorrectionRegistry registry) {
        this.rawService = rawService;
        this.registry   = registry;
    }

    // -------------------------------------------------------------------------
    // Per-algorithm facades — kept for direct-call tests and external callers.
    // -------------------------------------------------------------------------

    public Mat applyGrayWorld(Mat bgr) {
        return GrayWorldAlgorithm.applyCore(bgr);
    }

    public Mat applyWhitePatch(Mat bgr) {
        return WhitePatchAlgorithm.applyCore(bgr);
    }

    public Mat applyShadesOfGray(Mat bgr, double p) {
        return ShadesOfGrayAlgorithm.applyCore(bgr, p);
    }

    public Mat adjustExposure(Mat bgr, double gain) {
        return ExposureAlgorithm.applyCore(bgr, gain);
    }

    public Mat enhanceSaturation(Mat bgr, double factor) {
        return SaturationAlgorithm.applyCore(bgr, factor);
    }

    public Mat applyColorMatrix(Mat bgr, double[] matrixValues) {
        return ColorMatrixAlgorithm.applyCore(bgr, matrixValues);
    }

    public Mat applyTemperatureTint(Mat bgr, double tempK, double tint) {
        return TemperatureTintAlgorithm.applyCore(bgr, tempK, tint);
    }

    public Mat applyColorDistributionAlignment(Mat srcBgr, Mat tgtBgr, double strength) {
        return DistributionAlignmentAlgorithm.applyCore(srcBgr, tgtBgr, strength);
    }

    // -------------------------------------------------------------------------
    // File-level pipelines.
    // -------------------------------------------------------------------------

    /**
     * Process image file and return corrected image as Base64 JPEG.
     */
    public String processImageToBase64(Path imagePath, String method, Map<String, Object> params) {
        if (!Files.exists(imagePath)) {
            throw new IllegalArgumentException("Image file not found: " + imagePath);
        }

        Path imageToProcess = resolveProcessablePath(imagePath);

        Mat bgr = opencv_imgcodecs.imread(imageToProcess.toString(), opencv_imgcodecs.IMREAD_COLOR);
        if (bgr == null || bgr.empty()) {
            throw new IllegalArgumentException("Cannot read image: " + imageToProcess);
        }

        Mat corrected = applyCorrectionMethod(bgr, method, params);

        if (corrected == null || corrected.empty()) {
            bgr.release();
            throw new RuntimeException("Color correction produced empty/null result for method: " + method);
        }

        try {
            Path tempFile = Files.createTempFile("cc_preview_", ".jpg");
            boolean writeSuccess = opencv_imgcodecs.imwrite(tempFile.toString(), corrected);

            if (!writeSuccess) {
                throw new RuntimeException("Failed to write corrected image to temp file");
            }

            byte[] bytes = Files.readAllBytes(tempFile);
            System.out.println("Color correction: encoded " + bytes.length + " bytes for method: " + method);

            String base64 = Base64.getEncoder().encodeToString(bytes);
            System.out.println("Color correction: base64 length = " + base64.length());

            bgr.release();
            corrected.release();
            Files.deleteIfExists(tempFile);

            String result = "data:image/jpeg;base64," + base64;
            System.out.println("Color correction: returning data URL of length " + result.length());
            return result;
        } catch (IOException e) {
            bgr.release();
            corrected.release();
            throw new RuntimeException("Failed to encode preview image", e);
        }
    }

    /**
     * Process and save corrected image to output path.
     */
    public Path processAndSaveImage(Path inputPath, Path outputPath, String method, Map<String, Object> params) {
        if (!Files.exists(inputPath)) {
            throw new IllegalArgumentException("Image file not found: " + inputPath);
        }

        Path imageToProcess = resolveProcessablePath(inputPath);

        Mat bgr = opencv_imgcodecs.imread(imageToProcess.toString(), opencv_imgcodecs.IMREAD_COLOR);
        if (bgr == null || bgr.empty()) {
            throw new IllegalArgumentException("Cannot read image: " + imageToProcess);
        }

        Mat corrected = applyCorrectionMethod(bgr, method, params);

        opencv_imgcodecs.imwrite(outputPath.toString(), corrected);

        bgr.release();
        corrected.release();

        return outputPath;
    }

    /**
     * Export variant — supports format selection (jpg/png/tiff), JPEG quality, and 16-bit TIFF.
     *
     * @param inputPath   source image
     * @param outputPath  destination path (extension must match format)
     * @param method      correction method id
     * @param params      method parameters
     * @param format      "jpg", "png", or "tiff"
     * @param quality     JPEG quality 1-100 (ignored for png/tiff)
     */
    public Path processAndSaveImageWithFormat(Path inputPath, Path outputPath,
            String method, Map<String, Object> params,
            String format, int quality) {
        if (!Files.exists(inputPath)) {
            throw new IllegalArgumentException("Image file not found: " + inputPath);
        }

        Path imageToProcess = resolveProcessablePath(inputPath);

        Mat bgr = opencv_imgcodecs.imread(imageToProcess.toString(), opencv_imgcodecs.IMREAD_COLOR);
        if (bgr == null || bgr.empty()) {
            throw new IllegalArgumentException("Cannot read image: " + imageToProcess);
        }

        Mat corrected = applyCorrectionMethod(bgr, method, params);
        bgr.release();

        try {
            String fmt = (format == null) ? "jpg" : format.toLowerCase();
            switch (fmt) {
                case "png" -> {
                    IntPointer pngParams = new IntPointer(
                        opencv_imgcodecs.IMWRITE_PNG_COMPRESSION, 6  // 0-9; 6 = good balance
                    );
                    opencv_imgcodecs.imwrite(outputPath.toString(), corrected, pngParams);
                }
                case "tiff" -> {
                    // Convert 8-bit to 16-bit by scaling (256x) so full range is utilised.
                    Mat mat16 = new Mat();
                    corrected.convertTo(mat16, opencv_core.CV_16UC3, 256.0, 0.0);
                    opencv_imgcodecs.imwrite(outputPath.toString(), mat16);
                    mat16.release();
                }
                default -> {
                    // JPEG
                    int q = (quality < 1 || quality > 100) ? 95 : quality;
                    IntPointer jpegParams = new IntPointer(
                        opencv_imgcodecs.IMWRITE_JPEG_QUALITY, q
                    );
                    opencv_imgcodecs.imwrite(outputPath.toString(), corrected, jpegParams);
                }
            }
        } finally {
            corrected.release();
        }

        return outputPath;
    }

    /**
     * Build an output filename for export.
     *
     * @param inputPath  original input path
     * @param method     correction method used
     * @param format     "jpg" | "png" | "tiff"
     * @param naming     "suffix" | "original" | "timestamp"
     */
    public static String buildExportFilename(Path inputPath, String method, String format, String naming) {
        String filename = inputPath.getFileName().toString();
        int lastDot = filename.lastIndexOf('.');
        String base = (lastDot > 0) ? filename.substring(0, lastDot) : filename;
        String ext = extensionFor(format);
        return switch (naming == null ? "suffix" : naming) {
            case "original"  -> base + ext;
            case "timestamp" -> Instant.now().toEpochMilli() + "_" + base + ext;
            default          -> base + "_" + method + ext;  // "suffix"
        };
    }

    private static String extensionFor(String format) {
        if (format == null) return ".jpg";
        return switch (format.toLowerCase()) {
            case "png"  -> ".png";
            case "tiff" -> ".tiff";
            default     -> ".jpg";
        };
    }

    /**
     * ROI-scoped preview: applies correction only inside the normalised region
     * and composites the result back into the full image.
     */
    public String processImageToBase64(Path imagePath, String method,
                                       Map<String, Object> params,
                                       app.restful.dto.RegionDto region) {
        if (region == null) return processImageToBase64(imagePath, method, params);

        if (!Files.exists(imagePath)) throw new IllegalArgumentException("Image not found: " + imagePath);

        Path imageToProcess = resolveProcessablePath(imagePath);
        Mat bgr = opencv_imgcodecs.imread(imageToProcess.toString(), opencv_imgcodecs.IMREAD_COLOR);
        if (bgr == null || bgr.empty()) throw new IllegalArgumentException("Cannot read image: " + imageToProcess);

        Mat result = applyRegionComposite(bgr, method, params, region);

        try {
            Path tempFile = Files.createTempFile("cc_roi_preview_", ".jpg");
            opencv_imgcodecs.imwrite(tempFile.toString(), result);
            byte[] bytes = Files.readAllBytes(tempFile);
            Files.deleteIfExists(tempFile);
            bgr.release();
            result.release();
            return "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(bytes);
        } catch (IOException e) {
            bgr.release();
            result.release();
            throw new RuntimeException("Failed to encode ROI preview", e);
        }
    }

    /**
     * ROI-scoped save variant.
     */
    public Path processAndSaveImage(Path inputPath, Path outputPath, String method,
                                    Map<String, Object> params,
                                    app.restful.dto.RegionDto region) {
        if (region == null) return processAndSaveImage(inputPath, outputPath, method, params);

        if (!Files.exists(inputPath)) throw new IllegalArgumentException("Image not found: " + inputPath);

        Path imageToProcess = resolveProcessablePath(inputPath);
        Mat bgr = opencv_imgcodecs.imread(imageToProcess.toString(), opencv_imgcodecs.IMREAD_COLOR);
        if (bgr == null || bgr.empty()) throw new IllegalArgumentException("Cannot read image: " + imageToProcess);

        Mat result = applyRegionComposite(bgr, method, params, region);
        opencv_imgcodecs.imwrite(outputPath.toString(), result);
        bgr.release();
        result.release();
        return outputPath;
    }

    // -------------------------------------------------------------------------
    // Internals.
    // -------------------------------------------------------------------------

    /**
     * Apply the correction inside the ROI and composite onto a clone of {@code bgr}.
     */
    private Mat applyRegionComposite(Mat bgr, String method, Map<String, Object> params,
                                     app.restful.dto.RegionDto r) {
        int x = Math.max(0, (int) Math.round(r.x() * bgr.cols()));
        int y = Math.max(0, (int) Math.round(r.y() * bgr.rows()));
        int w = Math.min((int) Math.round(r.width()  * bgr.cols()), bgr.cols() - x);
        int h = Math.min((int) Math.round(r.height() * bgr.rows()), bgr.rows() - y);
        if (w <= 0 || h <= 0) return applyCorrectionMethod(bgr, method, params);

        org.bytedeco.opencv.opencv_core.Rect rect =
                new org.bytedeco.opencv.opencv_core.Rect(x, y, w, h);
        Mat roi = bgr.apply(rect).clone();

        Mat correctedRoi = applyCorrectionMethod(roi, method, params);
        roi.release();

        Mat output = bgr.clone();
        correctedRoi.copyTo(output.apply(rect));
        correctedRoi.release();
        return output;
    }

    /**
     * Resolve the actual processable path, decoding RAW to JPEG via cache when needed.
     */
    private Path resolveProcessablePath(Path imagePath) {
        if (rawService.isRawFile(imagePath)) {
            Path full = rawService.getImageCache().get(imagePath, true);
            if (full != null && Files.exists(full)) return full;
            Path preview = rawService.getImageCache().get(imagePath, false);
            if (preview != null && Files.exists(preview)) return preview;
            throw new IllegalArgumentException("RAW file not yet decoded: " + imagePath);
        }
        return imagePath;
    }

    /**
     * Dispatch a method id to the registered strategy. {@code params} may be
     * {@code null} — algorithms that take parameters fall back to defaults.
     */
    private Mat applyCorrectionMethod(Mat bgr, String method, Map<String, Object> params) {
        if (method == null) {
            throw new IllegalArgumentException("Method must not be null");
        }
        Map<String, Object> safeParams = params == null ? new HashMap<>() : params;
        return registry.get(method.toLowerCase()).apply(bgr, safeParams);
    }
}
