package app.restful;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.AfterAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import com.fasterxml.jackson.databind.ObjectMapper;

import app.restful.dto.ClassifyResponse;
import app.restful.dto.GroupRequest;
import app.restful.dto.GroupResult;
import app.restful.dto.ImageClassifyRequest;
import app.restful.dto.ImageFeatures;
import app.restful.dto.ImageIssue;
import app.restful.dto.UploadResponse;

/**
 * Integration tests for ImageAnalysisController endpoints.
 * Tests the complete workflow: upload -> classify -> group & export.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
public class ImageAnalysisControllerTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    private Path testOutputDir;
    private List<String> uploadedPaths;

    @BeforeAll
    void setupTestData() throws IOException {
        testOutputDir = Files.createTempDirectory("image-analysis-test");
    }

    @AfterAll
    void cleanup() throws Exception {
        if (testOutputDir != null && Files.exists(testOutputDir)) {
            Files.walk(testOutputDir)
                .sorted((a, b) -> b.compareTo(a))
                .forEach(path -> {
                    try { Files.deleteIfExists(path); } catch (Exception ignored) {}
                });
        }
    }

    /**
     * Helper: Creates a test image with specified properties
     */
    private byte[] createTestImage(int width, int height, int brightness) throws IOException {
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int rgb = (brightness << 16) | (brightness << 8) | brightness;
                img.setRGB(x, y, rgb);
            }
        }
        
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(img, "png", baos);
        return baos.toByteArray();
    }

    @Test
    @Order(1)
    @DisplayName("Upload images - should return success with file paths")
    void testUploadImages() throws Exception {
        // Create test images with different characteristics
        byte[] darkImage = createTestImage(100, 100, 50);  // Underexposed
        byte[] brightImage = createTestImage(100, 100, 200); // Overexposed

        ByteArrayResource darkResource = new ByteArrayResource(darkImage) {
            @Override
            public String getFilename() { return "dark_test.png"; }
        };

        ByteArrayResource brightResource = new ByteArrayResource(brightImage) {
            @Override
            public String getFilename() { return "bright_test.png"; }
        };

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("files", darkResource);
        body.add("files", brightResource);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        HttpEntity<MultiValueMap<String, Object>> request = new HttpEntity<>(body, headers);

        ResponseEntity<UploadResponse> response = 
            restTemplate.postForEntity("/images/upload", request, UploadResponse.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().success());
        assertEquals(2, response.getBody().paths().size());
        
        // Store paths for subsequent tests
        uploadedPaths = response.getBody().paths();
        
        // Verify files exist
        uploadedPaths.forEach(path -> assertTrue(Files.exists(Path.of(path))));
    }

    @Test
    @Order(2)
    @DisplayName("Upload with no files - should return 400")
    void testUploadNoFiles() {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        HttpEntity<MultiValueMap<String, Object>> request = new HttpEntity<>(body, headers);

        ResponseEntity<UploadResponse> response = 
            restTemplate.postForEntity("/images/upload", request, UploadResponse.class);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertFalse(response.getBody().success());
    }

    @Test
    @Order(3)
    @DisplayName("Classify images - should analyze and return features + issues")
    void testClassifyImages() {
        assertNotNull(uploadedPaths, "Upload test must run first");
        System.out.println("DEBUG: uploadedPaths = " + uploadedPaths);
        
        // Verify files still exist
        uploadedPaths.forEach(path -> {
            System.out.println("DEBUG: Checking path: " + path);
            System.out.println("DEBUG: File exists? " + Files.exists(Path.of(path)));
        });

        ImageClassifyRequest request = new ImageClassifyRequest(uploadedPaths, false);
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<ImageClassifyRequest> entity = new HttpEntity<>(request, headers);

        ResponseEntity<ClassifyResponse> response = 
            restTemplate.postForEntity("/images/classify", entity, ClassifyResponse.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().success());
        assertEquals(2, response.getBody().results().size());

        // Verify each result has features and issues
        response.getBody().results().forEach(result -> {
            assertNotNull(result.path());
            assertNotNull(result.features());
            assertNotNull(result.issues());
            
            // Verify features are populated
            ImageFeatures features = result.features();
            assertTrue(features.width() > 0);
            assertTrue(features.height() > 0);
        });
    }

    @Test
    @Order(4)
    @DisplayName("Classify with non-existent path - should return 400")
    void testClassifyNonExistentFile() {
        ImageClassifyRequest request = new ImageClassifyRequest(
            List.of("/non/existent/path.png"), false
        );
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<ImageClassifyRequest> entity = new HttpEntity<>(request, headers);

        ResponseEntity<ClassifyResponse> response = 
            restTemplate.postForEntity("/images/classify", entity, ClassifyResponse.class);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertFalse(response.getBody().success());
        assertTrue(response.getBody().message().contains("not found"));
    }

    @Test
    @Order(5)
    @DisplayName("Group and export - should create folders and CSV report")
    void testGroupAndExport() throws Exception {
        assertNotNull(uploadedPaths, "Upload test must run first");

        String outputRoot = testOutputDir.resolve("grouped").toString();
        GroupRequest request = new GroupRequest(uploadedPaths, outputRoot, true, false, "all");
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<GroupRequest> entity = new HttpEntity<>(request, headers);

        ResponseEntity<GroupResult> response = 
            restTemplate.postForEntity("/images/group", entity, GroupResult.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().success());
        assertNotNull(response.getBody().csvPath());
        
        // Verify CSV exists
        Path csvPath = Path.of(response.getBody().csvPath());
        assertTrue(Files.exists(csvPath));
        
        // Verify CSV content
        String csvContent = Files.readString(csvPath);
        assertTrue(csvContent.contains("path,width,height"));
        assertTrue(csvContent.contains("dark_test.png") || csvContent.contains("bright_test.png"));
        
        // Verify folders were created for each issue type
        Path outputPath = Path.of(outputRoot);
        assertTrue(Files.exists(outputPath));
        
        // Verify counts map is populated
        Map<ImageIssue, Integer> counts = response.getBody().counts();
        assertNotNull(counts);
        assertFalse(counts.isEmpty());
    }

    @Test
    @Order(6)
    @DisplayName("Group with invalid output path - should return 400")
    void testGroupInvalidPath() {
        GroupRequest request = new GroupRequest(
            uploadedPaths, 
            "/invalid\0path", // Invalid path with null character
            false, 
            false,
            "all"
        );
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<GroupRequest> entity = new HttpEntity<>(request, headers);

        ResponseEntity<GroupResult> response = 
            restTemplate.postForEntity("/images/group", entity, GroupResult.class);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertFalse(response.getBody().success());
    }

    @Test
    @DisplayName("Classify with skin detection enabled")
    void testClassifyWithSkinDetection() throws Exception {
        // Create test image with skin-like tones
        byte[] skinImage = createTestImage(100, 100, 180);
        
        ByteArrayResource resource = new ByteArrayResource(skinImage) {
            @Override
            public String getFilename() { return "skin_test.png"; }
        };

        MultiValueMap<String, Object> uploadBody = new LinkedMultiValueMap<>();
        uploadBody.add("files", resource);
        HttpHeaders uploadHeaders = new HttpHeaders();
        uploadHeaders.setContentType(MediaType.MULTIPART_FORM_DATA);
        HttpEntity<MultiValueMap<String, Object>> uploadRequest = new HttpEntity<>(uploadBody, uploadHeaders);

        ResponseEntity<UploadResponse> uploadResponse = 
            restTemplate.postForEntity("/images/upload", uploadRequest, UploadResponse.class);
        
        List<String> paths = uploadResponse.getBody().paths();

        // Classify with skin detection
        ImageClassifyRequest classifyRequest = new ImageClassifyRequest(paths, true);
        HttpHeaders classifyHeaders = new HttpHeaders();
        classifyHeaders.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<ImageClassifyRequest> classifyEntity = new HttpEntity<>(classifyRequest, classifyHeaders);

        ResponseEntity<ClassifyResponse> classifyResponse = 
            restTemplate.postForEntity("/images/classify", classifyEntity, ClassifyResponse.class);

        assertEquals(HttpStatus.OK, classifyResponse.getStatusCode());
        assertTrue(classifyResponse.getBody().success());
    }
}
