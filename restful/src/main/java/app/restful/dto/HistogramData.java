package app.restful.dto;

/**
 * Per-channel histograms computed by OpenCV for the editing histogram panel.
 *
 * <p>{@code luma}, {@code red}, {@code green}, {@code blue} and {@code saturation}
 * are always present (the "core trio" the panel shows by default). {@code hue}
 * and {@code darkChannel} are populated only when advanced diagnostics are
 * requested — they back the contextual histograms surfaced for cast /
 * oversaturation / skin ({@code hue}) and haze ({@code darkChannel}).</p>
 *
 * <p>Each array has {@code bins} entries; values are raw pixel counts.</p>
 */
public record HistogramData(
        int bins,
        int[] luma,
        int[] red,
        int[] green,
        int[] blue,
        int[] saturation,
        int[] hue,
        int[] darkChannel
) {}
