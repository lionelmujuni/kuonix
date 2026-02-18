package app.restful.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.servlet.MultipartConfigFactory;
import org.springframework.boot.web.servlet.server.ServletWebServerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.unit.DataSize;

import jakarta.servlet.MultipartConfigElement;

/**
 * Configuration for multipart file upload limits.
 * Configures Spring Boot multipart settings and Tomcat connector to support large batch uploads.
 */
@Configuration
public class MultipartConfig {

    private static final Logger logger = LoggerFactory.getLogger(MultipartConfig.class);
    
    // Configuration constants
    private static final long MAX_FILE_SIZE_GB = 100;
    private static final long MAX_REQUEST_SIZE_GB = 1000;
    private static final int MAX_FILE_COUNT = 500000;
    private static final long MAX_POST_SIZE_BYTES = 1073741824000L; // 100GB

    @Bean
    public MultipartConfigElement multipartConfigElement() {
        try {
            logger.info("Configuring multipart upload limits:");
            logger.info("  - Max file size: {}GB", MAX_FILE_SIZE_GB);
            logger.info("  - Max request size: {}GB", MAX_REQUEST_SIZE_GB);
            logger.info("  - File size threshold: 2KB");
            
            MultipartConfigFactory factory = new MultipartConfigFactory();
            factory.setMaxFileSize(DataSize.ofGigabytes(MAX_FILE_SIZE_GB));
            factory.setMaxRequestSize(DataSize.ofGigabytes(MAX_REQUEST_SIZE_GB));
            factory.setFileSizeThreshold(DataSize.ofKilobytes(2));
            
            MultipartConfigElement config = factory.createMultipartConfig();
            logger.info("Multipart configuration created successfully");
            return config;
            
        } catch (Exception e) {
            logger.error("Failed to create multipart configuration", e);
            throw new IllegalStateException("Could not configure multipart file upload limits", e);
        }
    }

    /**
     * Configure embedded Tomcat connector to allow large batch file uploads.
     * This sets maxParameterCount and maxPostSize to handle thousands of files per request.
     */
    @Bean
    public ServletWebServerFactory servletContainer() {
        try {
            logger.info("Configuring Tomcat connector for batch uploads:");
            logger.info("  - Max parameter count: {}", MAX_FILE_COUNT);
            logger.info("  - Max POST size: {} bytes ({}GB)", MAX_POST_SIZE_BYTES, MAX_REQUEST_SIZE_GB);
            
            // Verify system property is set
            String fileCountMax = System.getProperty("org.apache.tomcat.util.http.fileupload.FileUploadBase.FILE_COUNT_MAX");
            if (fileCountMax != null) {
                logger.info("  - System property FILE_COUNT_MAX: {}", fileCountMax);
            } else {
                logger.warn("  - WARNING: System property FILE_COUNT_MAX not set. This may limit file uploads.");
                logger.warn("  - Ensure RestfulApplication.main() sets this property before SpringApplication.run()");
            }
            
            TomcatServletWebServerFactory factory = new TomcatServletWebServerFactory();
            
            factory.addConnectorCustomizers(connector -> {
                try {
                    logger.debug("Applying Tomcat connector customizations...");
                    
                    // Set max parameter count to allow many file uploads
                    connector.setProperty("maxParameterCount", String.valueOf(MAX_FILE_COUNT));
                    logger.debug("  - Set maxParameterCount to {}", MAX_FILE_COUNT);
                    
                    // Set max post size to 100GB in bytes
                    connector.setProperty("maxPostSize", String.valueOf(MAX_POST_SIZE_BYTES));
                    logger.debug("  - Set maxPostSize to {} bytes", MAX_POST_SIZE_BYTES);
                    
                    logger.info("Tomcat connector customization applied successfully");
                    
                } catch (Exception e) {
                    logger.error("Failed to customize Tomcat connector", e);
                    logger.error("  - This may result in upload failures for large batches");
                    // Don't throw - allow application to start with default settings
                }
            });
            
            logger.info("Tomcat web server factory configured successfully");
            return factory;
            
        } catch (Exception e) {
            logger.error("Critical error: Failed to create ServletWebServerFactory", e);
            logger.error("  - Application may not start correctly");
            logger.error("  - File uploads will be severely limited");
            throw new IllegalStateException("Could not configure embedded Tomcat server", e);
        }
    }
}
