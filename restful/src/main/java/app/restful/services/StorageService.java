package app.restful.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.*;
import java.util.ArrayList;
import java.util.List;

/**
 * Manages persistent file storage in workspace directory.
 * Uses user.home/.image-batch-correction/workspace for session files.
 */
@Service
public class StorageService {

    private static final Logger log = LoggerFactory.getLogger(StorageService.class);
    private final Path workspaceDir;

    public StorageService() {
        // Create persistent workspace in user home directory
        String userHome = System.getProperty("user.home");
        this.workspaceDir = Paths.get(userHome, ".image-batch-correction", "workspace");
        
        try {
            Files.createDirectories(workspaceDir);
            log.info("Workspace directory initialized: {}", workspaceDir);
        } catch (IOException e) {
            throw new RuntimeException("Failed to create workspace directory: " + workspaceDir, e);
        }
    }

    /**
     * Saves uploaded files to persistent workspace directory.
     * 
     * @param files List of multipart files to save
     * @return List of absolute file paths
     * @throws IOException if file operations fail
     */
    public List<String> saveImages(List<MultipartFile> files) throws IOException {
        if (files == null || files.isEmpty()) {
            throw new IllegalArgumentException("No files provided");
        }

        List<String> savedPaths = new ArrayList<>();

        for (MultipartFile file : files) {
            // Sanitize filename to prevent path traversal
            String originalName = file.getOriginalFilename();
            if (originalName == null || originalName.isEmpty()) {
                originalName = "image_" + System.currentTimeMillis();
            }
            
            String cleanedName = originalName.replaceAll("[^a-zA-Z0-9._-]", "_");
            
            // Add timestamp prefix to avoid collisions
            String uniqueName = System.currentTimeMillis() + "_" + cleanedName;
            Path targetPath = workspaceDir.resolve(uniqueName);

            // Write file to persistent workspace
            Files.write(targetPath, file.getBytes(), StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            log.debug("Saved file: {} ({} bytes)", uniqueName, file.getSize());

            savedPaths.add(targetPath.toAbsolutePath().toString());
        }

        log.info("Saved {} files to workspace", savedPaths.size());
        return savedPaths;
    }

    /**
     * Get workspace directory path for other services (e.g., GroupingService).
     */
    public Path getWorkspaceDir() {
        return workspaceDir;
    }

    /**
     * Working-copy directory for committed intermediate correction steps.
     * Hidden from the user-visible workspace root so chained edits don't
     * clutter the final-output folder.
     */
    public Path getWorkingDir() {
        Path workingDir = workspaceDir.resolve(".working");
        try {
            Files.createDirectories(workingDir);
        } catch (IOException e) {
            throw new RuntimeException("Failed to create working directory: " + workingDir, e);
        }
        return workingDir;
    }

    /**
     * Clean up old files from workspace (optional maintenance).
     * 
     * @param daysOld Delete files older than this many days
     * @throws IOException if cleanup fails
     */
    public void cleanWorkspace(int daysOld) throws IOException {
        long cutoffTime = System.currentTimeMillis() - (daysOld * 24L * 60 * 60 * 1000);
        int deletedCount = 0;
        
        try (var stream = Files.walk(workspaceDir, 1)) {
            List<Path> toDelete = stream
                .filter(Files::isRegularFile)
                .filter(p -> {
                    try {
                        return Files.getLastModifiedTime(p).toMillis() < cutoffTime;
                    } catch (IOException e) {
                        return false;
                    }
                })
                .toList();
            
            for (Path p : toDelete) {
                try {
                    Files.deleteIfExists(p);
                    deletedCount++;
                } catch (IOException e) {
                    log.warn("Failed to delete old file: {}", p, e);
                }
            }
        }
        
        log.info("Cleaned workspace: deleted {} files older than {} days", deletedCount, daysOld);
    }
}
