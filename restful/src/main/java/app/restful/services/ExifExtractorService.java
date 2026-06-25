package app.restful.services;

import app.restful.dto.ExifData;
import com.drew.imaging.ImageMetadataReader;
import com.drew.lang.Rational;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.file.Path;

@Service
public class ExifExtractorService {

    private static final Logger log = LoggerFactory.getLogger(ExifExtractorService.class);

    public ExifData extract(Path path) {
        try {
            Metadata metadata = ImageMetadataReader.readMetadata(path.toFile());

            ExifSubIFDDirectory sub = metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
            ExifIFD0Directory ifd0 = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);

            Integer iso = null;
            String shutterSpeed = null;
            Double aperture = null;
            Double focalLength = null;
            String camera = null;
            String lens = null;
            String captureTime = null;
            String wbMode = null;

            if (sub != null) {
                iso = sub.getInteger(ExifSubIFDDirectory.TAG_ISO_EQUIVALENT);
                shutterSpeed = sub.getDescription(ExifSubIFDDirectory.TAG_EXPOSURE_TIME);

                Rational fnum = sub.getRational(ExifSubIFDDirectory.TAG_FNUMBER);
                if (fnum != null) aperture = fnum.doubleValue();

                Rational fl = sub.getRational(ExifSubIFDDirectory.TAG_FOCAL_LENGTH);
                if (fl != null) focalLength = fl.doubleValue();

                captureTime = sub.getString(ExifSubIFDDirectory.TAG_DATETIME_ORIGINAL);

                Integer wb = sub.getInteger(ExifSubIFDDirectory.TAG_WHITE_BALANCE);
                if (wb != null) wbMode = wb == 0 ? "AUTO" : "MANUAL";

                lens = sub.getString(ExifSubIFDDirectory.TAG_LENS_MODEL);
            }

            if (ifd0 != null) {
                String make = ifd0.getString(ExifIFD0Directory.TAG_MAKE);
                String model = ifd0.getString(ExifIFD0Directory.TAG_MODEL);
                if (make != null && model != null) {
                    camera = make.trim() + " " + model.trim();
                } else if (model != null) {
                    camera = model.trim();
                } else if (make != null) {
                    camera = make.trim();
                }
            }

            return new ExifData(iso, shutterSpeed, aperture, focalLength, camera, lens, captureTime, wbMode);

        } catch (Exception e) {
            log.debug("Could not extract EXIF from {}: {}", path.getFileName(), e.getMessage());
            return ExifData.empty();
        }
    }
}
