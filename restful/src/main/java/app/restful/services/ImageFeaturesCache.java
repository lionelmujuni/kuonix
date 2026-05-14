package app.restful.services;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import app.restful.dto.ImageFeatures;

/**
 * Thread-safe LRU cache wrapping {@link ImageAnalysisService}.
 *
 * <p>The agent invokes {@code analyzeImage} and {@code classifyIssues} back to
 * back on the same image — and frequently re-asks during a single chat turn.
 * Without a cache, the full {@code ImageAnalysisService.compute} pipeline
 * (sRGB linearisation, Lab/HSV conversions, percentile sorts, hue-bucketed
 * oversaturation checks, shadow-noise residual) runs on every call.</p>
 *
 * <p>Cache key is {@code (path, file lastModifiedTime, enableSkin)}. The
 * lastModified component automatically invalidates entries when the file is
 * rewritten (e.g. after {@code commitCorrection} produces a new step file).
 * Eviction is LRU bounded at {@link #MAX_ENTRIES} — image-editing sessions
 * touch a small working set, so a tight cap keeps memory predictable while
 * still serving the hot path.</p>
 */
@Service
public class ImageFeaturesCache {

    private static final Logger log = LoggerFactory.getLogger(ImageFeaturesCache.class);

    /** Soft cap. Tuned for a typical chat session — a few dozen images max. */
    static final int MAX_ENTRIES = 64;

    private final ImageAnalysisService analysis;
    private final Map<Key, ImageFeatures> cache;

    public ImageFeaturesCache(ImageAnalysisService analysis) {
        this.analysis = analysis;
        // access-ordered LinkedHashMap → true LRU. Synchronised for cross-thread reads.
        this.cache = Collections.synchronizedMap(
                new LinkedHashMap<Key, ImageFeatures>(MAX_ENTRIES, 0.75f, true) {
                    @Override
                    protected boolean removeEldestEntry(Map.Entry<Key, ImageFeatures> eldest) {
                        return size() > MAX_ENTRIES;
                    }
                });
    }

    /**
     * Return cached features for {@code path}, recomputing on miss or on
     * file-mtime change. The {@code enableSkin} flag participates in the key
     * because it changes the returned feature shape.
     */
    public ImageFeatures get(Path path, boolean enableSkin) {
        Key key = makeKey(path, enableSkin);
        if (key != null) {
            ImageFeatures cached = cache.get(key);
            if (cached != null) {
                log.debug("ImageFeatures cache HIT  {}", path.getFileName());
                return cached;
            }
        }
        log.debug("ImageFeatures cache MISS {}", path.getFileName());
        ImageFeatures fresh = analysis.compute(path, enableSkin);
        if (key != null) cache.put(key, fresh);
        return fresh;
    }

    /** Drop every entry referencing {@code path}, regardless of mtime or skin flag. */
    public void invalidate(Path path) {
        if (path == null) return;
        cache.keySet().removeIf(k -> k.path.equals(path));
    }

    public void clear() {
        cache.clear();
    }

    public int size() {
        return cache.size();
    }

    private static Key makeKey(Path path, boolean enableSkin) {
        if (path == null) return null;
        long mtime;
        try {
            mtime = Files.getLastModifiedTime(path).toMillis();
        } catch (IOException e) {
            // Don't cache when we can't tell whether the file changed.
            return null;
        }
        return new Key(path, mtime, enableSkin);
    }

    private record Key(Path path, long lastModified, boolean enableSkin) {}
}
