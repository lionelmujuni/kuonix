package app.restful.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import app.restful.dto.ImageFeatures;

public class ImageFeaturesCacheTest {

    @TempDir
    Path tempDir;

    private ImageAnalysisService analysis;
    private ImageFeaturesCache   cache;

    @BeforeEach
    void setUp() {
        analysis = mock(ImageAnalysisService.class);
        cache    = new ImageFeaturesCache(analysis);
    }

    private Path writeFile(String name) throws IOException {
        Path p = tempDir.resolve(name);
        Files.writeString(p, "x");
        return p;
    }

    private static ImageFeatures stubFeatures(int width) {
        return new ImageFeatures(
                width, 100,
                0.5, 0.5, 0.1, 0.9,
                0.0, 0.0, 0.1,
                0.4, 0.6,
                false, false, false, false, false, false,
                0.0, 0.0, 0.0, 0.0,
                0.0,
                false, 0.0, 0.0,
                0.0);
    }

    @Test
    void hitOnRepeatedCall() throws IOException {
        Path p = writeFile("a.jpg");
        ImageFeatures f = stubFeatures(10);
        when(analysis.compute(p, false)).thenReturn(f);

        ImageFeatures first  = cache.get(p, false);
        ImageFeatures second = cache.get(p, false);

        assertSame(f, first);
        assertSame(f, second);
        verify(analysis, atLeast(1)).compute(p, false);
        // Exactly one underlying compute despite two gets.
        verify(analysis, org.mockito.Mockito.times(1)).compute(p, false);
    }

    @Test
    void mtimeChangeMisses() throws IOException, InterruptedException {
        Path p = writeFile("b.jpg");
        AtomicInteger calls = new AtomicInteger();
        when(analysis.compute(any(Path.class), anyBoolean()))
                .thenAnswer(inv -> stubFeatures(calls.incrementAndGet()));

        ImageFeatures first = cache.get(p, false);

        // Bump mtime by writing the file again with a forced future stamp.
        Files.writeString(p, "y");
        Files.setLastModifiedTime(p,
                java.nio.file.attribute.FileTime.fromMillis(
                        Files.getLastModifiedTime(p).toMillis() + 5_000));

        ImageFeatures second = cache.get(p, false);

        assertNotSame(first, second);
        assertEquals(1, first.width());
        assertEquals(2, second.width());
    }

    @Test
    void differentSkinFlagIsSeparateEntry() throws IOException {
        Path p = writeFile("c.jpg");
        when(analysis.compute(p, false)).thenReturn(stubFeatures(1));
        when(analysis.compute(p, true)).thenReturn(stubFeatures(2));

        ImageFeatures noSkin = cache.get(p, false);
        ImageFeatures skin   = cache.get(p, true);
        ImageFeatures noSkinAgain = cache.get(p, false);

        assertEquals(1, noSkin.width());
        assertEquals(2, skin.width());
        assertSame(noSkin, noSkinAgain);
        verify(analysis, org.mockito.Mockito.times(1)).compute(p, false);
        verify(analysis, org.mockito.Mockito.times(1)).compute(p, true);
    }

    @Test
    void invalidateRemovesEntries() throws IOException {
        Path p = writeFile("d.jpg");
        AtomicInteger calls = new AtomicInteger();
        when(analysis.compute(any(Path.class), anyBoolean()))
                .thenAnswer(inv -> stubFeatures(calls.incrementAndGet()));

        cache.get(p, false);
        cache.invalidate(p);
        ImageFeatures after = cache.get(p, false);

        assertEquals(2, after.width(), "second compute() should run after invalidate()");
    }

    @Test
    void evictsBeyondCap() throws IOException {
        when(analysis.compute(any(Path.class), anyBoolean()))
                .thenAnswer(inv -> stubFeatures(0));

        for (int i = 0; i < ImageFeaturesCache.MAX_ENTRIES + 16; i++) {
            cache.get(writeFile("e_" + i + ".jpg"), false);
        }
        assertEquals(ImageFeaturesCache.MAX_ENTRIES, cache.size());
    }

    @Test
    void clearEmptiesCache() throws IOException {
        when(analysis.compute(any(Path.class), anyBoolean()))
                .thenAnswer(inv -> stubFeatures(0));
        cache.get(writeFile("f.jpg"), false);
        cache.clear();
        assertEquals(0, cache.size());
    }
}
