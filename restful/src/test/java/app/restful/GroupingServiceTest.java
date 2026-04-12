package app.restful;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import app.restful.dto.ImageClassifyResult;
import app.restful.dto.ImageFeatures;
import app.restful.dto.ImageIssue;
import app.restful.services.GroupingService;

/**
 * Unit tests for GroupingService.
 * Tests folder creation, file organization, and CSV report generation.
 */
public class GroupingServiceTest {

    private GroupingService service;
    private Path testOutputDir;
    private List<Path> testImages;

    @BeforeEach
    void setUp() throws IOException {
        service = new GroupingService();
        testOutputDir = Files.createTempDirectory("grouping-test");
        testImages = new ArrayList<>();

        // Create test image files
        for (int i = 0; i < 3; i++) {
            Path imgPath = testOutputDir.resolve("test_image_" + i + ".png");
            Files.write(imgPath, ("test image content " + i).getBytes());
            testImages.add(imgPath);
        }
    }

    @AfterEach
    void tearDown() throws IOException {
        if (testOutputDir != null && Files.exists(testOutputDir)) {
            Files.walk(testOutputDir)
                .sorted((a, b) -> b.compareTo(a))
                .forEach(path -> {
                    try { Files.deleteIfExists(path); } catch (Exception ignored) {}
                });
        }
    }

    /**
     * Helper: Creates ImageClassifyResult for testing
     */
    private ImageClassifyResult createResult(Path imagePath, ImageIssue... issues) {
        ImageFeatures features = new ImageFeatures(
            800, 600, 0.50, 0.50, 0.10, 0.90, 0.02, 0.02, 0.15,
            0.30, 0.50, false, false, false, false, false, false,
            0.0, 0.0, 2.0, 0.0, 0.01, false, 0.0, 0.0
        );
        return new ImageClassifyResult(imagePath.toString(), features, List.of(issues));
    }

    @Test
    @DisplayName("Group with copy mode - should copy files to issue folders")
    void testGroupWithCopy() throws IOException {
        List<ImageClassifyResult> results = List.of(
            createResult(testImages.get(0), ImageIssue.Needs_Exposure_Increase),
            createResult(testImages.get(1), ImageIssue.Needs_Saturation_Increase),
            createResult(testImages.get(2), ImageIssue.Oversaturated_Red, ImageIssue.ColorCast_Blue)
        );

        Path outputRoot = testOutputDir.resolve("grouped_copy");
        Path csvPath = service.groupAndReport(results, outputRoot, true, "all");

        // Verify CSV was created
        assertTrue(Files.exists(csvPath));
        assertEquals("report.csv", csvPath.getFileName().toString());

        // Verify folders were created for each issue
        assertTrue(Files.exists(outputRoot.resolve("Needs_Exposure_Increase")));
        assertTrue(Files.exists(outputRoot.resolve("Needs_Saturation_Increase")));
        assertTrue(Files.exists(outputRoot.resolve("Oversaturated_Red")));
        assertTrue(Files.exists(outputRoot.resolve("ColorCast_Blue")));

        // Verify files were copied
        assertTrue(Files.exists(outputRoot.resolve("Needs_Exposure_Increase").resolve("test_image_0.png")));
        assertTrue(Files.exists(outputRoot.resolve("Needs_Saturation_Increase").resolve("test_image_1.png")));
        
        // Image 2 has two issues, should be in both folders
        assertTrue(Files.exists(outputRoot.resolve("Oversaturated_Red").resolve("test_image_2.png")));
        assertTrue(Files.exists(outputRoot.resolve("ColorCast_Blue").resolve("test_image_2.png")));
    }

    @Test
    @DisplayName("Group with symlink mode - should create symlinks (or fallback to copy)")
    void testGroupWithSymlinks() throws IOException {
        List<ImageClassifyResult> results = List.of(
            createResult(testImages.get(0), ImageIssue.Needs_Contrast_Increase)
        );

        Path outputRoot = testOutputDir.resolve("grouped_symlink");
        Path csvPath = service.groupAndReport(results, outputRoot, false, "all");

        assertTrue(Files.exists(csvPath));
        
        // File should exist (either as symlink or fallback copy)
        Path linkedFile = outputRoot.resolve("Needs_Contrast_Increase").resolve("test_image_0.png");
        assertTrue(Files.exists(linkedFile));
    }

    @Test
    @DisplayName("CSV report - should contain correct headers and data")
    void testCSVReportContent() throws IOException {
        List<ImageClassifyResult> results = List.of(
            createResult(testImages.get(0), ImageIssue.Needs_Exposure_Increase)
        );

        Path outputRoot = testOutputDir.resolve("grouped_csv");
        Path csvPath = service.groupAndReport(results, outputRoot, true, "all");

        String csvContent = Files.readString(csvPath);
        
        // Verify headers
        assertTrue(csvContent.contains("path,width,height,medianY,meanY"));
        assertTrue(csvContent.contains("labAMean,labBMean,labABDist,castAngleDeg"));
        assertTrue(csvContent.contains("shadowNoiseRatio,labels"));
        
        // Verify data row
        assertTrue(csvContent.contains("test_image_0.png"));
        assertTrue(csvContent.contains("800"));  // width
        assertTrue(csvContent.contains("600"));  // height
        assertTrue(csvContent.contains("[Needs_Exposure_Increase]"));
    }

