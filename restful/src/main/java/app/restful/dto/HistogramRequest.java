package app.restful.dto;

/**
 * Request for {@code POST /images/histogram}. {@code bins} defaults to 256 and
 * is clamped server-side; {@code advanced} requests the contextual histograms
 * (hue, dark-channel) in addition to the core channels.
 */
public record HistogramRequest(String path, Integer bins, Boolean advanced) {}
