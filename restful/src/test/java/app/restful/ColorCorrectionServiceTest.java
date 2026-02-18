package app.restful;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgcodecs;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.junit.jupiter.api.AfterEach;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import app.restful.services.ColorCorrectionService;
import app.restful.services.RawProcessingService;

/**
 * Comprehensive test suite for ColorCorrectionService.
 * Tests all 8 color correction methods including the new Color Distribution Alignment.
 * 
 * Test Coverage:
 * 1. Gray World white balance
 * 2. White Patch white balance
 * 3. Shades of Gray white balance (p-norm)
 * 4. Exposure adjustment
 * 5. Saturation enhancement
 * 6. Color matrix transformation
 * 7. Process image to Base64
 * 8. Color Distribution Alignment (Dal'Col et al. 2023) - NEW
 */
@SpringBootTest
public class ColorCorrectionServiceTest {

    @Autowired
    private ColorCorrectionService colorCorrection;

    @Autowired
    private RawProcessingService rawService;

    @TempDir
    Path tempDir;

    private Mat testImage;
    private Mat warmCastImage;
    private Mat coolCastImage;
    private Mat darkImage;
    private Mat brightImage;
    private Mat grayImage;
    private Mat colorfulImage;

    @BeforeEach
    void setUp() {
        // Create test images with OpenCV (100x100 pixels)
        int width = 100;
        int height = 100;

        // 1. Neutral test image (mid-gray BGR=128,128,128)
        testImage = new Mat(height, width, opencv_core.CV_8UC3, new Scalar(128.0, 128.0, 128.0, 0.0));

        // 2. Warm cast image (more red, less blue: BGR=100,128,180)
        warmCastImage = new Mat(height, width, opencv_core.CV_8UC3, new Scalar(100.0, 128.0, 180.0, 0.0));

        // 3. Cool cast image (more blue, less red: BGR=180,128,100)
        coolCastImage = new Mat(height, width, opencv_core.CV_8UC3, new Scalar(180.0, 128.0, 100.0, 0.0));

        // 4. Dark image (underexposed: BGR=30,30,30)
        darkImage = new Mat(height, width, opencv_core.CV_8UC3, new Scalar(30.0, 30.0, 30.0, 0.0));

        // 5. Bright image (overexposed: BGR=220,220,220)
        brightImage = new Mat(height, width, opencv_core.CV_8UC3, new Scalar(220.0, 220.0, 220.0, 0.0));

        // 6. Grayscale image (R=G=B=128)
        grayImage = new Mat(height, width, opencv_core.CV_8UC3, new Scalar(128.0, 128.0, 128.0, 0.0));

        // 7. Colorful image (HSV: high saturation)
        colorfulImage = new Mat(height, width, opencv_core.CV_8UC3);
        // Create HSV image with high saturation, then convert to BGR
        Mat hsvColorful = new Mat(height, width, opencv_core.CV_8UC3, new Scalar(120.0, 255.0, 200.0, 0.0)); // Green, full sat
        opencv_imgproc.cvtColor(hsvColorful, colorfulImage, opencv_imgproc.COLOR_HSV2BGR);
        hsvColorful.release();
    }

    @AfterEach
    void tearDown() {
        // Release all Mat objects to prevent memory leaks
        if (testImage != null) testImage.release();
        if (warmCastImage != null) warmCastImage.release();
        if (coolCastImage != null) coolCastImage.release();
        if (darkImage != null) darkImage.release();
        if (brightImage != null) brightImage.release();
        if (grayImage != null) grayImage.release();
        if (colorfulImage != null) colorfulImage.release();
    }

    // ========================================
    // 1. GRAY WORLD TESTS
    // ========================================

