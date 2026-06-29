package app.restful;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Directory;
import com.drew.metadata.Metadata;
import com.drew.metadata.Tag;

import app.restful.dto.ExifData;
import app.restful.services.ExifExtractorService;

/**
 * Diagnostic (skipped unless input is supplied). For each input file it dumps
 * EVERY metadata directory and tag metadata-extractor can read, then shows what
 * {@link ExifExtractorService} extracts — so we can see exactly where a format
 * hides its EXIF and why the service does (or no longer doesn't) miss it.
 *
 * <p>Inputs, in priority order:</p>
 * <ol>
 *   <li>{@code -DexifDumpPath=<file>} (or {@code EXIF_DUMP_PATH}) — one file.</li>
 *   <li>{@code -DexifDir=<dir>} (or {@code EXIF_DIR}) — every image in a folder.</li>
 *   <li>otherwise {@code restful/raw-samples/} — drop files there and run.</li>
 * </ol>
 *
 * <p>The {@code test} task is incremental, so use {@code cleanTest} to force a
 * re-run when inputs change:</p>
 * <pre>
 *   .\gradlew cleanTest test --tests "app.restful.ExifDumpTest"
 * </pre>
 *
 * <p>Output goes to the console and to {@code restful/exif-dump.txt}.</p>
 */
public class ExifDumpTest {

    private static final Set<String> IMAGE_EXTENSIONS = Set.of(
            ".dng", ".cr2", ".cr3", ".nef", ".nrw", ".arw", ".srf",
            ".orf", ".raf", ".rw2", ".rwl", ".tif", ".tiff", ".jpg", ".jpeg", ".png");

    @Test
    void dumpAllMetadata() throws Exception {
        List<File> files = resolveInputs();
        Assumptions.assumeFalse(files.isEmpty(),
                "Diagnostic skipped — pass -DexifDumpPath=<file>, -DexifDir=<dir>, "
                + "or drop files in restful/raw-samples/ (then run with cleanTest).");

        StringBuilder out = new StringBuilder();
        out.append("Dumping ").append(files.size()).append(" file(s).\n");
        for (File file : files) dumpOne(file, out);

        String dump = out.toString();
        System.out.println(dump);

        Path dumpFile = Path.of("exif-dump.txt").toAbsolutePath();
        Files.writeString(dumpFile, dump);
        System.out.println(">>> Full dump written to: " + dumpFile);
    }

    private static List<File> resolveInputs() {
        String filePath = sysOrEnv("exifDumpPath", "EXIF_DUMP_PATH");
        if (filePath != null && !filePath.isBlank()) {
            return List.of(new File(filePath));
        }
        String dirPath = sysOrEnv("exifDir", "EXIF_DIR");
        File dir = (dirPath != null && !dirPath.isBlank()) ? new File(dirPath) : new File("raw-samples");
        if (!dir.isDirectory()) return List.of();
        File[] found = dir.listFiles(f -> f.isFile() && isImage(f.getName()));
        if (found == null) return List.of();
        List<File> files = new ArrayList<>(Arrays.asList(found));
        files.sort((a, b) -> a.getName().compareToIgnoreCase(b.getName()));
        return files;
    }

    private static void dumpOne(File file, StringBuilder out) {
        out.append("\n================ ").append(file.getName()).append(" ================\n");
        if (!file.exists()) {
            out.append("!! File not found: ").append(file.getAbsolutePath()).append("\n");
            return;
        }
        out.append("Path: ").append(file.getAbsolutePath()).append("  (").append(file.length()).append(" bytes)\n");

        try {
            Metadata metadata = ImageMetadataReader.readMetadata(file);
            int dirs = 0, tags = 0;
            for (Directory directory : metadata.getDirectories()) {
                dirs++;
                out.append("\n--- ").append(directory.getName())
                   .append("  [").append(directory.getClass().getName()).append("] ---\n");
                for (Tag tag : directory.getTags()) {
                    tags++;
                    out.append(String.format("  0x%04X  %-34s = %s%n",
                            tag.getTagType(), tag.getTagName(), tag.getDescription()));
                }
                for (String err : directory.getErrors()) {
                    out.append("  [ERROR] ").append(err).append("\n");
                }
            }
            out.append("\nTotal: ").append(dirs).append(" directories, ").append(tags).append(" tags.\n");
        } catch (Exception e) {
            out.append("\n!! ImageMetadataReader threw: ")
               .append(e.getClass().getName()).append(": ").append(e.getMessage()).append("\n");
        }

        out.append("\n  -> ExifExtractorService.extract(): ")
           .append(new ExifExtractorService().extract(file.toPath())).append("\n");
    }

    private static boolean isImage(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return IMAGE_EXTENSIONS.stream().anyMatch(lower::endsWith);
    }

    private static String sysOrEnv(String prop, String env) {
        String v = System.getProperty(prop);
        if (v == null || v.isBlank()) v = System.getenv(env);
        return v;
    }
}
