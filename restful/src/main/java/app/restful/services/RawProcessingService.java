package app.restful.services;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

import org.bytedeco.opencv.global.opencv_imgcodecs;
import org.bytedeco.opencv.opencv_core.Mat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * Service for processing RAW camera images using dcraw_emu.
 * 
 * Two-phase decoding strategy:
 * 1. Preview decode (synchronous): Fast half-size decode for immediate display
 * 2. Full decode (asynchronous): High-quality full-resolution decode in background
 * 
 * Features:
 * - LRU caching to avoid re-decoding
 * - Camera-specific color matrices
 * - Concurrent decode queue management
 * - Progress tracking for SSE updates
 */
@Service
public class RawProcessingService {

    private static final Logger log = LoggerFactory.getLogger(RawProcessingService.class);
    
    // Supported RAW file extensions
    private static final Set<String> RAW_EXTENSIONS = Set.of(
        ".cr2", ".cr3",  // Canon
        ".nef", ".nrw",  // Nikon
        ".arw", ".srf",  // Sony
        ".dng",          // Adobe/Generic
        ".orf",          // Olympus
        ".raf",          // Fujifilm
        ".rw2", ".rwl",  // Panasonic
        ".srw",          // Samsung
        ".pef",          // Pentax
        ".raw", ".rwz"   // Generic
    );
    
    private final RawImageCache imageCache;
    private final CameraMatrixCache matrixCache;
    private final String dcrawPath;
    
    // Track active decode tasks for SSE progress reporting
    private final Map<String, DecodeTask> activeTasks = new ConcurrentHashMap<>();
    
    /**
     * Get the image cache instance (package-private for ImageAnalysisService).
     */
    public RawImageCache getImageCache() {
        return imageCache;
    }
    
    public RawProcessingService(RawImageCache imageCache, CameraMatrixCache matrixCache) {
        this.imageCache = imageCache;
        this.matrixCache = matrixCache;
        
        // Get dcraw_emu path from environment or fallback
        String envPath = System.getenv("DCRAW_PATH");
        this.dcrawPath = (envPath != null && !envPath.isBlank()) ? envPath : "dcraw_emu";
        
        log.info("RawProcessingService initialized with dcraw_emu at: {}", dcrawPath);
    }
    
    /**
     * Check if a file is a RAW image based on extension.
     */
    public boolean isRawFile(Path filePath) {
        String filename = filePath.getFileName().toString().toLowerCase();
        return RAW_EXTENSIONS.stream().anyMatch(filename::endsWith);
    }
    
    /**
     * Check if a path is a preview image (temporary half-size decode).
     */
    public boolean isPreviewImage(Path filePath) {
        String filename = filePath.getFileName().toString().toLowerCase();
        return filename.contains("_preview.");
    }
    
