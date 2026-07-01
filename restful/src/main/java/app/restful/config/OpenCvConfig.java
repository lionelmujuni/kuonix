package app.restful.config;

import org.bytedeco.opencv.global.opencv_core;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;

/**
 * Caps OpenCV's internal parallelism at startup.
 *
 * OpenCV defaults every native call to all available cores. The app already
 * parallelises at the image level (up to 4 concurrent analyses plus decode
 * conversions), so uncapped per-call threading multiplies out to several
 * times the machine's core count. Workers × per-call threads ≈ cores keeps
 * total CPU demand bounded.
 */
@Configuration
public class OpenCvConfig {

    private static final Logger log = LoggerFactory.getLogger(OpenCvConfig.class);

    @PostConstruct
    public void capOpenCvThreads() {
        int cores = Runtime.getRuntime().availableProcessors();
        int threads = Math.max(1, cores / 4);
        opencv_core.setNumThreads(threads);
        log.info("OpenCV internal threads capped at {} ({} cores available)", threads, cores);
    }
}
