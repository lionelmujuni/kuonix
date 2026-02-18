package app.restful.dto;

import java.util.List;

public record GroupRequest(List<String> paths, String outputRoot, boolean copy, boolean enableSkin, String filterIssue) {}
