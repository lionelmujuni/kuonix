package app.restful.dto;

import java.util.List;

public record ImageClassifyResult(
        String path,
        ImageFeatures features,
        List<ImageIssue> issues
) {}