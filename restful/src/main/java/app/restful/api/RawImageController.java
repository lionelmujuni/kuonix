package app.restful.api;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.bytedeco.opencv.global.opencv_imgcodecs;
import org.bytedeco.opencv.opencv_core.Mat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fasterxml.jackson.databind.ObjectMapper;

import app.restful.api.dto.DecodeProgressEvent;
import app.restful.api.dto.RawImageInfo;
import app.restful.api.dto.RawUploadResponse;
import app.restful.services.RawProcessingService;
import app.restful.services.StorageService;

/**
 * REST controller for RAW image processing.
 * 
 * Endpoints:
 * - POST /images/upload-raw: Upload RAW files, get preview + task IDs
 * - GET /images/decode-stream: SSE for batched decode progress
 */
@RestController
@RequestMapping("/images")
@CrossOrigin(origins = "*")
public class RawImageController {

    private static final Logger log = LoggerFactory.getLogger(RawImageController.class);
    
    private final RawProcessingService rawService;
    private final StorageService storageService;
    private final ObjectMapper objectMapper;
    
    public RawImageController(RawProcessingService rawService, 
                             StorageService storageService,
                             ObjectMapper objectMapper) {
        this.rawService = rawService;
        this.storageService = storageService;
        this.objectMapper = objectMapper;
    }
    
    /**
     * Upload RAW images with two-phase processing:
     * 1. Store original RAW file
     * 2. Generate half-size preview (synchronous, <2s per file)
     * 3. Queue full-resolution decode (asynchronous)
     * 
     * Returns preview paths for immediate display and task IDs for progress tracking.
     */
    @PostMapping("/upload-raw")
    public ResponseEntity<RawUploadResponse> uploadRaw(
            @RequestParam("files") List<MultipartFile> files) {
        
        log.info("Received RAW upload request: {} files", files.size());
        
        List<RawImageInfo> imageInfos = new ArrayList<>();
        
        try {
            for (MultipartFile file : files) {
                if (file.isEmpty()) {
                    continue;
                }
                
                String filename = file.getOriginalFilename();
                if (filename == null) {
                    continue;
                }
                
                // Validate RAW format
                Path tempPath = Path.of(filename);
                if (!rawService.isRawFile(tempPath)) {
                    log.warn("Rejected non-RAW file: {}", filename);
                    continue;
                }
                
                // Store original RAW file
                List<String> savedPaths = storageService.saveImages(List.of(file));
                if (savedPaths.isEmpty()) {
                    log.error("Failed to save RAW file: {}", filename);
                    continue;
                }
                Path rawPath = Paths.get(savedPaths.get(0));
                log.info("Stored RAW file: {}", rawPath);
                
                // Generate preview (synchronous, fast)
                Path previewPath;
                try {
                    previewPath = rawService.decodePreview(rawPath);
                } catch (Exception e) {
                    log.error("Preview decode failed for {}: {}", filename, e.getMessage());
                    throw new RuntimeException("Failed to generate preview for " + filename, e);
                }
                
                // Get preview dimensions
                Mat previewMat = opencv_imgcodecs.imread(previewPath.toString());
                int width = 0, height = 0;
                if (previewMat != null && !previewMat.empty()) {
                    width = previewMat.cols();
                    height = previewMat.rows();
                    previewMat.release();
                }
                
                // Queue full decode asynchronously
                String taskId = rawService.generateTaskId();
                // Register task BEFORE async call to prevent race condition with SSE stream
                rawService.registerTask(taskId, rawPath);
                rawService.decodeFullAsync(rawPath, taskId);
                
                // Extract camera model (optional, may be slow)
                String cameraModel = null; // Could parse from EXIF if needed
                
                imageInfos.add(new RawImageInfo(
                    previewPath.toString(),
                    rawPath.toString(),
                    taskId,
                    width,
                    height,
                    cameraModel
                ));
                
                log.info("RAW image processed: {} -> preview: {}, task: {}", 
                    filename, previewPath.getFileName(), taskId);
            }
            
            if (imageInfos.isEmpty()) {
                return ResponseEntity.badRequest()
                    .body(new RawUploadResponse(false, List.of(), "No valid RAW files uploaded"));
            }
            
            return ResponseEntity.ok(new RawUploadResponse(true, imageInfos, "RAW images uploaded"));
            
        } catch (Exception e) {
            log.error("RAW upload failed", e);
            return ResponseEntity.internalServerError()
                .body(new RawUploadResponse(false, List.of(), "Upload failed: " + e.getMessage()));
        }
    }
    