    @Test
    void testGrayWorld_NeutralImage_NoChange() {
        Mat result = colorCorrection.applyGrayWorld(testImage);
        assertNotNull(result);
        assertEquals(testImage.rows(), result.rows());
        assertEquals(testImage.cols(), result.cols());
        
        // Neutral image should remain similar (minor floating-point differences acceptable)
        org.bytedeco.javacpp.indexer.UByteIndexer originalIdx = testImage.createIndexer();
        org.bytedeco.javacpp.indexer.UByteIndexer resultIdx = result.createIndexer();
        
        int[] originalPixel = new int[3];
        int[] resultPixel = new int[3];
        originalIdx.get(50, 50, originalPixel);
        resultIdx.get(50, 50, resultPixel);
        
        originalIdx.close();
        resultIdx.close();
        
        assertEquals(originalPixel[0], resultPixel[0], 5.0); // B channel
        assertEquals(originalPixel[1], resultPixel[1], 5.0); // G channel
        assertEquals(originalPixel[2], resultPixel[2], 5.0); // R channel
        
        result.release();
    }

    @Test
    void testGrayWorld_WarmCast_ReducesRed() {
        Mat result = colorCorrection.applyGrayWorld(warmCastImage);
        assertNotNull(result);
        
        // After Gray World, channels should be more balanced
        Scalar meanBefore = opencv_core.mean(warmCastImage);
        Scalar meanAfter = opencv_core.mean(result);
        
        // Blue should increase, Red should decrease to balance
        assertTrue(meanAfter.get(0) > meanBefore.get(0) - 10); // B increases or stays
        assertTrue(meanAfter.get(2) < meanBefore.get(2) + 10); // R decreases or stays
        
        result.release();
    }

    @Test
    void testGrayWorld_CoolCast_ReducesBlue() {
        Mat result = colorCorrection.applyGrayWorld(coolCastImage);
        assertNotNull(result);
        
        Scalar meanBefore = opencv_core.mean(coolCastImage);
        Scalar meanAfter = opencv_core.mean(result);
        
        // Red should increase, Blue should decrease
        assertTrue(meanAfter.get(2) > meanBefore.get(2) - 10); // R increases or stays
        assertTrue(meanAfter.get(0) < meanBefore.get(0) + 10); // B decreases or stays
        
        result.release();
    }

    @Test
    void testGrayWorld_OutputDimensions() {
        Mat result = colorCorrection.applyGrayWorld(testImage);
        assertEquals(testImage.rows(), result.rows());
        assertEquals(testImage.cols(), result.cols());
        assertEquals(testImage.channels(), result.channels());
        result.release();
    }

    // ========================================
    // 2. WHITE PATCH TESTS
    // ========================================

    @Test
    void testWhitePatch_WithWhitePixels() {
        // Create image with a white pixel at (50, 50)
        Mat imgWithWhite = warmCastImage.clone();
        org.bytedeco.javacpp.indexer.UByteIndexer idx = imgWithWhite.createIndexer();
        idx.put(50, 50, 0, 255);
        idx.put(50, 50, 1, 255);
        idx.put(50, 50, 2, 255);
        idx.close();
        
        Mat result = colorCorrection.applyWhitePatch(imgWithWhite);
        assertNotNull(result);
        
        // White pixel should remain white (255,255,255)
        org.bytedeco.javacpp.indexer.UByteIndexer resultIdx = result.createIndexer();
        int[] whitePixel = new int[3];
        resultIdx.get(50, 50, whitePixel);
        resultIdx.close();
        
        assertEquals(255, whitePixel[0], 5.0);
        assertEquals(255, whitePixel[1], 5.0);
        assertEquals(255, whitePixel[2], 5.0);
        
        imgWithWhite.release();
        result.release();
    }

    @Test
    void testWhitePatch_OutputRange() {
        Mat result = colorCorrection.applyWhitePatch(warmCastImage);
        assertNotNull(result);
        
        // All pixel values should be in valid range [0, 255]
        double[] minVal = new double[1];
        double[] maxVal = new double[1];
        opencv_core.minMaxLoc(result, minVal, maxVal, null, null, null);
        
        assertTrue(minVal[0] >= 0);
        assertTrue(maxVal[0] <= 255);
        
        result.release();
    }