    /**
     * Decode RAW image to preview quality (half-size, fast).
     * This is synchronous and should complete in <2 seconds.
     * 
     * @param rawPath Path to RAW file
     * @return Path to decoded preview JPEG
     */
    public Path decodePreview(Path rawPath) throws IOException, InterruptedException {
        log.info("Decoding preview for: {}", rawPath.getFileName());
        
        // Check cache first
        Path cached = imageCache.get(rawPath, false);
        if (cached != null && Files.exists(cached)) {
            log.debug("Using cached preview: {}", cached);
            return cached;
        }
        
        // Decode with dcraw_emu: half-size, camera WB, fast interpolation
        // dcraw_emu writes output file in working directory, not to stdout
        Path tempDir = Files.createTempDirectory("raw_decode_");
        Path tempRaw = tempDir.resolve(rawPath.getFileName());
        Files.copy(rawPath, tempRaw);
        
        try {
            List<String> command = new ArrayList<>();
            command.add(dcrawPath);
            command.add("-h");          // Half-size (1/4 pixels, 2x faster)
            command.add("-w");          // Camera white balance
            command.add("-T");          // Output TIFF
            command.add("-q");
            command.add("0");           // Bilinear interpolation (fastest)
            command.add("-o");
            command.add("1");           // sRGB output color space
            command.add(tempRaw.toString());
            
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(tempDir.toFile()); // Run in temp directory
            
            log.debug("Executing: {}", String.join(" ", command));
            Process process = pb.start();
            
            // Capture stderr for errors
            StringBuilder errors = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getErrorStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    errors.append(line).append("\n");
                }
            }
            
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                String errorMsg = errors.toString();
                log.error("dcraw_emu failed (exit {}): {}", exitCode, errorMsg);
                throw new IOException("RAW preview decode failed: " + errorMsg);
            }
            
            // List all files in temp directory for debugging
            log.debug("Temp directory contents after dcraw_emu:");
            try (var stream = Files.list(tempDir)) {
                stream.forEach(p -> log.debug("  - {}", p.getFileName()));
            }
            
            // Find the output TIFF file (dcraw_emu creates it with .tiff or .tif extension)
            // Try multiple patterns since dcraw_emu naming can vary
            Path outputTiff = null;
            String baseName = tempRaw.getFileName().toString();
            int lastDot = baseName.lastIndexOf('.');
            if (lastDot > 0) {
                baseName = baseName.substring(0, lastDot);
            }
            
            // Check for expected patterns
            outputTiff = tempDir.resolve(baseName + ".tiff");
            if (!Files.exists(outputTiff)) {
                outputTiff = tempDir.resolve(baseName + ".tif");
            }
            
            // If not found, search for any .tiff or .tif file in the directory
            if (!Files.exists(outputTiff)) {
                try (var stream = Files.list(tempDir)) {
                    outputTiff = stream
                        .filter(p -> {
                            String name = p.getFileName().toString().toLowerCase();
                            return name.endsWith(".tiff") || name.endsWith(".tif");
                        })
                        .findFirst()
                        .orElse(null);
                }
            }
            
            if (outputTiff == null || !Files.exists(outputTiff)) {
                throw new IOException("dcraw_emu did not create expected output file: " + baseName + ".tiff/.tif");
            }
            
            log.debug("Found output TIFF: {}", outputTiff.getFileName());
            
            // Convert TIFF to JPEG for storage efficiency
            Path outputJpeg = convertTiffToJpeg(outputTiff);
            
            // Cache the result
            Path cachedPath = imageCache.put(rawPath, false, outputJpeg);
            
            // Cleanup temp directory
            cleanupTempDirectory(tempDir);
            
            log.info("Preview decode complete: {} -> {}", rawPath.getFileName(), cachedPath.getFileName());
            return cachedPath;
            
        } catch (Exception e) {
            // Cleanup temp directory on error
            cleanupTempDirectory(tempDir);
            throw e;
        }
    }
    
    /**
     * Decode RAW image to full quality (asynchronous).
     * Returns immediately with a task ID for progress tracking.
     * 
     * @param rawPath Path to RAW file
     * @param taskId Unique task identifier for progress tracking
     * @return CompletableFuture with decoded image path
     */
    @Async("rawDecodeExecutor")
    public CompletableFuture<Path> decodeFullAsync(Path rawPath, String taskId) {
        // Task should already be registered by caller to prevent race conditions
        DecodeTask task = activeTasks.get(taskId);
        if (task == null) {
            log.warn("Task {} not found in activeTasks, creating new one", taskId);
            task = new DecodeTask(taskId, rawPath);
            activeTasks.put(taskId, task);
        }
        
        // Make final reference for lambda access
        final DecodeTask finalTask = task;
        
        try {
            log.info("Starting full decode for: {} (task: {})", rawPath.getFileName(), taskId);
            finalTask.setStatus("decoding");
            finalTask.setProgress(5);
            
            // Check cache first
            Path cached = imageCache.get(rawPath, true);
            if (cached != null && Files.exists(cached)) {
                log.info("Using cached full decode: {}", cached);
                finalTask.setStatus("complete");
                finalTask.setProgress(100);
                finalTask.setOutputPath(cached);
                return CompletableFuture.completedFuture(cached);
            }
            
            finalTask.setProgress(10);
            
            // Decode with dcraw_emu: full-size, high quality
            // dcraw_emu writes output file in working directory, not to stdout
            Path tempDir = Files.createTempDirectory("raw_full_");
            Path tempRaw = tempDir.resolve(rawPath.getFileName());
            Files.copy(rawPath, tempRaw);
            
            try {
                List<String> command = new ArrayList<>();
                command.add(dcrawPath);
                command.add("-w");          // Camera white balance
                command.add("-T");          // Output TIFF
                command.add("-q");
                command.add("3");           // AHD interpolation (high quality)
                command.add("-o");
                command.add("1");           // sRGB output color space
                command.add(tempRaw.toString());
                
                ProcessBuilder pb = new ProcessBuilder(command);
                pb.directory(tempDir.toFile()); // Run in temp directory
                
                log.debug("Executing: {}", String.join(" ", command));
                finalTask.setProgress(20);
                
                Process process = pb.start();
                
                // Monitor process with progress estimation
                // dcraw_emu doesn't provide real-time progress, so we estimate
                java.util.concurrent.atomic.AtomicInteger progressCounter = new java.util.concurrent.atomic.AtomicInteger(20);
                Thread progressMonitor = new Thread(() -> {
                    try {
                        while (process.isAlive() && progressCounter.get() < 80) {
                            Thread.sleep(500);
                            int newProgress = progressCounter.addAndGet(5);
                            finalTask.setProgress(Math.min(newProgress, 80));
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                });
                progressMonitor.start();
                
                // Capture stderr
                StringBuilder errors = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getErrorStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        errors.append(line).append("\n");
                    }
                }
                
                int exitCode = process.waitFor();
                progressMonitor.interrupt();
                
                if (exitCode != 0) {
                    String errorMsg = errors.toString();
                    log.error("dcraw_emu failed (exit {}): {}", exitCode, errorMsg);
                    finalTask.setStatus("error");
                    finalTask.setError("RAW decode failed: " + errorMsg);
                    throw new IOException("RAW full decode failed: " + errorMsg);
                }
                
                finalTask.setProgress(85);
                
                // List all files in temp directory for debugging
                log.debug("Temp directory contents after dcraw_emu:");
                try (var stream = Files.list(tempDir)) {
                    stream.forEach(p -> log.debug("  - {}", p.getFileName()));
                }
                
                // Find the output TIFF file (dcraw_emu creates it with .tiff or .tif extension)
                // Try multiple patterns since dcraw_emu naming can vary
                Path outputTiff = null;
                String baseName = tempRaw.getFileName().toString();
                int lastDot = baseName.lastIndexOf('.');
                if (lastDot > 0) {
                    baseName = baseName.substring(0, lastDot);
                }
                
                // Check for expected patterns
                outputTiff = tempDir.resolve(baseName + ".tiff");
                if (!Files.exists(outputTiff)) {
                    outputTiff = tempDir.resolve(baseName + ".tif");
                }
                
                // If not found, search for any .tiff or .tif file in the directory
                if (!Files.exists(outputTiff)) {
                    try (var stream = Files.list(tempDir)) {
                        outputTiff = stream
                            .filter(p -> {
                                String name = p.getFileName().toString().toLowerCase();
                                return name.endsWith(".tiff") || name.endsWith(".tif");
                            })
                            .findFirst()
                            .orElse(null);
                    }
                }
                
                if (outputTiff == null || !Files.exists(outputTiff)) {
                    throw new IOException("dcraw_emu did not create expected output file: " + baseName + ".tiff/.tif");
                }
                
                log.debug("Found output TIFF: {}", outputTiff.getFileName());
                
                // Convert TIFF to JPEG for storage
                Path outputJpeg = convertTiffToJpeg(outputTiff);
                finalTask.setProgress(95);
                
                // Cache the result
                Path cachedPath = imageCache.put(rawPath, true, outputJpeg);
                
                // Cleanup temp directory
                cleanupTempDirectory(tempDir);
                
                finalTask.setStatus("complete");
                finalTask.setProgress(100);
                finalTask.setOutputPath(cachedPath);
                
                log.info("Full decode complete: {} -> {} (task: {})", 
                    rawPath.getFileName(), cachedPath.getFileName(), taskId);
                
                return CompletableFuture.completedFuture(cachedPath);
                
            } catch (Exception e) {
                // Cleanup temp directory on error
                cleanupTempDirectory(tempDir);
                throw e;
            }
            
        } catch (Exception e) {
            log.error("Full decode failed for {}: {}", rawPath, e.getMessage(), e);
            finalTask.setStatus("error");
            finalTask.setError(e.getMessage());
            return CompletableFuture.failedFuture(e);
        }
    }
    
    /**
     * Convert TIFF to JPEG using OpenCV for storage efficiency.
     * RAW TIFFs can be 50-100MB; JPEGs are 5-10MB with minimal quality loss.
     */
    private Path convertTiffToJpeg(Path tiffPath) throws IOException {
        Path jpegPath = Paths.get(tiffPath.toString().replace(".tiff", ".jpg"));
        
        // Read TIFF
        Mat image = opencv_imgcodecs.imread(tiffPath.toString(), opencv_imgcodecs.IMREAD_COLOR);
        if (image == null || image.empty()) {
            throw new IOException("Failed to read TIFF: " + tiffPath);
        }
        
        try {
            // Write JPEG with high quality (95%)
            opencv_imgcodecs.imwrite(jpegPath.toString(), image);
            
            if (!Files.exists(jpegPath)) {
                throw new IOException("Failed to write JPEG: " + jpegPath);
            }
            
            log.debug("Converted TIFF to JPEG: {} -> {}", tiffPath.getFileName(), jpegPath.getFileName());
            return jpegPath;
            
        } finally {
            image.release();
        }
    }
    
    /**
     * Get decode task status for SSE progress reporting.
     */
    public DecodeTask getTask(String taskId) {
        return activeTasks.get(taskId);
    }
    
    /**
     * Get all active decode tasks.
     */
    public Map<String, DecodeTask> getAllTasks() {
        return activeTasks;
    }
    
    /**
     * Pre-register a task before async execution to prevent race conditions.
     * This ensures SSE streams can find the task immediately.
     */
    public void registerTask(String taskId, Path rawPath) {
        DecodeTask task = new DecodeTask(taskId, rawPath);
        task.setStatus("pending");
        activeTasks.put(taskId, task);
        log.debug("Pre-registered task: {} for {}", taskId, rawPath.getFileName());
    }
    
    /**
     * Remove completed task from tracking.
     */
    public void removeTask(String taskId) {
        activeTasks.remove(taskId);
    }
    
    /**
     * Generate unique task ID for decode operations.
     */
    public String generateTaskId() {
        return UUID.randomUUID().toString();
    }
    
    /**
     * Cleanup temp directory by deleting all files and subdirectories.
     * Deletes in reverse order to ensure files are deleted before directories.
     */
    private void cleanupTempDirectory(Path tempDir) {
        try {
            if (tempDir != null && Files.exists(tempDir)) {
                Files.walk(tempDir)
                    .sorted((a, b) -> -a.compareTo(b)) // Reverse order: files before directories
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException e) {
                            log.warn("Failed to delete temp file: {}", path, e);
                        }
                    });
            }
        } catch (IOException e) {
            log.warn("Failed to cleanup temp directory: {}", tempDir, e);
        }
    }
    
    /**
     * Decode task tracking for SSE progress updates.
     */
    public static class DecodeTask {
        private final String taskId;
        private final Path rawPath;
        private String status; // "pending", "decoding", "complete", "error"
        private int progress; // 0-100
        private Path outputPath;
        private String error;
        private final long startTime;
        
        public DecodeTask(String taskId, Path rawPath) {
            this.taskId = taskId;
            this.rawPath = rawPath;
            this.status = "pending";
            this.progress = 0;
            this.startTime = System.currentTimeMillis();
        }
        
        public String getTaskId() { return taskId; }
        public Path getRawPath() { return rawPath; }
        public String getStatus() { return status; }
        public int getProgress() { return progress; }
        public Path getOutputPath() { return outputPath; }
        public String getError() { return error; }
        public long getStartTime() { return startTime; }
        
        public void setStatus(String status) { this.status = status; }
        public void setProgress(int progress) { this.progress = Math.min(100, Math.max(0, progress)); }
        public void setOutputPath(Path outputPath) { this.outputPath = outputPath; }
        public void setError(String error) { this.error = error; }
    }
}
