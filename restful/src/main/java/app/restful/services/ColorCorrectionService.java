package app.restful.services;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

import org.bytedeco.javacpp.indexer.FloatIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgcodecs;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.springframework.stereotype.Service;

/**
 * Color correction algorithms based on photographic research.
 * Implements White Balance (Gray World, White Patch, Shades of Gray),
 * Exposure adjustment, Saturation enhancement, and Color Matrix transformation.
 * 
 * Reference: Bianco, S. (2010). Color Correction Algorithms for Digital Cameras. PhD Thesis.
 */
@Service
public class ColorCorrectionService {

    private final RawProcessingService rawService;

    public ColorCorrectionService(RawProcessingService rawService) {
        this.rawService = rawService;
    }

    /**
     * Apply Gray World white balance correction.
     * Assumes the average color of the scene is gray (achromatic).
     * Computes average R, G, B and scales channels so averages become equal.
     */
    public Mat applyGrayWorld(Mat bgr) {
        MatVector channels = new MatVector(3);
        opencv_core.split(bgr, channels);

        Mat result = new Mat();
        bgr.copyTo(result);

        // Compute mean of each channel
        Scalar meanB = opencv_core.mean(channels.get(0));
        Scalar meanG = opencv_core.mean(channels.get(1));
        Scalar meanR = opencv_core.mean(channels.get(2));

        double avgB = meanB.get(0);
        double avgG = meanG.get(0);
        double avgR = meanR.get(0);

        // Calculate overall gray mean
        double grayMean = (avgB + avgG + avgR) / 3.0;

        // Compute gain factors
        double gainB = grayMean / (avgB + 1e-8);
        double gainG = grayMean / (avgG + 1e-8);
        double gainR = grayMean / (avgR + 1e-8);

        // Apply gains to each channel
        Mat channelB = channels.get(0).clone();
        Mat channelG = channels.get(1).clone();
        Mat channelR = channels.get(2).clone();

        channelB.convertTo(channelB, -1, gainB, 0.0);
        channelG.convertTo(channelG, -1, gainG, 0.0);
        channelR.convertTo(channelR, -1, gainR, 0.0);

        // Merge back
        MatVector corrected = new MatVector(channelB, channelG, channelR);
        opencv_core.merge(corrected, result);

        // Cleanup
        channels.close();
        channelB.release();
        channelG.release();
        channelR.release();
        corrected.close();

        return result;
    }

    /**
     * Apply White Patch (Max RGB) white balance correction.
     * Assumes the brightest patch in the scene is white (achromatic).
     * Finds maximum R, G, B values and scales channels so maxima become equal.
     */
    public Mat applyWhitePatch(Mat bgr) {
        MatVector channels = new MatVector(3);
        opencv_core.split(bgr, channels);

        Mat result = new Mat();
        bgr.copyTo(result);

        // Find max of each channel
        double[] minVal = new double[1];
        double[] maxValB = new double[1];
        double[] maxValG = new double[1];
        double[] maxValR = new double[1];

        opencv_core.minMaxLoc(channels.get(0), minVal, maxValB, null, null, null);
        opencv_core.minMaxLoc(channels.get(1), minVal, maxValG, null, null, null);
        opencv_core.minMaxLoc(channels.get(2), minVal, maxValR, null, null, null);

        // Calculate maximum across channels
        double maxVal = Math.max(Math.max(maxValB[0], maxValG[0]), maxValR[0]);

        // Compute gain factors
        double gainB = maxVal / (maxValB[0] + 1e-8);
        double gainG = maxVal / (maxValG[0] + 1e-8);
        double gainR = maxVal / (maxValR[0] + 1e-8);

        // Apply gains
        Mat channelB = channels.get(0).clone();
        Mat channelG = channels.get(1).clone();
        Mat channelR = channels.get(2).clone();

        channelB.convertTo(channelB, -1, gainB, 0.0);
        channelG.convertTo(channelG, -1, gainG, 0.0);
        channelR.convertTo(channelR, -1, gainR, 0.0);

        // Merge back
        MatVector corrected = new MatVector(channelB, channelG, channelR);
        opencv_core.merge(corrected, result);

        // Cleanup
        channels.close();
        channelB.release();
        channelG.release();
        channelR.release();
        corrected.close();

        return result;
    }

