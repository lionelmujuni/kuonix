package app.restful.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Normalised region for selective colour corrections.
 * All fields are in the range [0, 1] relative to the source image dimensions.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record RegionDto(double x, double y, double width, double height) {}
