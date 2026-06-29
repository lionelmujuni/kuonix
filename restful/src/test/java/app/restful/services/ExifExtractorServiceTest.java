package app.restful.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.drew.lang.Rational;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.ExifSubIFDDirectory;

import app.restful.dto.ExifData;

/**
 * Verifies the multi-IFD fix: a DNG/TIFF RAW exposes several Exif sub-IFDs and
 * the photographic EXIF is not in the first one. The extractor must scan all of
 * them rather than reading {@code getFirstDirectoryOfType}.
 */
class ExifExtractorServiceTest {

    private final ExifExtractorService service = new ExifExtractorService();

    @Test
    void readsPhotographicExifFromLaterSubIfd() {
        Metadata metadata = new Metadata();

        // First sub-IFD = full-resolution raw image IFD: has structural tags but
        // NO exposure data. getFirstDirectoryOfType would wrongly stop here.
        ExifSubIFDDirectory rawImageIfd = new ExifSubIFDDirectory();
        rawImageIfd.setInt(0x0100, 8672); // Image Width — not an exposure tag
        metadata.addDirectory(rawImageIfd);

        // Later sub-IFD = the actual photographic EXIF.
        ExifSubIFDDirectory exif = new ExifSubIFDDirectory();
        exif.setRational(ExifSubIFDDirectory.TAG_EXPOSURE_TIME, new Rational(1, 500));
        exif.setRational(ExifSubIFDDirectory.TAG_FNUMBER, new Rational(4, 1));
        exif.setInt(ExifSubIFDDirectory.TAG_ISO_EQUIVALENT, 200);
        exif.setRational(ExifSubIFDDirectory.TAG_FOCAL_LENGTH, new Rational(28, 1));
        exif.setInt(ExifSubIFDDirectory.TAG_WHITE_BALANCE, 0); // 0 = auto
        exif.setString(ExifSubIFDDirectory.TAG_LENS_MODEL, "FE 20-70mm F4 G");
        exif.setString(ExifSubIFDDirectory.TAG_DATETIME_ORIGINAL, "2023:10:22 17:01:13");
        metadata.addDirectory(exif);

        ExifIFD0Directory ifd0 = new ExifIFD0Directory();
        ifd0.setString(ExifIFD0Directory.TAG_MAKE, "SONY");
        ifd0.setString(ExifIFD0Directory.TAG_MODEL, "ILCE-1");
        metadata.addDirectory(ifd0);

        ExifData d = service.fromMetadata(metadata);

        assertEquals(200, d.iso());
        assertEquals(4.0, d.aperture(), 0.001);
        assertEquals(28.0, d.focalLength(), 0.001);
        assertEquals("FE 20-70mm F4 G", d.lens());
        assertEquals("AUTO", d.wbMode());
        assertEquals("SONY ILCE-1", d.camera());
        assertNotNull(d.shutterSpeed());
        assertTrue(d.shutterSpeed().contains("1/500"), "shutter was: " + d.shutterSpeed());
    }

    @Test
    void fallsBackToRecommendedExposureIndexForIso() {
        Metadata metadata = new Metadata();
        ExifSubIFDDirectory exif = new ExifSubIFDDirectory();
        exif.setInt(ExifSubIFDDirectory.TAG_RECOMMENDED_EXPOSURE_INDEX, 640);
        metadata.addDirectory(exif);

        assertEquals(640, service.fromMetadata(metadata).iso());
    }

    @Test
    void emptyMetadataYieldsAllNull() {
        ExifData d = service.fromMetadata(new Metadata());
        assertNull(d.iso());
        assertNull(d.camera());
        assertNull(d.shutterSpeed());
    }
}
