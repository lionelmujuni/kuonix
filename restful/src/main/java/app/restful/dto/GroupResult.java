package app.restful.dto;

import java.util.Map;

public record GroupResult(boolean success, String outputRoot, String csvPath, Map<ImageIssue,Integer> counts, String message) {}