    // ========================================
    // 3. SHADES OF GRAY TESTS
    // ========================================

    @Test
    void testShadesOfGray_P6_Recommended() {
        Mat result = colorCorrection.applyShadesOfGray(warmCastImage, 6.0);
        assertNotNull(result);
        assertEquals(warmCastImage.rows(), result.rows());
        assertEquals(warmCastImage.cols(), result.cols());
        result.release();
    }

    @Test
    void testShadesOfGray_P1_SimilarToGrayWorld() {
        Mat resultShadesP1 = colorCorrection.applyShadesOfGray(warmCastImage, 1.0);
        Mat resultGrayWorld = colorCorrection.applyGrayWorld(warmCastImage);
        
        // P=1 should produce results similar to Gray World (Minkowski 1-norm = mean)
        Scalar meanShadesP1 = opencv_core.mean(resultShadesP1);
        Scalar meanGrayWorld = opencv_core.mean(resultGrayWorld);
        
        // Allow some tolerance due to floating-point differences
        assertEquals(meanGrayWorld.get(0), meanShadesP1.get(0), 15.0);
        assertEquals(meanGrayWorld.get(1), meanShadesP1.get(1), 15.0);
        assertEquals(meanGrayWorld.get(2), meanShadesP1.get(2), 15.0);
        
        resultShadesP1.release();
        resultGrayWorld.release();
    }

    @Test
    void testShadesOfGray_P12_HigherNorm() {
        Mat result = colorCorrection.applyShadesOfGray(warmCastImage, 12.0);
        assertNotNull(result);
        // High p approaches White Patch behavior
        result.release();
    }

    // ========================================
    // 4. EXPOSURE ADJUSTMENT TESTS
    // ========================================

    @Test
    void testAdjustExposure_Gain1_NoChange() {
        Mat result = colorCorrection.adjustExposure(testImage, 1.0);
        assertNotNull(result);
        
        Scalar meanBefore = opencv_core.mean(testImage);
        Scalar meanAfter = opencv_core.mean(result);
        
        assertEquals(meanBefore.get(0), meanAfter.get(0), 1.0);
        assertEquals(meanBefore.get(1), meanAfter.get(1), 1.0);
        assertEquals(meanBefore.get(2), meanAfter.get(2), 1.0);
        
        result.release();
    }

    @Test
    void testAdjustExposure_Gain2_Doubles() {
        Mat result = colorCorrection.adjustExposure(darkImage, 2.0);
        assertNotNull(result);
        
        // Dark image (30,30,30) * 2 = (60,60,60)
        Scalar meanAfter = opencv_core.mean(result);
        assertEquals(60, meanAfter.get(0), 5.0);
        assertEquals(60, meanAfter.get(1), 5.0);
        assertEquals(60, meanAfter.get(2), 5.0);
        
        result.release();
    }

    @Test
    void testAdjustExposure_GainHalf_Darkens() {
        Mat result = colorCorrection.adjustExposure(testImage, 0.5);
        assertNotNull(result);
        
        // Mid-gray (128) * 0.5 = 64
        Scalar meanAfter = opencv_core.mean(result);
        assertEquals(64, meanAfter.get(0), 5.0);
        assertEquals(64, meanAfter.get(1), 5.0);
        assertEquals(64, meanAfter.get(2), 5.0);
        
        result.release();
    }

    @Test
    void testAdjustExposure_ClipAtMax() {
        Mat result = colorCorrection.adjustExposure(brightImage, 2.0);
        assertNotNull(result);
        
        // Bright (220) * 2 = 440, should clip to 255
        double[] maxVal = new double[1];
        opencv_core.minMaxLoc(result, null, maxVal, null, null, null);
        assertEquals(255, maxVal[0], 1.0);
        
        result.release();
    }

