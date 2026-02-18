package app.restful.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Three-tier cache for camera color correction matrices.
 * 
 * Lookup order:
 * 1. Memory cache (LRU, 100 entries)
 * 2. Hardcoded matrices (CameraColorMatrices)
 * 3. Disk cache (~/.image-batch-correction/camera-matrices/)
 * 4. dcraw_emu extraction (last resort)
 * 
 * This minimizes expensive dcraw executions while supporting uncommon cameras.
 */
@Component
public class CameraMatrixCache {

    private static final Logger log = LoggerFactory.getLogger(CameraMatrixCache.class);
    
    private static final int MAX_MEMORY_ENTRIES = 100;
    private static final Pattern CAMERA_MODEL_PATTERN = Pattern.compile("Camera:\\s*(.+)$", Pattern.MULTILINE);
    
    private final Path matrixCacheDir;
    
    // Access-order LRU for fast lookups
    private final Map<String, MatrixEntry> memoryCache = Collections.synchronizedMap(
        new LinkedHashMap<String, MatrixEntry>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, MatrixEntry> eldest) {
                return size() > MAX_MEMORY_ENTRIES;
            }
        }
    );
    
    public CameraMatrixCache() {
        String userHome = System.getProperty("user.home");
        this.matrixCacheDir = Paths.get(userHome, ".image-batch-correction", "camera-matrices");
        
        try {
            Files.createDirectories(matrixCacheDir);
            log.info("Camera matrix cache initialized at: {}", matrixCacheDir);
        } catch (IOException e) {
            log.error("Failed to create matrix cache directory: {}", matrixCacheDir, e);
        }
    }
    
    /**
     * Get color correction matrix for a camera model.
     * Performs three-tier lookup with caching.
     * 
     * @param cameraModel Camera model string (e.g., "Canon EOS R5")
     * @param rawFilePath Optional: RAW file path for dcraw extraction fallback
     * @return 3×3 color matrix, never null (returns generic if all else fails)
     */
    public double[][] getMatrix(String cameraModel, Path rawFilePath) {
        if (cameraModel == null || cameraModel.isBlank()) {
            if (rawFilePath != null) {
                cameraModel = extractCameraModel(rawFilePath);
            }
            if (cameraModel == null) {
                log.warn("Unknown camera model, using generic matrix");
                return CameraColorMatrices.getGenericMatrix();
            }
        }
        
        String normalizedModel = normalizeCameraModel(cameraModel);
        
        // Tier 1: Memory cache
        MatrixEntry cached = memoryCache.get(normalizedModel);
        if (cached != null) {
            log.debug("Matrix cache HIT (memory): {}", normalizedModel);
            return cached.matrix;
        }
        
        // Tier 2: Hardcoded matrices
        double[][] hardcoded = CameraColorMatrices.getMatrix(cameraModel);
        if (hardcoded != null) {
            log.debug("Matrix cache HIT (hardcoded): {}", cameraModel);
            memoryCache.put(normalizedModel, new MatrixEntry(hardcoded, Instant.now()));
            return hardcoded;
        }
        
        // Tier 3: Disk cache
        Path cacheFile = matrixCacheDir.resolve(sanitizeFilename(normalizedModel) + ".matrix");
        if (Files.exists(cacheFile)) {
            try {
                double[][] diskMatrix = loadMatrixFromDisk(cacheFile);
                log.debug("Matrix cache HIT (disk): {}", normalizedModel);
                memoryCache.put(normalizedModel, new MatrixEntry(diskMatrix, Instant.now()));
                return diskMatrix;
            } catch (IOException e) {
                log.warn("Failed to load matrix from disk: {}", cacheFile, e);
            }
        }
        
        // Tier 4: dcraw extraction (not implemented in this iteration)
        // For now, use generic matrix
        log.info("Matrix cache MISS: {} - using generic matrix", normalizedModel);
        double[][] genericMatrix = CameraColorMatrices.getGenericMatrix();
        
        // Cache the generic matrix to avoid repeated misses
        memoryCache.put(normalizedModel, new MatrixEntry(genericMatrix, Instant.now()));
        
        // Save to disk for future use
        try {
            saveMatrixToDisk(cacheFile, genericMatrix);
        } catch (IOException e) {
            log.warn("Failed to save matrix to disk: {}", cacheFile, e);
        }
        
        return genericMatrix;
    }
    
    /**
     * Extract camera model from RAW file using dcraw_emu -i.
     */
    private String extractCameraModel(Path rawFilePath) {
        String dcrawPath = System.getenv("DCRAW_PATH");
        if (dcrawPath == null || dcrawPath.isBlank()) {
            dcrawPath = "dcraw_emu"; // Fallback to PATH
        }
        
        try {
            ProcessBuilder pb = new ProcessBuilder(dcrawPath, "-i", "-v", rawFilePath.toString());
            Process process = pb.start();
            
            StringBuilder output = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append("\n");
                }
            }
            
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                log.warn("dcraw_emu exited with code {} for {}", exitCode, rawFilePath);
                return null;
            }
            
            // Parse camera model from output
            Matcher matcher = CAMERA_MODEL_PATTERN.matcher(output.toString());
            if (matcher.find()) {
                String model = matcher.group(1).trim();
                log.debug("Extracted camera model: {}", model);
                return model;
            }
            
        } catch (IOException | InterruptedException e) {
            log.error("Failed to extract camera model from {}", rawFilePath, e);
        }
        
        return null;
    }
    
    /**
     * Load matrix from disk cache file.
     * Format: 9 comma-separated doubles (row-major order)
     */
    private double[][] loadMatrixFromDisk(Path cacheFile) throws IOException {
        String content = Files.readString(cacheFile).trim();
        String[] values = content.split(",");
        
        if (values.length != 9) {
            throw new IOException("Invalid matrix file format: expected 9 values, got " + values.length);
        }
        
        double[][] matrix = new double[3][3];
        for (int i = 0; i < 9; i++) {
            matrix[i / 3][i % 3] = Double.parseDouble(values[i].trim());
        }
        
        return matrix;
    }
    
    /**
     * Save matrix to disk cache.
     * Format: 9 comma-separated doubles
     */
    private void saveMatrixToDisk(Path cacheFile, double[][] matrix) throws IOException {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 3; i++) {
            for (int j = 0; j < 3; j++) {
                if (sb.length() > 0) sb.append(",");
                sb.append(matrix[i][j]);
            }
        }
        
        Files.writeString(cacheFile, sb.toString());
        log.debug("Saved matrix to disk: {}", cacheFile);
    }
    
    /**
     * Normalize camera model for consistent caching.
     * Removes extra whitespace and converts to title case.
     */
    private String normalizeCameraModel(String model) {
        return model.trim().replaceAll("\\s+", " ");
    }
    
    /**
     * Sanitize camera model for safe filename use.
     */
    private String sanitizeFilename(String model) {
        return model.replaceAll("[^a-zA-Z0-9_-]", "_");
    }
    
    /**
     * Matrix cache entry with metadata.
     */
    private static class MatrixEntry {
        final double[][] matrix;
        final Instant cachedAt;
        
        MatrixEntry(double[][] matrix, Instant cachedAt) {
            this.matrix = matrix;
            this.cachedAt = cachedAt;
        }
    }
}