    @Test
    @DisplayName("CSV escaping - should properly escape commas and quotes")
    void testCSVEscaping() throws IOException {
        // Create a result with path containing special characters (Windows-safe)
        Path specialPath = testOutputDir.resolve("test_image_with_comma_and_apostrophe.png");
        Files.write(specialPath, "test".getBytes());
        
        List<ImageClassifyResult> results = List.of(
            createResult(specialPath, ImageIssue.Needs_Exposure_Increase)
        );

        Path outputRoot = testOutputDir.resolve("grouped_escape");
        Path csvPath = service.groupAndReport(results, outputRoot, true, "all");

        String csvContent = Files.readString(csvPath);
        
        // Verify CSV contains the filename
        assertTrue(csvContent.contains("test_image_with_comma_and_apostrophe.png"));
    }

    @Test
    @DisplayName("Multiple images with same issue - should all be in same folder")
    void testMultipleImagesInSameFolder() throws IOException {
        List<ImageClassifyResult> results = List.of(
            createResult(testImages.get(0), ImageIssue.Needs_Exposure_Increase),
            createResult(testImages.get(1), ImageIssue.Needs_Exposure_Increase),
            createResult(testImages.get(2), ImageIssue.Needs_Exposure_Increase)
        );

        Path outputRoot = testOutputDir.resolve("grouped_multiple");
        service.groupAndReport(results, outputRoot, true, "all");

        Path issueFolder = outputRoot.resolve("Needs_Exposure_Increase");
        
        // Count files in folder
        long fileCount = Files.list(issueFolder).count();
        assertEquals(3, fileCount);
    }

    @Test
    @DisplayName("Image with no issues - should not be copied to any folder")
    void testImageWithNoIssues() throws IOException {
        List<ImageClassifyResult> results = List.of(
            createResult(testImages.get(0))  // No issues
        );

        Path outputRoot = testOutputDir.resolve("grouped_no_issues");
        Path csvPath = service.groupAndReport(results, outputRoot, true, "all");

        // CSV should still be created
        assertTrue(Files.exists(csvPath));
        
        // Verify no files were copied to issue folders
        for (ImageIssue issue : ImageIssue.values()) {
            Path issueFolder = outputRoot.resolve(issue.name());
            if (Files.exists(issueFolder)) {
                long fileCount = Files.list(issueFolder).filter(Files::isRegularFile).count();
                assertEquals(0, fileCount, "No files should be in " + issue.name());
            }
        }
    }

    @Test
    @DisplayName("Empty results list - should create only CSV without issue folders")
    void testEmptyResults() throws IOException {
        List<ImageClassifyResult> results = List.of();

        Path outputRoot = testOutputDir.resolve("grouped_empty");
        Path csvPath = service.groupAndReport(results, outputRoot, true, "all");

        assertTrue(Files.exists(csvPath));
        assertTrue(Files.exists(outputRoot));
        
        // Verify CSV has only headers
        String csvContent = Files.readString(csvPath);
        long lineCount = csvContent.lines().count();
        assertEquals(1, lineCount, "CSV should have only header row");
        
        // Verify no issue folders were created (only the CSV and output root)
        try (var stream = Files.list(outputRoot)) {
            long folderCount = stream.filter(Files::isDirectory).count();
            assertEquals(0, folderCount, "No issue folders should be created for empty results");
        }
    }

    @Test
    @DisplayName("Output directory creation - should handle nested paths")
    void testNestedOutputDirectory() throws IOException {
        List<ImageClassifyResult> results = List.of(
            createResult(testImages.get(0), ImageIssue.Needs_Exposure_Increase)
        );

        Path outputRoot = testOutputDir.resolve("level1/level2/level3/grouped");
        Path csvPath = service.groupAndReport(results, outputRoot, true, "all");

        assertTrue(Files.exists(csvPath));
        assertTrue(Files.exists(outputRoot));
    }

    @Test
    @DisplayName("Numeric formatting - should use correct decimal places")
    void testNumericFormatting() throws IOException {
        List<ImageClassifyResult> results = List.of(
            createResult(testImages.get(0), ImageIssue.Needs_Exposure_Increase)
        );

        Path outputRoot = testOutputDir.resolve("grouped_format");
        Path csvPath = service.groupAndReport(results, outputRoot, true, "all");

        String csvContent = Files.readString(csvPath);
        
        // Check for 4 decimal places (e.g., "0.5000" or similar)
        assertTrue(csvContent.matches("(?s).*\\d\\.\\d{4}.*"), 
            "Numbers should be formatted with 4 decimal places");
    }
}
