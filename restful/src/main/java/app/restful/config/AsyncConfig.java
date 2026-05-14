package app.restful.config;

import java.util.concurrent.Executor;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Asynchronous task configuration for RAW image processing.
 * Provides a dedicated thread pool for background RAW decoding operations
 * to prevent blocking the main request threads.
 */
@Configuration
@EnableAsync
@EnableScheduling
public class AsyncConfig {

    /**
     * Thread pool executor for RAW image decoding tasks.
     * 
     * Configuration:
     * - Core pool: 2 threads (maintains even when idle)
     * - Max pool: 4 threads (scales up under load)
     * - Queue capacity: 100 tasks (buffers pending decode operations)
     * 
     * This prevents resource exhaustion when processing multiple large RAW files
     * while allowing concurrent decoding for improved throughput.
     * 
     * @return Configured thread pool executor for RAW processing
     */
    @Bean(name = "rawDecodeExecutor")
    public Executor rawDecodeExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("raw-decode-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(60);
        executor.initialize();
        return executor;
    }

    @Bean(name = "analysisExecutor")
    public Executor analysisExecutor() {
        int cores = Runtime.getRuntime().availableProcessors();
        int max = Math.max(2, Math.min(cores, 4));
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(max);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("analysis-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(120);
        executor.initialize();
        return executor;
    }
}
