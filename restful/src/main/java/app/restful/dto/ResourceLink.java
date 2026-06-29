package app.restful.dto;

/**
 * A "learn more" link attached to a camera-feedback issue.
 *
 * @param label short link text shown in the UI
 * @param url   absolute URL; opened externally by the renderer
 * @param type  one of {@code article}, {@code video}, {@code search}
 */
public record ResourceLink(String label, String url, String type) {}
