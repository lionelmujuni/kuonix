package app.restful.dto;

import java.util.List;

public record ImageClassifyRequest(List<String> paths, boolean enableSkin) {}
