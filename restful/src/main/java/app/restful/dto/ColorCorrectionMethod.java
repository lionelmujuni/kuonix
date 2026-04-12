package app.restful.dto;

import java.util.List;

public record ColorCorrectionMethod(
        String id,
        String name,
        String description,
        String theory,
        List<Parameter> parameters
) {
    public record Parameter(
            String name,
            String label,
            double defaultValue,
            double min,
            double max,
            double step,
            String description
    ) {}
}
