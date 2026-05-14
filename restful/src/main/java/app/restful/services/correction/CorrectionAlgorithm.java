package app.restful.services.correction;

import java.util.Map;

import org.bytedeco.opencv.opencv_core.Mat;

/**
 * Strategy interface for color correction algorithms.
 *
 * <p>Each algorithm is a Spring {@code @Component} picked up by
 * {@link CorrectionRegistry}. REST API method ids and AI tool method strings
 * route through the registry to the matching implementation.</p>
 *
 * <p>Implementations must not mutate {@code bgr}. The returned {@link Mat}
 * is newly allocated; the caller releases it.</p>
 */
public interface CorrectionAlgorithm {

    String id();

    Mat apply(Mat bgr, Map<String, Object> params);
}
