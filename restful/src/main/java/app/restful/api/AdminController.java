package app.restful.api;

import app.restful.services.TempDirectoryCleanupService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for administrative operations.
 * 
 * Endpoints:
 * - POST /admin/cleanup-temp: Manually trigger temp directory cleanup
 */
@RestController
@RequestMapping("/admin")
@CrossOrigin(origins = "*")
public class AdminController {
    
    private static final Logger log = LoggerFactory.getLogger(AdminController.class);
    
    private final TempDirectoryCleanupService cleanupService;
    
    public AdminController(TempDirectoryCleanupService cleanupService) {
        this.cleanupService = cleanupService;
    }
    
    /**
     * Manually trigger cleanup of orphaned temporary directories.
     * 
     * @return Cleanup statistics (directories deleted, bytes freed)
     */
    @PostMapping("/cleanup-temp")
    public ResponseEntity<CleanupResponse> cleanupTempDirectories() {
        log.info("Manual temp directory cleanup requested");
        
        try {
            TempDirectoryCleanupService.CleanupResult result = cleanupService.performCleanup();
            
            CleanupResponse response = new CleanupResponse(
                true,
                result.getDirectoriesDeleted(),
                result.getBytesFreed(),
                String.format("Cleaned up %d directories, freed %d bytes", 
                    result.getDirectoriesDeleted(), result.getBytesFreed())
            );
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            log.error("Manual cleanup failed", e);
            return ResponseEntity.internalServerError()
                .body(new CleanupResponse(false, 0, 0, "Cleanup failed: " + e.getMessage()));
        }
    }
    
    /**
     * Response DTO for cleanup operations.
     */
    public static class CleanupResponse {
        private final boolean success;
        private final int directoriesDeleted;
        private final long bytesFreed;
        private final String message;
        
        public CleanupResponse(boolean success, int directoriesDeleted, long bytesFreed, String message) {
            this.success = success;
            this.directoriesDeleted = directoriesDeleted;
            this.bytesFreed = bytesFreed;
            this.message = message;
        }
        
        public boolean isSuccess() {
            return success;
        }
        
        public int getDirectoriesDeleted() {
            return directoriesDeleted;
        }
        
        public long getBytesFreed() {
            return bytesFreed;
        }
        
        public String getMessage() {
            return message;
        }
    }
}