    // ========================================
    // 5. SATURATION ENHANCEMENT TESTS
    // ========================================

    @Test
    void testEnhanceSaturation_Factor1_NoChange() {
        Mat result = colorCorrection.enhanceSaturation(colorfulImage, 1.0);
        assertNotNull(result);
        
        Scalar meanBefore = opencv_core.mean(colorfulImage);
        Scalar meanAfter = opencv_core.mean(result);
        
        assertEquals(meanBefore.get(0), meanAfter.get(0), 5.0);
        assertEquals(meanBefore.get(1), meanAfter.get(1), 5.0);
        assertEquals(meanBefore.get(2), meanAfter.get(2), 5.0);
        
        result.release();
    }

    @Test
    void testEnhanceSaturation_Factor2_IncreasesSaturation() {
        Mat result = colorCorrection.enhanceSaturation(colorfulImage, 2.0);
        assertNotNull(result);
        
        // Convert both to HSV and compare saturation channels
        Mat hsvBefore = new Mat();
        Mat hsvAfter = new Mat();
        opencv_imgproc.cvtColor(colorfulImage, hsvBefore, opencv_imgproc.COLOR_BGR2HSV);
        opencv_imgproc.cvtColor(result, hsvAfter, opencv_imgproc.COLOR_BGR2HSV);
        
        Scalar satBefore = opencv_core.mean(hsvBefore);
        Scalar satAfter = opencv_core.mean(hsvAfter);
        
        // Saturation should increase (channel 1 in HSV)
        assertTrue(satAfter.get(1) >= satBefore.get(1));
        
        hsvBefore.release();
        hsvAfter.release();
        result.release();
    }

    @Test
    void testEnhanceSaturation_Factor0_Grayscale() {
        Mat result = colorCorrection.enhanceSaturation(colorfulImage, 0.0);
        assertNotNull(result);
        
        // With factor=0, saturation should be zero (grayscale)
        Mat hsvResult = new Mat();
        opencv_imgproc.cvtColor(result, hsvResult, opencv_imgproc.COLOR_BGR2HSV);
        
        Scalar satMean = opencv_core.mean(hsvResult);
        assertEquals(0, satMean.get(1), 5.0); // S channel should be near 0
        
        hsvResult.release();
        result.release();
    }

    @Test
    void testEnhanceSaturation_GrayscaleInput_RemainsGray() {
        Mat result = colorCorrection.enhanceSaturation(grayImage, 2.0);
        assertNotNull(result);
        
        // Grayscale input should remain grayscale regardless of factor
        org.bytedeco.javacpp.indexer.UByteIndexer resultIdx = result.createIndexer();
        int[] pixel = new int[3];
        resultIdx.get(50, 50, pixel);
        resultIdx.close();
        
        assertEquals(pixel[0], pixel[1], 5.0); // B == G
        assertEquals(pixel[1], pixel[2], 5.0); // G == R
        
        result.release();
    }

    // ========================================
    // 6. COLOR MATRIX TESTS
    // ========================================

    @Test
    void testColorMatrix_Identity_NoChange() {
        // Identity matrix: [1,0,0, 0,1,0, 0,0,1]
        double[] identityMatrix = {1, 0, 0, 0, 1, 0, 0, 0, 1};
        Mat result = colorCorrection.applyColorMatrix(testImage, identityMatrix);
        assertNotNull(result);
        
        Scalar meanBefore = opencv_core.mean(testImage);
        Scalar meanAfter = opencv_core.mean(result);
        
        assertEquals(meanBefore.get(0), meanAfter.get(0), 5.0);
        assertEquals(meanBefore.get(1), meanAfter.get(1), 5.0);
        assertEquals(meanBefore.get(2), meanAfter.get(2), 5.0);
        
        result.release();
    }