    /**
     * Server-Sent Events endpoint for batched decode progress.
     * Monitors multiple decode tasks simultaneously and streams multiplexed progress updates.
     * 
     * Event format:
     * - progress: {"taskId":"...", "status":"decoding", "progress":45, "currentFile":"..."}
     * - complete: {"taskId":"...", "status":"complete", "fullPath":"...", "width":6000, "height":4000}
     * - error: {"taskId":"...", "status":"error", "error":"..."}
     * - summary: Final event when all tasks complete
     */
    @GetMapping(value = "/decode-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter decodeStream(@RequestParam List<String> taskIds) {
        log.info("Starting decode stream for {} tasks", taskIds.size());
        
        if (taskIds.size() > 100) {
            throw new IllegalArgumentException("Maximum 100 tasks per stream");
        }
        
        SseEmitter emitter = new SseEmitter(300000L); // 5 minute timeout
        
        new Thread(() -> {
            try {
                int completedCount = 0;
                int errorCount = 0;
                Set<String> missingTasks = new HashSet<>();
                Set<String> processedTasks = new HashSet<>();
                
                // Poll task statuses until all complete
                while (completedCount + errorCount + missingTasks.size() < taskIds.size()) {
                    for (String taskId : taskIds) {
                        // Skip if already processed
                        if (processedTasks.contains(taskId)) {
                            continue;
                        }
                        
                        RawProcessingService.DecodeTask task = rawService.getTask(taskId);
                        
                        if (task == null) {
                            // Task not found - might be from old session or already removed
                            if (!missingTasks.contains(taskId)) {
                                log.warn("Task not found: {} (will be counted as missing)", taskId);
                                missingTasks.add(taskId);
                            }
                            continue;
                        }
                        
                        String status = task.getStatus();
                        
                        if ("decoding".equals(status) || "pending".equals(status)) {
                            // Send progress update
                            DecodeProgressEvent event = DecodeProgressEvent.progress(
                                taskId,
                                task.getProgress(),
                                task.getRawPath().getFileName().toString()
                            );
                            
                            emitter.send(SseEmitter.event()
                                .name("progress")
                                .data(objectMapper.writeValueAsString(event)));
                            
                        } else if ("complete".equals(status)) {
                            // Send completion event
                            Path outputPath = task.getOutputPath();
                            if (outputPath != null) {
                                Mat mat = opencv_imgcodecs.imread(outputPath.toString());
                                int width = 0, height = 0;
                                if (mat != null && !mat.empty()) {
                                    width = mat.cols();
                                    height = mat.rows();
                                    mat.release();
                                }
                                
                                DecodeProgressEvent event = DecodeProgressEvent.complete(
                                    taskId,
                                    outputPath.toString(),
                                    width,
                                    height
                                );
                                
                                emitter.send(SseEmitter.event()
                                    .name("complete")
                                    .data(objectMapper.writeValueAsString(event)));
                                
                                completedCount++;
                                processedTasks.add(taskId);
                                rawService.removeTask(taskId);
                            }
                            
                        } else if ("error".equals(status)) {
                            // Send error event
                            DecodeProgressEvent event = DecodeProgressEvent.error(
                                taskId,
                                task.getError()
                            );
                            
                            emitter.send(SseEmitter.event()
                                .name("error")
                                .data(objectMapper.writeValueAsString(event)));
                            
                            errorCount++;
                            processedTasks.add(taskId);
                            rawService.removeTask(taskId);
                        }
                    }
                    
                    // Don't poll too frequently
                    Thread.sleep(1000);
                }
                
                // Send summary event
                String summary = String.format(
                    "{\"completed\":%d,\"errors\":%d,\"missing\":%d,\"total\":%d}",
                    completedCount, errorCount, missingTasks.size(), taskIds.size()
                );
                
                emitter.send(SseEmitter.event()
                    .name("summary")
                    .data(summary));
                
                emitter.complete();
                log.info("Decode stream completed: {} succeeded, {} failed, {} missing", 
                    completedCount, errorCount, missingTasks.size());
                
            } catch (Exception e) {
                log.error("Decode stream error", e);
                try {
                    String errorMsg = e.getMessage().replace("\"", "\\\"");
                    emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"message\":\"" + errorMsg + "\"}"));
                } catch (Exception ignored) {
                }
                emitter.completeWithError(e);
            }
        }).start();
        
        return emitter;
    }
}
