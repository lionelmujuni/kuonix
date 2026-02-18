package app.restful.services;

import org.apache.commons.codec.digest.DigestUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

/**
 * LRU cache for decoded RAW images with disk persistence.
 * 
 * Strategy:
 * - Memory cache: LinkedHashMap with access-order LRU (max 50 entries)
 * - Disk cache: Persistent storage in ~/.image-batch-correction/dcraw-cache/
 * - Cache key: SHA-256 hash of "${absoluteRawPath}_${isFullSize}"
 * - Storage format: JPEG for space efficiency
 * 
 * This prevents re-decoding RAW files (2-5s per file) on subsequent access.
 */
@Component
public class RawImageCache {

    private static final Logger log = LoggerFactory.getLogger(RawImageCache.class);
    
    private static final int MAX_MEMORY_ENTRIES = 50;
    private static final long MAX_DISK_SIZE_MB = 500;
    private static final int DEFAULT_CLEANUP_DAYS = 30;
    
    private final Path cacheDir;
    
    // Access-order LRU cache for fast in-memory lookups
    private final Map<String, CacheEntry> memoryCache = Collections.synchronizedMap(
        new LinkedHashMap<String, CacheEntry>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, CacheEntry> eldest) {
                return size() > MAX_MEMORY_ENTRIES;
            }
        }
    );
    
    public RawImageCache() {
        String userHome = System.getProperty("user.home");
        String cacheDirEnv = System.getenv("DCRAW_CACHE_DIR");
        
        if (cacheDirEnv != null && !cacheDirEnv.isEmpty()) {
            this.cacheDir = Paths.get(cacheDirEnv);
        } else {
            this.cacheDir = Paths.get(userHome, ".image-batch-correction", "dcraw-cache");
        }
        
        try {
            Files.createDirectories(cacheDir);
            log.info("RAW image cache initialized at: {}", cacheDir);
        } catch (IOException e) {
            log.error("Failed to create cache directory: {}", cacheDir, e);
        }
    }
    
    /**
     * Get cached decoded image path if available.
     * 
     * @param rawPath Original RAW file path
     * @param isFullSize true for full resolution, false for preview
     * @return Cached decoded image path, or null if not cached
     */
    public Path get(Path rawPath, boolean isFullSize) {
        String key = generateCacheKey(rawPath, isFullSize);
        
        // Check memory cache first
        CacheEntry entry = memoryCache.get(key);
        if (entry != null) {
            if (Files.exists(entry.decodedPath)) {
                log.debug("Cache HIT (memory): {}", key);
                return entry.decodedPath;
            } else {
                // Stale entry - remove from memory cache
                memoryCache.remove(key);
            }
        }
        
        // Check disk cache
        Path cachedFile = cacheDir.resolve(key + ".jpg");
        if (Files.exists(cachedFile)) {
            log.debug("Cache HIT (disk): {}", key);
            // Promote to memory cache
            memoryCache.put(key, new CacheEntry(cachedFile, Instant.now()));
            return cachedFile;
        }
        
        log.debug("Cache MISS: {}", key);
        return null;
    }
    
    /**
     * Store decoded image in cache.
     * 
     * @param rawPath Original RAW file path
     * @param isFullSize true for full resolution, false for preview
     * @param decodedPath Path to decoded image (will be copied to cache)
     * @return Path to cached file
     */
    public Path put(Path rawPath, boolean isFullSize, Path decodedPath) throws IOException {
        String key = generateCacheKey(rawPath, isFullSize);
        Path cachedFile = cacheDir.resolve(key + ".jpg");
        
        // Copy decoded image to cache directory
        if (!Files.exists(cachedFile)) {
            Files.copy(decodedPath, cachedFile);
            log.debug("Cache PUT: {} -> {}", key, cachedFile);
        }
        
        // Add to memory cache
        memoryCache.put(key, new CacheEntry(cachedFile, Instant.now()));
        
        return cachedFile;
    }
    
    /**
     * Generate cache key using SHA-256 hash.
     * Key format: sha256("${absolutePath}_${fullSize}")
     */
    private String generateCacheKey(Path rawPath, boolean isFullSize) {
        String input = rawPath.toAbsolutePath().toString() + "_" + isFullSize;
        return DigestUtils.sha256Hex(input);
    }
    
    /**
     * Clean old cache entries from disk.
     * Removes files older than specified days.
     * 
     * @param daysOld Age threshold in days
     * @return Number of files deleted
     */
    public int cleanOldEntries(int daysOld) throws IOException {
        long cutoffTime = System.currentTimeMillis() - (daysOld * 24L * 60 * 60 * 1000);
        int deletedCount = 0;
        
        try (Stream<Path> files = Files.list(cacheDir)) {
            for (Path file : files.toList()) {
                if (Files.isRegularFile(file)) {
                    long lastModified = Files.getLastModifiedTime(file).toMillis();
                    if (lastModified < cutoffTime) {
                        Files.deleteIfExists(file);
                        deletedCount++;
                        
                        // Remove from memory cache if present
                        String filename = file.getFileName().toString();
                        String key = filename.replace(".jpg", "");
                        memoryCache.remove(key);
                    }
                }
            }
        }
        
        if (deletedCount > 0) {
            log.info("Cleaned {} old cache entries (older than {} days)", deletedCount, daysOld);
        }
        
        return deletedCount;
    }
    
    /**
     * Get cache directory path for external access.
     */
    public Path getCacheDir() {
        return cacheDir;
    }
    
    /**
     * Clear all cache entries (memory and disk).
     */
    public void clear() throws IOException {
        memoryCache.clear();
        
        try (Stream<Path> files = Files.list(cacheDir)) {
            for (Path file : files.toList()) {
                if (Files.isRegularFile(file)) {
                    Files.deleteIfExists(file);
                }
            }
        }
        
        log.info("Cache cleared");
    }
    
    /**
     * Cache entry with metadata.
     */
    private static class CacheEntry {
        final Path decodedPath;
        final Instant createdAt;
        
        CacheEntry(Path decodedPath, Instant createdAt) {
            this.decodedPath = decodedPath;
            this.createdAt = createdAt;
        }
    }
}