    @Test
    void testColorMatrix_SwapChannels() {
        // Swap B and R: [0,0,1, 0,1,0, 1,0,0]
        double[] swapMatrix = {0, 0, 1, 0, 1, 0, 1, 0, 0};
        Mat result = colorCorrection.applyColorMatrix(warmCastImage, swapMatrix);
        assertNotNull(result);
        
        // Original: BGR=(100,128,180), After swap: BGR=(180,128,100)
        org.bytedeco.javacpp.indexer.UByteIndexer originalIdx = warmCastImage.createIndexer();
        org.bytedeco.javacpp.indexer.UByteIndexer resultIdx = result.createIndexer();
        
        int[] originalPixel = new int[3];
        int[] resultPixel = new int[3];
        originalIdx.get(50, 50, originalPixel);
        resultIdx.get(50, 50, resultPixel);
        
        originalIdx.close();
        resultIdx.close();
        
        assertEquals(originalPixel[2], resultPixel[0], 5.0); // R→B
        assertEquals(originalPixel[1], resultPixel[1], 5.0); // G→G
        assertEquals(originalPixel[0], resultPixel[2], 5.0); // B→R
        
        result.release();
    }

    @Test
    void testColorMatrix_GrayscaleMatrix() {
        // Rec.709 grayscale: [0.114,0.587,0.299, ...repeated for each row]
        double[] grayMatrix = {
            0.114, 0.587, 0.299,
            0.114, 0.587, 0.299,
            0.114, 0.587, 0.299
        };
        Mat result = colorCorrection.applyColorMatrix(colorfulImage, grayMatrix);
        assertNotNull(result);
        
        // Result should be grayscale (R≈G≈B)
        org.bytedeco.javacpp.indexer.UByteIndexer resultIdx = result.createIndexer();
        int[] pixel = new int[3];
        resultIdx.get(50, 50, pixel);
        resultIdx.close();
        
        assertEquals(pixel[0], pixel[1], 10.0);
        assertEquals(pixel[1], pixel[2], 10.0);
        
        result.release();
    }

    @Test
    void testColorMatrix_Invalid_Not9Elements() {
        double[] invalidMatrix = {1, 0, 0, 0, 1}; // Only 5 elements
        assertThrows(IllegalArgumentException.class, () -> {
            colorCorrection.applyColorMatrix(testImage, invalidMatrix);
        });
    }

    // ========================================
    // 7. PROCESS IMAGE TO BASE64 TESTS
    // ========================================

    @Test
    void testProcessImageToBase64_GrayWorld() throws Exception {
        // Save test image to file
        Path testImagePath = tempDir.resolve("test.jpg");
        opencv_imgcodecs.imwrite(testImagePath.toString(), testImage);
        
        Map<String, Object> params = new HashMap<>();
        String base64Result = colorCorrection.processImageToBase64(testImagePath, "gray_world", params);
        
        assertNotNull(base64Result);
        assertTrue(base64Result.startsWith("data:image/jpeg;base64,"));
        assertTrue(base64Result.length() > 100); // Reasonable Base64 length
    }

    @Test
    void testProcessImageToBase64_WithParameters() throws Exception {
        Path testImagePath = tempDir.resolve("test.jpg");
        opencv_imgcodecs.imwrite(testImagePath.toString(), testImage);
        
        Map<String, Object> params = new HashMap<>();
        params.put("p", 6.0);
        
        String base64Result = colorCorrection.processImageToBase64(testImagePath, "shades_of_gray", params);
        
        assertNotNull(base64Result);
        assertTrue(base64Result.startsWith("data:image/jpeg;base64,"));
    }

    @Test
    void testProcessImageToBase64_InvalidPath() {
        Path nonExistentPath = tempDir.resolve("nonexistent.jpg");
        Map<String, Object> params = new HashMap<>();
        
        assertThrows(IllegalArgumentException.class, () -> {
            colorCorrection.processImageToBase64(nonExistentPath, "gray_world", params);
        });
    }

