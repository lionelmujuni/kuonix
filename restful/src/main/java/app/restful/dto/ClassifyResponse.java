package app.restful.dto;

import java.util.List;

public record ClassifyResponse(boolean success, List<ImageClassifyResult> results, String message) {}