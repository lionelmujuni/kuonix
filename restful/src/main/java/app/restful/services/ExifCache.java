package app.restful.services;

import app.restful.dto.ExifData;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class ExifCache {

    private static final int MAX = 256;

    private final Map<Path, ExifData> cache = Collections.synchronizedMap(
            new LinkedHashMap<Path, ExifData>(MAX, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<Path, ExifData> eldest) {
                    return size() > MAX;
                }
            });

    public void put(Path path, ExifData exif) {
        if (path == null || exif == null) return;
        cache.put(path.toAbsolutePath().normalize(), exif);
    }

    public ExifData get(Path path) {
        if (path == null) return null;
        return cache.get(path.toAbsolutePath().normalize());
    }

    public void invalidate(Path path) {
        if (path != null) cache.remove(path.toAbsolutePath().normalize());
    }
}