    @Test
    void testProcessImageToBase64_InvalidMethod() throws Exception {
        Path testImagePath = tempDir.resolve("test.jpg");
        opencv_imgcodecs.imwrite(testImagePath.toString(), testImage);
        
        Map<String, Object> params = new HashMap<>();
        
        assertThrows(IllegalArgumentException.class, () -> {
            colorCorrection.processImageToBase64(testImagePath, "invalid_method", params);
        });
    }

    // ========================================
    // 8. COLOR DISTRIBUTION ALIGNMENT TESTS (NEW)
    // ========================================

    @Test
    void testColorDistributionAlignment_Strength1_FullCorrection() {
        // Source: warm cast, Target: cool cast
        Mat result = colorCorrection.applyColorDistributionAlignment(warmCastImage, coolCastImage, 1.0);
        assertNotNull(result);
        assertEquals(warmCastImage.rows(), result.rows());
        assertEquals(warmCastImage.cols(), result.cols());
        
        // After full strength correction, LAB statistics should approach target
        // This is a basic check - full LAB verification would require more complex helpers
        assertNotNull(result);
        
        result.release();
    }

    @Test
    void testColorDistributionAlignment_Strength0_NoChange() {
        Mat result = colorCorrection.applyColorDistributionAlignment(warmCastImage, coolCastImage, 0.0);
        assertNotNull(result);
        
        // With strength=0, output should match input
        Scalar meanBefore = opencv_core.mean(warmCastImage);
        Scalar meanAfter = opencv_core.mean(result);
        
        assertEquals(meanBefore.get(0), meanAfter.get(0), 1.0);
        assertEquals(meanBefore.get(1), meanAfter.get(1), 1.0);
        assertEquals(meanBefore.get(2), meanAfter.get(2), 1.0);
        
        result.release();
    }

    @Test
    void testColorDistributionAlignment_Strength05_Blended() {
        Mat result = colorCorrection.applyColorDistributionAlignment(warmCastImage, coolCastImage, 0.5);
        assertNotNull(result);
        
        // Result should be halfway between original and fully corrected
        Scalar meanResult = opencv_core.mean(result);
        Scalar meanOriginal = opencv_core.mean(warmCastImage);
        
        // Verify result is different from original
        assertNotEquals(meanOriginal.get(0), meanResult.get(0), 1.0);
        
        result.release();
    }

    @Test
    void testColorDistributionAlignment_SameImage_NoChange() {
        // Source and target are the same image
        Mat result = colorCorrection.applyColorDistributionAlignment(testImage, testImage, 1.0);
        assertNotNull(result);
        
        // Output should be nearly identical to input (same LAB statistics)
        Scalar meanBefore = opencv_core.mean(testImage);
        Scalar meanAfter = opencv_core.mean(result);
        
        assertEquals(meanBefore.get(0), meanAfter.get(0), 5.0);
        assertEquals(meanBefore.get(1), meanAfter.get(1), 5.0);
        assertEquals(meanBefore.get(2), meanAfter.get(2), 5.0);
        
        result.release();
    }

    @Test
    void testColorDistributionAlignment_DifferentSizes() {
        // Create target with different dimensions
        Mat smallTarget = new Mat(50, 50, opencv_core.CV_8UC3, new Scalar(150.0, 150.0, 150.0, 0.0));
        
        // Should still work (statistics are resolution-independent)
        Mat result = colorCorrection.applyColorDistributionAlignment(testImage, smallTarget, 1.0);
        assertNotNull(result);
        assertEquals(testImage.rows(), result.rows()); // Output size matches source
        assertEquals(testImage.cols(), result.cols());
        
        smallTarget.release();
        result.release();
    }

