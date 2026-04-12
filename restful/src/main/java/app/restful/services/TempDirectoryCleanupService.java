package app.restful.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Service for cleaning up orphaned temporary directories created during RAW image processing.
 * 
 * Runs daily at 3am to scan system temp directory for:
 * - raw_decode_* directories (from preview decoding)
 * - raw_full_* directories (from full decoding)
 * 
 * Directories older than 24 hours are considered orphaned and deleted.
 */
@Service
public class TempDirectoryCleanupService {
    
    private static final Logger log = LoggerFactory.getLogger(TempDirectoryCleanupService.class);
    
    private static final long MAX_AGE_HOURS = 24;
    private static final String[] TEMP_DIR_PATTERNS = {"raw_decode_", "raw_full_"};
    
    /**
     * Scheduled cleanup task that runs daily at 3:00 AM.
     * Scans system temp directory for orphaned RAW processing directories.
     */
    @Scheduled(cron = "0 0 3 * * ?")
    public void cleanupOrphanedTempDirectories() {
        log.info("Starting scheduled temp directory cleanup");
        
        CleanupResult result = performCleanup();
        
        log.info("Cleanup complete: {} directories deleted, {} bytes freed", 
            result.directoriesDeleted, result.bytesFreed);
    }
    
    /**
     * Perform cleanup operation and return statistics.
     * Can be called manually or by scheduled task.
     * 
     * @return Cleanup statistics
     */
    public CleanupResult performCleanup() {
        String systemTempDir = System.getProperty("java.io.tmpdir");
        Path tempPath = Paths.get(systemTempDir);
        
        log.debug("Scanning temp directory: {}", tempPath);
        
        int directoriesDeleted = 0;
        long bytesFreed = 0;
        
        try {
            File tempDir = tempPath.toFile();
            File[] files = tempDir.listFiles();
            
            if (files == null) {
                log.warn("Cannot list files in temp directory: {}", tempPath);
                return new CleanupResult(0, 0);
            }
            
            long cutoffTime = Instant.now().toEpochMilli() - (MAX_AGE_HOURS * 3600 * 1000);
            
            for (File file : files) {
                if (!file.isDirectory()) {
                    continue;
                }
                
                String name = file.getName();
                boolean matches = false;
                for (String pattern : TEMP_DIR_PATTERNS) {
                    if (name.startsWith(pattern)) {
                        matches = true;
                        break;
                    }
                }
                
                if (!matches) {
                    continue;
                }
                
                try {
                    Path dirPath = file.toPath();
                    BasicFileAttributes attrs = Files.readAttributes(dirPath, BasicFileAttributes.class);
                    long creationTime = attrs.creationTime().toMillis();
                    
                    if (creationTime < cutoffTime) {
                        // Calculate directory size before deletion
                        long dirSize = calculateDirectorySize(dirPath);
                        
                        // Delete the directory
                        deleteDirectory(dirPath);
                        
                        directoriesDeleted++;
                        bytesFreed += dirSize;
                        
                        log.debug("Deleted orphaned temp directory: {} ({} bytes, age: {} hours)", 
                            name, dirSize, (Instant.now().toEpochMilli() - creationTime) / 3600000);
                    }
                    
                } catch (IOException e) {
                    log.warn("Failed to process temp directory: {}", file.getName(), e);
                }
            }
            
        } catch (Exception e) {
            log.error("Error during temp directory cleanup", e);
        }
        
        return new CleanupResult(directoriesDeleted, bytesFreed);
    }
    
    /**
     * Calculate total size of a directory including all subdirectories and files.
     */
    private long calculateDirectorySize(Path directory) {
        try {
            return Files.walk(directory)
                .filter(Files::isRegularFile)
                .mapToLong(path -> {
                    try {
                        return Files.size(path);
                    } catch (IOException e) {
                        return 0;
                    }
                })
                .sum();
        } catch (IOException e) {
            log.warn("Failed to calculate directory size: {}", directory, e);
            return 0;
        }
    }
    
    /**
     * Delete directory and all its contents.
     * Uses reverse-sorted deletion to ensure files are deleted before directories.
     */
    private void deleteDirectory(Path directory) throws IOException {
        Files.walk(directory)
            .sorted((a, b) -> -a.compareTo(b)) // Reverse order: files before directories
            .forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException e) {
                    log.warn("Failed to delete: {}", path, e);
                }
            });
    }
    
    /**
     * Result statistics from cleanup operation.
     */
    public static class CleanupResult {
        public final int directoriesDeleted;
        public final long bytesFreed;
        
        public CleanupResult(int directoriesDeleted, long bytesFreed) {
            this.directoriesDeleted = directoriesDeleted;
            this.bytesFreed = bytesFreed;
        }
        
        public int getDirectoriesDeleted() {
            return directoriesDeleted;
        }
        
        public long getBytesFreed() {
            return bytesFreed;
        }
    }
}