    /**
     * Apply Shades of Gray white balance correction.
     * Generalization using Minkowski p-norm (p=6 recommended).
     * Balances between Gray World (p=1) and White Patch (p→∞).
     */
    public Mat applyShadesOfGray(Mat bgr, double p) {
        MatVector channels = new MatVector(3);
        opencv_core.split(bgr, channels);

        Mat result = new Mat();
        bgr.copyTo(result);

        // Compute p-norm for each channel
        double normB = computeMinkowskiNorm(channels.get(0), p);
        double normG = computeMinkowskiNorm(channels.get(1), p);
        double normR = computeMinkowskiNorm(channels.get(2), p);

        // Overall norm
        double overallNorm = (normB + normG + normR) / 3.0;

        // Compute gains
        double gainB = overallNorm / (normB + 1e-8);
        double gainG = overallNorm / (normG + 1e-8);
        double gainR = overallNorm / (normR + 1e-8);

        // Apply gains
        Mat channelB = channels.get(0).clone();
        Mat channelG = channels.get(1).clone();
        Mat channelR = channels.get(2).clone();

        channelB.convertTo(channelB, -1, gainB, 0.0);
        channelG.convertTo(channelG, -1, gainG, 0.0);
        channelR.convertTo(channelR, -1, gainR, 0.0);

        // Merge back
        MatVector corrected = new MatVector(channelB, channelG, channelR);
        opencv_core.merge(corrected, result);

        // Cleanup
        channels.close();
        channelB.release();
        channelG.release();
        channelR.release();
        corrected.close();

        return result;
    }

    /**
     * Adjust exposure by applying uniform gain across all channels.
     * Positive gain brightens, negative gain darkens.
     * gain = target_mean / current_mean
     */
    public Mat adjustExposure(Mat bgr, double gain) {
        Mat result = new Mat();
        bgr.convertTo(result, -1, gain, 0.0);
        return result;
    }

    /**
     * Enhance saturation in HSV color space.
     * factor > 1.0 increases saturation (more vivid colors)
     * factor < 1.0 decreases saturation (more muted colors)
     */
    public Mat enhanceSaturation(Mat bgr, double factor) {
        Mat hsv = new Mat();
        opencv_imgproc.cvtColor(bgr, hsv, opencv_imgproc.COLOR_BGR2HSV);

        MatVector channels = new MatVector(3);
        opencv_core.split(hsv, channels);

        // Get saturation channel and multiply by factor
        Mat s = channels.get(1).clone();
        s.convertTo(s, -1, factor, 0.0);

        // Merge back
        MatVector merged = new MatVector(channels.get(0), s, channels.get(2));
        opencv_core.merge(merged, hsv);

        Mat result = new Mat();
        opencv_imgproc.cvtColor(hsv, result, opencv_imgproc.COLOR_HSV2BGR);

        // Cleanup
        channels.close();
        s.release();
        merged.close();
        hsv.release();

        return result;
    }

    /**
     * Apply color correction matrix (3x3 transformation).
     * Converts from camera RGB to standard color space (e.g., sRGB).
     * Matrix values should be provided as 9-element array in row-major order.
     */
    public Mat applyColorMatrix(Mat bgr, double[] matrixValues) {
        if (matrixValues.length != 9) {
            throw new IllegalArgumentException("Color matrix must have 9 values");
        }

        // Create 3x3 transformation matrix
        Mat transformMatrix = new Mat(3, 3, opencv_core.CV_32F);
        FloatIndexer idx = transformMatrix.createIndexer();
        for (int i = 0; i < 3; i++) {
            for (int j = 0; j < 3; j++) {
                idx.put(i, j, (float) matrixValues[i * 3 + j]);
            }
        }
        idx.release();

        // Convert to float
        Mat bgrFloat = new Mat();
        bgr.convertTo(bgrFloat, opencv_core.CV_32F);

        // Apply transform
        Mat result = new Mat();
        opencv_core.transform(bgrFloat, result, transformMatrix);

        // Convert back to 8-bit
        Mat result8u = new Mat();
        result.convertTo(result8u, opencv_core.CV_8U);

        // Cleanup
        transformMatrix.release();
        bgrFloat.release();
        result.release();

        return result8u;
    }