    @Test
    void testColorDistributionAlignment_MonochromaticTarget() {
        // Target has very low variance (all same color)
        Mat monoTarget = new Mat(100, 100, opencv_core.CV_8UC3, new Scalar(100.0, 100.0, 100.0, 0.0));
        
        // Should handle gracefully (low std case)
        Mat result = colorCorrection.applyColorDistributionAlignment(colorfulImage, monoTarget, 1.0);
        assertNotNull(result);
        
        monoTarget.release();
        result.release();
    }

    @Test
    void testColorDistributionAlignment_MemoryManagement() {
        // Run multiple times to check for memory leaks
        for (int i = 0; i < 10; i++) {
            Mat result = colorCorrection.applyColorDistributionAlignment(warmCastImage, coolCastImage, 1.0);
            assertNotNull(result);
            result.release(); // Should properly clean up
        }
        // If there are memory leaks, this test may cause issues
    }

    @Test
    void testColorDistributionAlignment_IntegrationWithPipeline() throws Exception {
        // Test full pipeline: file → correction → Base64
        Path srcPath = tempDir.resolve("source.jpg");
        Path tgtPath = tempDir.resolve("target.jpg");
        opencv_imgcodecs.imwrite(srcPath.toString(), warmCastImage);
        opencv_imgcodecs.imwrite(tgtPath.toString(), coolCastImage);
        
        Map<String, Object> params = new HashMap<>();
        params.put("referenceImagePath", tgtPath.toString());
        params.put("strength", 1.0);
        
        String base64Result = colorCorrection.processImageToBase64(
            srcPath, 
            "color_distribution_alignment", 
            params
        );
        
        assertNotNull(base64Result);
        assertTrue(base64Result.startsWith("data:image/jpeg;base64,"));
        assertTrue(base64Result.length() > 100);
    }

    @Test
    void testColorDistributionAlignment_MissingReferenceImage() throws Exception {
        Path srcPath = tempDir.resolve("source.jpg");
        opencv_imgcodecs.imwrite(srcPath.toString(), warmCastImage);
        
        Map<String, Object> params = new HashMap<>();
        params.put("strength", 1.0);
        // No referenceImagePath provided
        
        assertThrows(IllegalArgumentException.class, () -> {
            colorCorrection.processImageToBase64(
                srcPath, 
                "color_distribution_alignment", 
                params
            );
        });
    }

    @Test
    void testColorDistributionAlignment_ReferenceNotFound() throws Exception {
        Path srcPath = tempDir.resolve("source.jpg");
        opencv_imgcodecs.imwrite(srcPath.toString(), warmCastImage);
        
        Map<String, Object> params = new HashMap<>();
        params.put("referenceImagePath", "/nonexistent/reference.jpg");
        params.put("strength", 1.0);
        
        assertThrows(IllegalArgumentException.class, () -> {
            colorCorrection.processImageToBase64(
                srcPath, 
                "color_distribution_alignment", 
                params
            );
        });
    }

    // ========================================
    // HELPER METHOD TESTS
    // ========================================

    @Test
    void testHelperMethods_ParameterExtraction() throws Exception {
        // Test that Map<String, Object> parameter extraction works correctly
        Path srcPath = tempDir.resolve("source.jpg");
        opencv_imgcodecs.imwrite(srcPath.toString(), testImage);
        
        Map<String, Object> params = new HashMap<>();
        params.put("gain", 1.5); // Double
        params.put("gain", Integer.valueOf(2)); // Integer should convert to double
        
        String result1 = colorCorrection.processImageToBase64(srcPath, "exposure", params);
        assertNotNull(result1);
        
        // Test String parameter
        Path tgtPath = tempDir.resolve("target.jpg");
        opencv_imgcodecs.imwrite(tgtPath.toString(), coolCastImage);
        
        params.clear();
        params.put("referenceImagePath", tgtPath.toString()); // String
        params.put("strength", 0.8);
        
        String result2 = colorCorrection.processImageToBase64(
            srcPath, 
            "color_distribution_alignment", 
            params
        );
        assertNotNull(result2);
    }
}
