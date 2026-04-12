package app.restful;

import app.restful.services.StorageService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for StorageService.
 * Tests file upload, workspace management, and cleanup operations.
 */
public class StorageServiceTest {

    private final StorageService storage = new StorageService();

    @AfterEach
    void cleanup() throws IOException {
        // Clean up test files (7 days retention for safety)
        storage.cleanWorkspace(0);
    }

    @Test
    @DisplayName("Save single image - should create file in workspace")
    void testSaveImages() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "files",
            "test.png",
            "image/png",
            "fakeimagecontent".getBytes()
        );

        List<String> paths = storage.saveImages(List.of(file));

        assertEquals(1, paths.size());
        assertTrue(new File(paths.get(0)).exists());
        assertTrue(paths.get(0).contains("test.png"));
    }

    @Test
    @DisplayName("Save multiple images - should create all files")
    void testSaveMultipleImages() throws Exception {
        MockMultipartFile file1 = new MockMultipartFile("files", "image1.jpg", "image/jpeg", "content1".getBytes());
        MockMultipartFile file2 = new MockMultipartFile("files", "image2.png", "image/png", "content2".getBytes());
        MockMultipartFile file3 = new MockMultipartFile("files", "image3.gif", "image/gif", "content3".getBytes());

        List<String> paths = storage.saveImages(List.of(file1, file2, file3));

        assertEquals(3, paths.size());
        paths.forEach(path -> assertTrue(new File(path).exists()));
    }

    @Test
    @DisplayName("Save with null filename - should generate unique name")
    void testSaveWithNullFilename() throws Exception {
        MockMultipartFile file = new MockMultipartFile("files", null, "image/png", "content".getBytes());

        List<String> paths = storage.saveImages(List.of(file));

        assertEquals(1, paths.size());
        assertTrue(new File(paths.get(0)).exists());
    }

    @Test
    @DisplayName("Save with special characters in filename - should sanitize")
    void testSaveWithSpecialCharacters() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "files",
            "test image@#$%^&*.png",
            "image/png",
            "content".getBytes()
        );

        List<String> paths = storage.saveImages(List.of(file));

        assertEquals(1, paths.size());
        String filename = new File(paths.get(0)).getName();
        assertFalse(filename.contains("@"));
        assertFalse(filename.contains("#"));
        assertFalse(filename.contains("$"));
    }

    @Test
    @DisplayName("Save empty list - should throw IllegalArgumentException")
    void testSaveEmptyList() {
        assertThrows(IllegalArgumentException.class, () -> storage.saveImages(List.of()));
    }

    @Test
    @DisplayName("Save null list - should throw IllegalArgumentException")
    void testSaveNullList() {
        assertThrows(IllegalArgumentException.class, () -> storage.saveImages(null));
    }

    @Test
    @DisplayName("Get workspace directory - should return valid path")
    void testGetWorkspaceDir() {
        Path workspaceDir = storage.getWorkspaceDir();
        
        assertNotNull(workspaceDir);
        assertTrue(Files.exists(workspaceDir));
        assertTrue(Files.isDirectory(workspaceDir));
    }

    @Test
    @DisplayName("Clean workspace - should delete old files")
    void testCleanWorkspace() throws Exception {
        // Create a test file
        MockMultipartFile file = new MockMultipartFile("files", "cleanup_test.png", "image/png", "content".getBytes());
        List<String> paths = storage.saveImages(List.of(file));
        
        String createdPath = paths.get(0);
        File createdFile = new File(createdPath);
        assertTrue(createdFile.exists());

        // Set file modification time to 2 days ago to ensure it's "old"
        long twoDaysAgo = System.currentTimeMillis() - (2 * 24 * 60 * 60 * 1000L);
        createdFile.setLastModified(twoDaysAgo);

        // Clean workspace (0 days = delete all)
        storage.cleanWorkspace(0);

        // File should be deleted
        assertFalse(createdFile.exists(), "File should be deleted after cleanup");
    }

    @Test
    @DisplayName("Clean workspace with retention - should keep recent files")
    void testCleanWorkspaceWithRetention() throws Exception {
        MockMultipartFile file = new MockMultipartFile("files", "recent.png", "image/png", "content".getBytes());
        List<String> paths = storage.saveImages(List.of(file));
        
        String createdPath = paths.get(0);

        // Clean files older than 7 days (our file is brand new)
        storage.cleanWorkspace(7);

        // File should still exist
        assertTrue(new File(createdPath).exists(), "Recent file should not be deleted");
    }

    @Test
    @DisplayName("Duplicate filenames - should create unique files with timestamps")
    void testDuplicateFilenames() throws Exception {
        MockMultipartFile file1 = new MockMultipartFile("files", "duplicate.png", "image/png", "content1".getBytes());
        MockMultipartFile file2 = new MockMultipartFile("files", "duplicate.png", "image/png", "content2".getBytes());

        List<String> paths1 = storage.saveImages(List.of(file1));
        Thread.sleep(10); // Ensure different timestamp
        List<String> paths2 = storage.saveImages(List.of(file2));

        assertNotEquals(paths1.get(0), paths2.get(0), "Files with same name should have different paths");
        assertTrue(new File(paths1.get(0)).exists());
        assertTrue(new File(paths2.get(0)).exists());
    }

    @Test
    @DisplayName("Large file content - should handle correctly")
    void testLargeFile() throws Exception {
        byte[] largeContent = new byte[10 * 1024 * 1024]; // 10 MB
        MockMultipartFile file = new MockMultipartFile("files", "large.png", "image/png", largeContent);

        List<String> paths = storage.saveImages(List.of(file));

        assertEquals(1, paths.size());
        File savedFile = new File(paths.get(0));
        assertTrue(savedFile.exists());
        assertEquals(largeContent.length, savedFile.length());
    }
}
