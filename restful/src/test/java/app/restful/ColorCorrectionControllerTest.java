package app.restful;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgcodecs;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.Scalar;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import app.restful.dto.ColorCorrectionMethod;
import app.restful.dto.ColorCorrectionRequest;
import app.restful.dto.ColorCorrectionResult;

/**
 * Integration tests for ColorCorrectionController REST API endpoints.
 * 
 * Tests:
 * - GET /color-correct/methods - List available correction methods
 * - POST /color-correct/preview - Generate Base64 preview
 * - POST /color-correct/apply - Save corrected image to workspace
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public class ColorCorrectionControllerTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @TempDir
    static Path tempDir;

    private static Path testImagePath;
    private static Path targetImagePath;

    @BeforeAll
    static void setupTestImages() throws Exception {
        // Create test images
        Mat testImage = new Mat(100, 100, opencv_core.CV_8UC3, new Scalar(128.0, 128.0, 128.0, 0.0));
        Mat targetImage = new Mat(100, 100, opencv_core.CV_8UC3, new Scalar(150.0, 150.0, 150.0, 0.0));
        
        testImagePath = tempDir.resolve("test_image.jpg");
        targetImagePath = tempDir.resolve("target_image.jpg");
        
        opencv_imgcodecs.imwrite(testImagePath.toString(), testImage);
        opencv_imgcodecs.imwrite(targetImagePath.toString(), targetImage);
        
        testImage.release();
        targetImage.release();
    }

    // ========================================
    // GET /color-correct/methods
    // ========================================

    @Test
    void testGetMethods_ReturnsAllMethods() {
        ResponseEntity<ColorCorrectionMethod[]> response = restTemplate.getForEntity(
            "/color-correct/methods",
            ColorCorrectionMethod[].class
        );

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        
        ColorCorrectionMethod[] methods = response.getBody();
        assertTrue(methods.length >= 7); // At least 7 methods (now 8 with Color Distribution Alignment)
    }

    @Test
    void testGetMethods_ContainsGrayWorld() {
        ResponseEntity<ColorCorrectionMethod[]> response = restTemplate.getForEntity(
            "/color-correct/methods",
            ColorCorrectionMethod[].class
        );

        ColorCorrectionMethod[] methods = response.getBody();
        boolean hasGrayWorld = false;
        
        for (ColorCorrectionMethod method : methods) {
            if ("gray_world".equals(method.id())) {
                hasGrayWorld = true;
                assertEquals("Gray World", method.name());
                assertTrue(method.description().contains("average"));
                break;
            }
        }
        
        assertTrue(hasGrayWorld, "Methods should contain gray_world");
    }

    @Test
    void testGetMethods_ContainsColorDistributionAlignment() {
        ResponseEntity<ColorCorrectionMethod[]> response = restTemplate.getForEntity(
            "/color-correct/methods",
            ColorCorrectionMethod[].class
        );

        ColorCorrectionMethod[] methods = response.getBody();
        boolean hasAlignment = false;
        
        for (ColorCorrectionMethod method : methods) {
            if ("color_distribution_alignment".equals(method.id())) {
                hasAlignment = true;
                assertEquals("Color Distribution Alignment", method.name());
                assertTrue(method.description().contains("reference"));
                
                // Check parameters
                List<ColorCorrectionMethod.Parameter> params = method.parameters();
                assertTrue(params.size() >= 2); // referenceImagePath + strength
                
                boolean hasRefPath = params.stream().anyMatch(p -> "referenceImagePath".equals(p.name()));
                boolean hasStrength = params.stream().anyMatch(p -> "strength".equals(p.name()));
                
                assertTrue(hasRefPath, "Should have referenceImagePath parameter");
                assertTrue(hasStrength, "Should have strength parameter");
                break;
            }
        }
        
        assertTrue(hasAlignment, "Methods should contain color_distribution_alignment");
    }

    @Test
    void testGetMethods_ParameterDefinitions() {
        ResponseEntity<ColorCorrectionMethod[]> response = restTemplate.getForEntity(
            "/color-correct/methods",
            ColorCorrectionMethod[].class
        );

        ColorCorrectionMethod[] methods = response.getBody();
        
        // Find Shades of Gray method
        for (ColorCorrectionMethod method : methods) {
            if ("shades_of_gray".equals(method.id())) {
                List<ColorCorrectionMethod.Parameter> params = method.parameters();
                assertEquals(1, params.size());
                
                ColorCorrectionMethod.Parameter pParam = params.get(0);
                assertEquals("p", pParam.name());
                assertEquals("Minkowski p-norm", pParam.label());
                assertEquals(6.0, pParam.defaultValue());
                assertEquals(1.0, pParam.min());
                assertEquals(12.0, pParam.max());
                break;
            }
        }
    }

    // ========================================
    // POST /color-correct/preview
    // ========================================

    @Test
    void testPreview_GrayWorld_Success() {
        Map<String, Object> params = new HashMap<>();
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "gray_world",
            params,
            testImagePath.toString(),
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/preview",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        
        ColorCorrectionResult result = response.getBody();
        assertTrue(result.success());
        assertNotNull(result.base64Image());
        assertTrue(result.base64Image().startsWith("data:image/jpeg;base64,"));
        assertTrue(result.base64Image().length() > 100);
    }

    @Test
    void testPreview_WithParameters() {
        Map<String, Object> params = new HashMap<>();
        params.put("p", 6.0);
        
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "shades_of_gray",
            params,
            testImagePath.toString(),
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/preview",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().success());
        assertNotNull(response.getBody().base64Image());
    }

    @Test
    void testPreview_InvalidMethod() {
        Map<String, Object> params = new HashMap<>();
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "invalid_method_name",
            params,
            testImagePath.toString(),
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/preview",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertFalse(response.getBody().success());
    }

    @Test
    void testPreview_InvalidPath() {
        Map<String, Object> params = new HashMap<>();
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "gray_world",
            params,
            "/nonexistent/path/image.jpg"
,
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/preview",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertFalse(response.getBody().success());
        assertTrue(response.getBody().message().contains("not found"));
    }

    @Test
    void testPreview_ExposureAdjustment() {
        Map<String, Object> params = new HashMap<>();
        params.put("gain", 1.5);
        
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "exposure",
            params,
            testImagePath.toString(),
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/preview",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().success());
    }

    @Test
    void testPreview_SaturationEnhancement() {
        Map<String, Object> params = new HashMap<>();
        params.put("factor", 1.5);
        
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "saturation",
            params,
            testImagePath.toString(),
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/preview",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().success());
    }

    // ========================================
    // POST /color-correct/apply
    // ========================================

    @Test
    void testApply_GrayWorld_Success() {
        Map<String, Object> params = new HashMap<>();
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "gray_world",
            params,
            testImagePath.toString(),
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/apply",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        
        ColorCorrectionResult result = response.getBody();
        assertTrue(result.success());
        assertNotNull(result.outputPath());
        assertTrue(result.outputPath().contains("gray_world"));
        
        // Verify file was created
        assertTrue(Files.exists(Path.of(result.outputPath())));
    }

    @Test
    void testApply_InvalidPath() {
        Map<String, Object> params = new HashMap<>();
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "gray_world",
            params,
            "/nonexistent/image.jpg"
,
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/apply",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertFalse(response.getBody().success());
    }

    @Test
    void testApply_ColorMatrix() {
        Map<String, Object> params = new HashMap<>();
        // Identity matrix (no change)
        for (int i = 0; i < 9; i++) {
            params.put("m" + i, i % 4 == 0 ? 1.0 : 0.0);
        }
        
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "color_matrix",
            params,
            testImagePath.toString(),
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/apply",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().success());
        assertNotNull(response.getBody().outputPath());
    }

    // ========================================
    // COLOR DISTRIBUTION ALIGNMENT TESTS (NEW)
    // ========================================

    @Test
    void testPreview_ColorDistributionAlignment_Success() {
        Map<String, Object> params = new HashMap<>();
        params.put("referenceImagePath", targetImagePath.toString());
        params.put("strength", 1.0);
        
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "color_distribution_alignment",
            params,
            testImagePath.toString(),
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/preview",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().success());
        assertNotNull(response.getBody().base64Image());
        assertTrue(response.getBody().base64Image().startsWith("data:image/jpeg;base64,"));
    }

    @Test
    void testPreview_ColorDistributionAlignment_Strength0() {
        Map<String, Object> params = new HashMap<>();
        params.put("referenceImagePath", targetImagePath.toString());
        params.put("strength", 0.0); // No correction
        
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "color_distribution_alignment",
            params,
            testImagePath.toString(),
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/preview",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().success());
    }

    @Test
    void testPreview_ColorDistributionAlignment_Strength05() {
        Map<String, Object> params = new HashMap<>();
        params.put("referenceImagePath", targetImagePath.toString());
        params.put("strength", 0.5); // Blended correction
        
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "color_distribution_alignment",
            params,
            testImagePath.toString(),
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/preview",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().success());
    }

    @Test
    void testPreview_ColorDistributionAlignment_MissingReferenceImage() {
        Map<String, Object> params = new HashMap<>();
        params.put("strength", 1.0);
        // No referenceImagePath provided
        
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "color_distribution_alignment",
            params,
            testImagePath.toString(),
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/preview",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertFalse(response.getBody().success());
        assertTrue(response.getBody().message().toLowerCase().contains("reference"));
    }

    @Test
    void testPreview_ColorDistributionAlignment_ReferenceNotFound() {
        Map<String, Object> params = new HashMap<>();
        params.put("referenceImagePath", "/nonexistent/reference.jpg");
        params.put("strength", 1.0);
        
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "color_distribution_alignment",
            params,
            testImagePath.toString(),
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/preview",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertFalse(response.getBody().success());
        assertTrue(response.getBody().message().toLowerCase().contains("not found"));
    }

    @Test
    void testApply_ColorDistributionAlignment_Success() {
        Map<String, Object> params = new HashMap<>();
        params.put("referenceImagePath", targetImagePath.toString());
        params.put("strength", 0.8);
        
        ColorCorrectionRequest request = new ColorCorrectionRequest(
            "color_distribution_alignment",
            params,
            testImagePath.toString(),
            null
        );

        ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
            "/color-correct/apply",
            request,
            ColorCorrectionResult.class
        );

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().success());
        assertNotNull(response.getBody().outputPath());
        assertTrue(response.getBody().outputPath().contains("color_distribution_alignment"));
        
        // Verify file was created
        assertTrue(Files.exists(Path.of(response.getBody().outputPath())));
    }

    // ========================================
    // EDGE CASES AND ERROR HANDLING
    // ========================================

    @Test
    void testPreview_AllMethods() {
        // Test that all methods can be called without errors
        ResponseEntity<ColorCorrectionMethod[]> methodsResponse = restTemplate.getForEntity(
            "/color-correct/methods",
            ColorCorrectionMethod[].class
        );

        ColorCorrectionMethod[] methods = methodsResponse.getBody();
        
        for (ColorCorrectionMethod method : methods) {
            Map<String, Object> params = new HashMap<>();
            
            // Set default parameters
            for (ColorCorrectionMethod.Parameter param : method.parameters()) {
                if ("referenceImagePath".equals(param.name())) {
                    params.put(param.name(), targetImagePath.toString());
                } else {
                    params.put(param.name(), param.defaultValue());
                }
            }
            
            ColorCorrectionRequest request = new ColorCorrectionRequest(
                method.id(),
                params,
                testImagePath.toString(),
                null
            );

            ResponseEntity<ColorCorrectionResult> response = restTemplate.postForEntity(
                "/color-correct/preview",
                request,
                ColorCorrectionResult.class
            );

            assertEquals(HttpStatus.OK, response.getStatusCode(), 
                "Method " + method.id() + " should succeed");
            assertTrue(response.getBody().success(), 
                "Method " + method.id() + " should return success");
        }
    }
}
