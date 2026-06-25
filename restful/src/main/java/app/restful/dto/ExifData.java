package app.restful.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ExifData(
    Integer iso,
    String shutterSpeed,
    Double aperture,
    Double focalLength,
    String camera,
    String lens,
    String captureTime,
    String wbMode
) {
    public static ExifData empty() {
        return new ExifData(null, null, null, null, null, null, null, null);
    }
}
