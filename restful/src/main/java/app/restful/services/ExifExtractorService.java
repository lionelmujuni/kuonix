package app.restful.services;

import app.restful.dto.ExifData;
import com.drew.imaging.ImageMetadataReader;
import com.drew.lang.Rational;
import com.drew.metadata.Directory;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.Collection;

@Service
public class ExifExtractorService {

    private static final Logger log = LoggerFactory.getLogger(ExifExtractorService.class);

    public ExifData extract(Path path) {
        try {
            Metadata metadata = ImageMetadataReader.readMetadata(path.toFile());
            return fromMetadata(metadata);
        } catch (Exception e) {
            log.debug("Could not extract EXIF from {}: {}", path.getFileName(), e.getMessage());
            return ExifData.empty();
        }
    }

    /**
     * Build {@link ExifData} from parsed metadata. Visible for testing.
     *
     * <p>TIFF-based RAW (DNG, and the multi-IFD formats) expose <em>several</em>
     * {@link ExifSubIFDDirectory} instances — one per embedded IFD (full-res CFA,
     * thumbnails, previews). Only one carries the photographic EXIF, and it is
     * not necessarily the first, so {@code getFirstDirectoryOfType} reads the raw
     * image IFD and finds no exposure tags. We instead scan every sub-IFD and
     * take each tag from the first directory that actually has it.</p>
     */
    ExifData fromMetadata(Metadata metadata) {
        Collection<ExifSubIFDDirectory> subs = metadata.getDirectoriesOfType(ExifSubIFDDirectory.class);
        Collection<ExifIFD0Directory> ifd0s = metadata.getDirectoriesOfType(ExifIFD0Directory.class);

        Integer iso = firstInteger(subs, ExifSubIFDDirectory.TAG_ISO_EQUIVALENT);
        if (iso == null) {
            // Some bodies record only the Recommended Exposure Index (0x8832).
            iso = firstInteger(subs, ExifSubIFDDirectory.TAG_RECOMMENDED_EXPOSURE_INDEX);
        }
        String shutterSpeed = firstDescription(subs, ExifSubIFDDirectory.TAG_EXPOSURE_TIME);
        Double aperture = firstRationalDouble(subs, ExifSubIFDDirectory.TAG_FNUMBER);
        Double focalLength = firstRationalDouble(subs, ExifSubIFDDirectory.TAG_FOCAL_LENGTH);
        String lens = firstString(subs, ExifSubIFDDirectory.TAG_LENS_MODEL);
        String captureTime = firstString(subs, ExifSubIFDDirectory.TAG_DATETIME_ORIGINAL);

        Integer wb = firstInteger(subs, ExifSubIFDDirectory.TAG_WHITE_BALANCE);
        String wbMode = wb == null ? null : (wb == 0 ? "AUTO" : "MANUAL");

        String make = firstString(ifd0s, ExifIFD0Directory.TAG_MAKE);
        String model = firstString(ifd0s, ExifIFD0Directory.TAG_MODEL);
        String camera = buildCamera(make, model);

        return new ExifData(iso, shutterSpeed, aperture, focalLength, camera, lens, captureTime, wbMode);
    }

    private static String buildCamera(String make, String model) {
        if (make != null && model != null) return make + " " + model;
        if (model != null) return model;
        if (make != null) return make;
        return null;
    }

    // ---- tag scanners: first directory that carries the tag wins ----

    private static Integer firstInteger(Collection<? extends Directory> dirs, int tag) {
        for (Directory d : dirs) {
            if (d.containsTag(tag)) {
                Integer v = d.getInteger(tag);
                if (v != null) return v;
            }
        }
        return null;
    }

    private static String firstString(Collection<? extends Directory> dirs, int tag) {
        for (Directory d : dirs) {
            if (d.containsTag(tag)) {
                String v = d.getString(tag);
                if (v != null && !v.isBlank()) return v.trim();
            }
        }
        return null;
    }

    private static String firstDescription(Collection<? extends Directory> dirs, int tag) {
        for (Directory d : dirs) {
            if (d.containsTag(tag)) {
                String v = d.getDescription(tag);
                if (v != null && !v.isBlank()) return v;
            }
        }
        return null;
    }

    private static Double firstRationalDouble(Collection<? extends Directory> dirs, int tag) {
        for (Directory d : dirs) {
            if (d.containsTag(tag)) {
                Rational r = d.getRational(tag);
                if (r != null) return r.doubleValue();
            }
        }
        return null;
    }
}