    /**
     * Process image file and return corrected image as Base64 JPEG.
     */
    public String processImageToBase64(Path imagePath, String method, java.util.Map<String, Object> params) {
        if (!Files.exists(imagePath)) {
            throw new IllegalArgumentException("Image file not found: " + imagePath);
        }

        // Handle RAW files by using cached decoded JPEG
        Path imageToProcess = imagePath;
        if (rawService.isRawFile(imagePath)) {
            // Try full decode first, fallback to preview
            Path fullDecode = rawService.getImageCache().get(imagePath, true);
            if (fullDecode != null && Files.exists(fullDecode)) {
                imageToProcess = fullDecode;
            } else {
                Path previewDecode = rawService.getImageCache().get(imagePath, false);
                if (previewDecode != null && Files.exists(previewDecode)) {
                    imageToProcess = previewDecode;
                } else {
                    throw new IllegalArgumentException("RAW file not yet decoded: " + imagePath + ". Please wait for decoding to complete.");
                }
            }
        }

        Mat bgr = opencv_imgcodecs.imread(imageToProcess.toString(), opencv_imgcodecs.IMREAD_COLOR);
        if (bgr == null || bgr.empty()) {
            throw new IllegalArgumentException("Cannot read image: " + imageToProcess);
        }

        Mat corrected = applyCorrectionMethod(bgr, method, params);
        
        if (corrected == null || corrected.empty()) {
            bgr.release();
            throw new RuntimeException("Color correction produced empty/null result for method: " + method);
        }

        // Encode to JPEG via temp file (ByteDeco approach)
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
            
            // Cleanup
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
    public Path processAndSaveImage(Path inputPath, Path outputPath, String method, java.util.Map<String, Object> params) {
        if (!Files.exists(inputPath)) {
            throw new IllegalArgumentException("Image file not found: " + inputPath);
        }

        // Handle RAW files by using cached decoded JPEG
        Path imageToProcess = inputPath;
        if (rawService.isRawFile(inputPath)) {
            // Try full decode first, fallback to preview
            Path fullDecode = rawService.getImageCache().get(inputPath, true);
            if (fullDecode != null && Files.exists(fullDecode)) {
                imageToProcess = fullDecode;
            } else {
                Path previewDecode = rawService.getImageCache().get(inputPath, false);
                if (previewDecode != null && Files.exists(previewDecode)) {
                    imageToProcess = previewDecode;
                } else {
                    throw new IllegalArgumentException("RAW file not yet decoded: " + inputPath + ". Please wait for decoding to complete.");
                }
            }
        }

        Mat bgr = opencv_imgcodecs.imread(imageToProcess.toString(), opencv_imgcodecs.IMREAD_COLOR);
        if (bgr == null || bgr.empty()) {
            throw new IllegalArgumentException("Cannot read image: " + imageToProcess);
        }

        Mat corrected = applyCorrectionMethod(bgr, method, params);

        // Save to output path
        opencv_imgcodecs.imwrite(outputPath.toString(), corrected);

        // Cleanup
        bgr.release();
        corrected.release();

        return outputPath;
    }

    /**
     * Variant of {@link #processImageToBase64} that applies the correction only to a
     * rectangular region (ROI) and composites the result back into the full image.
     *
     * @param region normalised region (0–1 range); null means whole image
     */
    public String processImageToBase64(Path imagePath, String method,
                                       java.util.Map<String, Object> params,
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
     * Variant of {@link #processAndSaveImage} that applies the correction only inside the ROI.
     */
    public Path processAndSaveImage(Path inputPath, Path outputPath, String method,
                                    java.util.Map<String, Object> params,
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

    /**
     * Applies the correction to the ROI and composites it back into a clone of {@code bgr}.
     */
    private Mat applyRegionComposite(Mat bgr, String method, java.util.Map<String, Object> params,
                                     app.restful.dto.RegionDto r) {
        // Convert normalised (0–1) coordinates to pixel coordinates
        int x = Math.max(0, (int) Math.round(r.x() * bgr.cols()));
        int y = Math.max(0, (int) Math.round(r.y() * bgr.rows()));
        int w = Math.min((int) Math.round(r.width()  * bgr.cols()), bgr.cols() - x);
        int h = Math.min((int) Math.round(r.height() * bgr.rows()), bgr.rows() - y);
        if (w <= 0 || h <= 0) return applyCorrectionMethod(bgr, method, params); // degenerate → full

        // Extract ROI sub-image
        org.bytedeco.opencv.opencv_core.Rect rect =
                new org.bytedeco.opencv.opencv_core.Rect(x, y, w, h);
        Mat roi = bgr.apply(rect).clone();

        // Correct only the ROI
        Mat correctedRoi = applyCorrectionMethod(roi, method, params);
        roi.release();

        // Clone original, paste corrected ROI back
        Mat output = bgr.clone();
        correctedRoi.copyTo(output.apply(rect));
        correctedRoi.release();
        return output;
    }

    /**
     * Resolves the actual processable path for an image, following RAW cache lookups.
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
     * Manual white balance using colour temperature (Kelvin) and tint (green↔magenta).
     *
     * <p>Converts Kelvin to approximate RGB multipliers via the Planckian locus
     * polynomial approximation (Kim et al. 2002), then applies a tint bias on the
     * green channel. Multipliers are normalised so the brightest channel stays at 1.0.</p>
     *
     * @param bgr    source image in BGR format (uint8)
     * @param tempK  colour temperature in Kelvin [2000–10000]
     * @param tint   green/magenta bias [-1.0, +1.0]; positive = more green, negative = more magenta
     */
    public Mat applyTemperatureTint(Mat bgr, double tempK, double tint) {
        // Clamp inputs
        tempK = Math.max(1000, Math.min(20000, tempK));
        tint  = Math.max(-1.0, Math.min(1.0, tint));

        // Planckian locus approximation (temperature → chromaticity → RGB gains)
        double t = tempK / 100.0;
        double r, g, b;

        // Red
        if (t <= 66) {
            r = 255;
        } else {
            r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
        }

        // Green
        if (t <= 66) {
            g = 99.4708025861 * Math.log(t) - 161.1195681661;
        } else {
            g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
        }

        // Blue
        if (t >= 66) {
            b = 255;
        } else if (t <= 19) {
            b = 0;
        } else {
            b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
        }

        // Normalise to [0, 1] gains
        double rGain = Math.max(0.01, Math.min(255, r)) / 255.0;
        double gGain = Math.max(0.01, Math.min(255, g)) / 255.0;
        double bGain = Math.max(0.01, Math.min(255, b)) / 255.0;

        // Apply tint: shift green channel; compensate red/blue to maintain luminance balance
        double tintShift = tint * 0.25;
        gGain = Math.max(0.01, gGain + tintShift);
        rGain = Math.max(0.01, rGain - tintShift * 0.5);
        bGain = Math.max(0.01, bGain - tintShift * 0.5);

        // Normalise so max gain = 1.0 (avoid clipping)
        double maxGain = Math.max(rGain, Math.max(gGain, bGain));
        rGain /= maxGain;
        gGain /= maxGain;
        bGain /= maxGain;

        // Apply per-channel gains (BGR order in OpenCV)
        MatVector channels = new MatVector(3);
        opencv_core.split(bgr, channels);

        Mat bCh = new Mat(), gCh = new Mat(), rCh = new Mat();
        channels.get(0).convertTo(bCh, -1, bGain, 0);
        channels.get(1).convertTo(gCh, -1, gGain, 0);
        channels.get(2).convertTo(rCh, -1, rGain, 0);

        Mat result = new Mat();
        MatVector merged = new MatVector(bCh, gCh, rCh);
        opencv_core.merge(merged, result);

        channels.close();
        bCh.release(); gCh.release(); rCh.release();
        merged.close();

        return result;
    }

    /**
     * Apply correction method based on method name and parameters.
     */
    private Mat applyCorrectionMethod(Mat bgr, String method, java.util.Map<String, Object> params) {
        Mat result;

        switch (method.toLowerCase()) {
            case "gray_world":
                result = applyGrayWorld(bgr);
                break;

            case "white_patch":
                result = applyWhitePatch(bgr);
                break;

            case "shades_of_gray":
                double p = getDoubleParam(params, "p", 6.0);
                result = applyShadesOfGray(bgr, p);
                break;

            case "exposure":
                double gain = getDoubleParam(params, "gain", 1.0);
                result = adjustExposure(bgr, gain);
                break;

            case "saturation":
                double factor = getDoubleParam(params, "factor", 1.2);
                result = enhanceSaturation(bgr, factor);
                break;

            case "temperature_tint":
                double tempK = getDoubleParam(params, "tempK", 5500.0);
                double tint  = getDoubleParam(params, "tint", 0.0);
                result = applyTemperatureTint(bgr, tempK, tint);
                break;

            case "color_matrix":
                double[] matrix = new double[9];
                for (int i = 0; i < 9; i++) {
                    matrix[i] = getDoubleParam(params, "m" + i, i % 4 == 0 ? 1.0 : 0.0); // Identity default
                }
                result = applyColorMatrix(bgr, matrix);
                break;

            case "color_distribution_alignment":
                // Requires reference image path parameter
                String refImagePath = getStringParam(params, "referenceImagePath", null);
                if (refImagePath == null || refImagePath.isEmpty()) {
                    throw new IllegalArgumentException("Reference image path required for color_distribution_alignment");
                }
                
                Path refPath = Path.of(refImagePath);
                if (!Files.exists(refPath)) {
                    throw new IllegalArgumentException("Reference image not found: " + refImagePath);
                }
                
                // Handle RAW files for reference image
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
                            throw new IllegalArgumentException("Reference RAW file not yet decoded: " + refImagePath);
                        }
                    }
                }
                
                Mat tgtBgr = opencv_imgcodecs.imread(refImageToProcess.toString(), opencv_imgcodecs.IMREAD_COLOR);
                if (tgtBgr == null || tgtBgr.empty()) {
                    throw new IllegalArgumentException("Cannot read reference image: " + refImageToProcess);
                }
                
                double strength = getDoubleParam(params, "strength", 1.0);
                result = applyColorDistributionAlignment(bgr, tgtBgr, strength);
                
                tgtBgr.release();
                break;

            default:
                throw new IllegalArgumentException("Unknown method: " + method);
        }

        return result;
    }
    
    /**
     * Helper to safely extract double parameter from Map<String, Object>.
     */
    private double getDoubleParam(java.util.Map<String, Object> params, String key, double defaultValue) {
        Object value = params.get(key);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        return defaultValue;
    }
    
    /**
     * Helper to safely extract String parameter from Map<String, Object>.
     */
    private String getStringParam(java.util.Map<String, Object> params, String key, String defaultValue) {
        Object value = params.get(key);
        if (value == null) {
            return defaultValue;
        }
        return value.toString();
    }

    /**
     * Apply Color Distribution Alignment for sequential pairwise color correction.
     * Matches source image's LAB color statistics (mean, std) to target image.
     * 
     * @param srcBgr Source image to be corrected (BGR format)
     * @param tgtBgr Target/reference image (BGR format)
     * @param strength Blend factor (0.0-1.0). 1.0 = full correction, 0.0 = no change
     * @return Corrected image (BGR format)
     * 
     * Reference: Dal'Col, L.; Coelho, D.; Madeira, T.; Dias, P.; Oliveira, M. 
     * "A Sequential Color Correction Approach for Texture Mapping of 3D Meshes." 
     * Sensors 2023, 23, 607. https://doi.org/10.3390/s23020607
     */
    public Mat applyColorDistributionAlignment(Mat srcBgr, Mat tgtBgr, double strength) {
        // 1. Convert both images to LAB color space
        Mat srcLab = new Mat();
        Mat tgtLab = new Mat();
        opencv_imgproc.cvtColor(srcBgr, srcLab, opencv_imgproc.COLOR_BGR2Lab);
        opencv_imgproc.cvtColor(tgtBgr, tgtLab, opencv_imgproc.COLOR_BGR2Lab);
        
        // 2. Convert to float for precise calculations
        Mat srcLabFloat = new Mat();
        Mat tgtLabFloat = new Mat();
        srcLab.convertTo(srcLabFloat, opencv_core.CV_32F);
        tgtLab.convertTo(tgtLabFloat, opencv_core.CV_32F);
        
        // 3. Split into LAB channels
        MatVector srcChannels = new MatVector(3);
        MatVector tgtChannels = new MatVector(3);
        opencv_core.split(srcLabFloat, srcChannels);
        opencv_core.split(tgtLabFloat, tgtChannels);
        
        // 4. Compute mean and std for each channel
        Mat srcMean = new Mat();
        Mat srcStd = new Mat();
        Mat tgtMean = new Mat();
        Mat tgtStd = new Mat();
        
        opencv_core.meanStdDev(srcLabFloat, srcMean, srcStd);
        opencv_core.meanStdDev(tgtLabFloat, tgtMean, tgtStd);
        
        // 5. Apply statistical transformation to each channel
        MatVector correctedChannels = new MatVector(3);
        for (int i = 0; i < 3; i++) {
            Mat srcChannel = srcChannels.get(i).clone();
            
            // Get statistics using indexer (JavaCV way)
            org.bytedeco.javacpp.indexer.DoubleIndexer srcMeanIdx = srcMean.createIndexer();
            org.bytedeco.javacpp.indexer.DoubleIndexer srcStdIdx = srcStd.createIndexer();
            org.bytedeco.javacpp.indexer.DoubleIndexer tgtMeanIdx = tgtMean.createIndexer();
            org.bytedeco.javacpp.indexer.DoubleIndexer tgtStdIdx = tgtStd.createIndexer();
            
            double srcMeanVal = srcMeanIdx.get(i, 0);
            double srcStdVal = srcStdIdx.get(i, 0);
            double tgtMeanVal = tgtMeanIdx.get(i, 0);
            double tgtStdVal = tgtStdIdx.get(i, 0);
            
            srcMeanIdx.close();
            srcStdIdx.close();
            tgtMeanIdx.close();
            tgtStdIdx.close();
            
            // Avoid division by zero
            double scale = srcStdVal < 1e-8 ? 1.0 : (tgtStdVal / srcStdVal);
            
            // Apply transformation: (pixel - src_mean) * scale + tgt_mean
            // Using convertTo with alpha and beta: dst = src * alpha + beta
            // First: subtract mean by using convertTo with beta = -src_mean
            Mat centered = new Mat();
            srcChannel.convertTo(centered, -1, 1.0, -srcMeanVal);
            
            // Then: scale and add target mean
            Mat adjusted = new Mat();
            centered.convertTo(adjusted, -1, scale, tgtMeanVal);
            
            correctedChannels.put(i, adjusted);
            
            // Cleanup
            srcChannel.release();
            centered.release();
        }
        
        // 6. Merge corrected channels
        Mat correctedLabFloat = new Mat();
        opencv_core.merge(correctedChannels, correctedLabFloat);
        
        // 7. Convert back to 8-bit LAB
        Mat correctedLab = new Mat();
        correctedLabFloat.convertTo(correctedLab, opencv_core.CV_8U);
        
        // 8. Convert back to BGR
        Mat correctedBgr = new Mat();
        opencv_imgproc.cvtColor(correctedLab, correctedBgr, opencv_imgproc.COLOR_Lab2BGR);
        
        // 9. Apply strength blending: result = (1-s)*original + s*corrected
        Mat result = new Mat();
        if (Math.abs(strength - 1.0) < 1e-6) {
            // Full strength, no blending needed
            correctedBgr.copyTo(result);
        } else {
            Mat srcBgrFloat = new Mat();
            Mat correctedBgrFloat = new Mat();
            srcBgr.convertTo(srcBgrFloat, opencv_core.CV_32F);
            correctedBgr.convertTo(correctedBgrFloat, opencv_core.CV_32F);
            
            // Weighted blend
            Mat blendedFloat = new Mat();
            opencv_core.addWeighted(
                srcBgrFloat, 1.0 - strength,
                correctedBgrFloat, strength,
                0.0, blendedFloat
            );
            
            // Convert back to 8-bit
            blendedFloat.convertTo(result, opencv_core.CV_8U);
            
            srcBgrFloat.release();
            correctedBgrFloat.release();
            blendedFloat.release();
        }
        
        // 10. Cleanup
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

    /**
     * Compute Minkowski p-norm of a single-channel matrix.
     */
    private double computeMinkowskiNorm(Mat channel, double p) {
        Mat channelFloat = new Mat();
        channel.convertTo(channelFloat, opencv_core.CV_32F);

        // Compute |pixel|^p
        Mat powered = new Mat();
        opencv_core.pow(channelFloat, p, powered);

        // Sum all values
        Scalar sum = opencv_core.sumElems(powered);
        double total = sum.get(0);

        // Take p-th root
        int numPixels = channel.rows() * channel.cols();
        double norm = Math.pow(total / numPixels, 1.0 / p);

        channelFloat.release();
        powered.release();

        return norm;
    }
}
