package app.restful.api;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Base64;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import app.restful.dto.ClassifyResponse;
import app.restful.dto.GroupRequest;
import app.restful.dto.GroupResult;
import app.restful.dto.ImageClassifyRequest;
import app.restful.dto.ImageClassifyResult;
import app.restful.dto.ImageIssue;
import app.restful.dto.ImageUrlRequest;
import app.restful.dto.ImageUrlResponse;
import app.restful.dto.UploadResponse;
import app.restful.services.GroupingService;
import app.restful.services.ImageAnalysisService;
import app.restful.services.ImageClassifierService;
import app.restful.services.StorageService;

@RestController
@RequestMapping("/images")
public class ImageAnalysisController {

    private final StorageService storage;
    private final ImageAnalysisService analysis;
    private final ImageClassifierService classifier;
    private final GroupingService grouping;
    private final java.util.concurrent.Executor analysisExecutor;

    public ImageAnalysisController(StorageService storage, ImageAnalysisService analysis, ImageClassifierService classifier, GroupingService grouping,
            @org.springframework.beans.factory.annotation.Qualifier("analysisExecutor") java.util.concurrent.Executor analysisExecutor) {
        this.storage = storage;
        this.analysis = analysis;
        this.classifier = classifier;
        this.grouping = grouping;
        this.analysisExecutor = analysisExecutor;
    }

    // Upload images and return absolute paths (renderer already expects this)
    @PostMapping("/upload")
    public ResponseEntity<UploadResponse> upload(@RequestParam("files") List<MultipartFile> files) {
        try {
            if (files == null || files.isEmpty()) {
                return ResponseEntity.badRequest().body(new UploadResponse(false, List.of(), "No files provided"));
            }
            var paths = storage.saveImages(files);
            System.out.println("Uploaded " + paths.size() + " files to workspace");
            return ResponseEntity.ok(new UploadResponse(true, paths, "Uploaded"));
        } catch (Exception e) {
            String msg = e.getClass().getSimpleName() + ": " + e.getMessage();
            System.err.println("Upload error: " + msg);
            e.printStackTrace();
            return ResponseEntity.badRequest().body(new UploadResponse(false, List.of(), msg));
        }
    }

    // Classify by absolute paths with SSE progress updates
    @PostMapping(value = "/classify-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter classifyWithProgress(@RequestBody ImageClassifyRequest req) {
        SseEmitter emitter = new SseEmitter(300000L); // 5 minute timeout
        
        analysisExecutor.execute(() -> {
            try {
                boolean enableSkin = req.enableSkin();
                List<ImageClassifyResult> results = new ArrayList<>();
                int total = req.paths().size();
                
                for (int i = 0; i < total; i++) {
                    String p = req.paths().get(i);
                    Path path = Paths.get(p);
                    
                    if (!java.nio.file.Files.exists(path)) {
                        String escapedPath = p.replace("\\", "\\\\").replace("\"", "\\\"");
                        emitter.send(SseEmitter.event()
                            .name("error")
                            .data("{\"message\":\"File not found: " + escapedPath + "\"}"));
                        emitter.completeWithError(new RuntimeException("File not found: " + p));
                        return;
                    }
                    
                    var feats = analysis.compute(path, enableSkin);
                    var labels = classifier.classify(feats);
                    results.add(new ImageClassifyResult(p, feats, labels));
                    
                    // Send progress update
                    int current = i + 1;
                    int percentage = (current * 100) / total;
                    String escapedPath = p.replace("\\", "\\\\").replace("\"", "\\\"");
                    emitter.send(SseEmitter.event()
                        .name("progress")
                        .data("{\"current\":" + current + ",\"total\":" + total + ",\"percentage\":" + percentage + ",\"path\":\"" + escapedPath + "\"}"));
                }
                
                // Send final results
                ClassifyResponse response = new ClassifyResponse(true, results, "OK");
                emitter.send(SseEmitter.event()
                    .name("complete")
                    .data(response));
                emitter.complete();
                
            } catch (Exception e) {
                try {
                    String escapedMessage = e.getMessage() != null 
                        ? e.getMessage().replace("\\", "\\\\").replace("\"", "\\\"")
                        : "Unknown error";
                    emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"message\":\"" + escapedMessage + "\"}"));
                } catch (IOException ex) {
                    // Ignore
                }
                emitter.completeWithError(e);
            }
        });
        
        return emitter;
    }

    // Classify by absolute paths (original non-streaming endpoint)
    @PostMapping("/classify")
    public ResponseEntity<ClassifyResponse> classify(@RequestBody ImageClassifyRequest req) {
        try {
            boolean enableSkin = req.enableSkin();
            List<ImageClassifyResult> results = new ArrayList<>();
            for (String p : req.paths()) {
                Path path = Paths.get(p);
                if (!java.nio.file.Files.exists(path)) {
                    String msg = "File not found: " + p;
                    System.err.println("Classification error: " + msg);
                    return ResponseEntity.badRequest().body(new ClassifyResponse(false, List.of(), msg));
                }
                var feats = analysis.compute(path, enableSkin);
                var labels = classifier.classify(feats);
                results.add(new ImageClassifyResult(p, feats, labels));
            }
            return ResponseEntity.ok(new ClassifyResponse(true, results, "OK"));
        } catch (Exception e) {
            String msg = e.getClass().getSimpleName() + ": " + e.getMessage();
            System.err.println("Classification error: " + msg);
            e.printStackTrace();
            return ResponseEntity.badRequest().body(new ClassifyResponse(false, List.of(), msg));
        }
    }

    // Classify and group into label folders + CSV report
    @PostMapping("/group")
    public ResponseEntity<GroupResult> group(@RequestBody GroupRequest req) {
        try {
            // Validate filterIssue parameter
            if (req.filterIssue() == null || req.filterIssue().trim().isEmpty()) {
                return ResponseEntity.badRequest()
                    .body(new GroupResult(false, req.outputRoot(), null, Map.of(), "filterIssue parameter is required"));
            }
            
            boolean enableSkin = req.enableSkin();
            List<ImageClassifyResult> results = new ArrayList<>();
            for (String p : req.paths()) {
                var feats = analysis.compute(Paths.get(p), enableSkin);
                var labels = classifier.classify(feats);
                results.add(new ImageClassifyResult(p, feats, labels));
            }
            Path csv = grouping.groupAndReport(results, Path.of(req.outputRoot()), req.copy(), req.filterIssue());

            // count summary
            Map<ImageIssue,Integer> counts = new EnumMap<>(ImageIssue.class);
            for (ImageIssue issue: ImageIssue.values()) counts.put(issue, 0);
            for (var r: results) for (var i: r.issues()) counts.computeIfPresent(i,(k,v)->v+1);

            return ResponseEntity.ok(new GroupResult(true, req.outputRoot(), csv.toAbsolutePath().toString(), counts, "Grouped"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(new GroupResult(false, req.outputRoot(), null, Map.of(), e.getMessage()));
        }
    }

    /**
     * Regenerate data URLs for persisted images.
     * Used by frontend to restore library images after app restart.
     * 
     * @param req Request containing list of absolute file paths
     * @return Response with Base64 data URLs for each image
     */
    @PostMapping("/get-urls")
    public ResponseEntity<ImageUrlResponse> getImageUrls(@RequestBody ImageUrlRequest req) {
        try {
            List<app.restful.dto.ImageUrlData> results = new ArrayList<>();
            
            for (String pathStr : req.paths()) {
                Path path = Paths.get(pathStr);
                
                if (!Files.exists(path)) {
                    results.add(new app.restful.dto.ImageUrlData(pathStr, null, false));
                    continue;
                }
                
                // Read file and encode to Base64 data URL
                byte[] bytes = Files.readAllBytes(path);
                String base64 = Base64.getEncoder().encodeToString(bytes);
                
                // Detect MIME type (simplified - assumes JPEG/PNG)
                String mimeType = "image/jpeg";
                String ext = pathStr.toLowerCase();
                if (ext.endsWith(".png")) mimeType = "image/png";
                else if (ext.endsWith(".webp")) mimeType = "image/webp";
                else if (ext.endsWith(".bmp")) mimeType = "image/bmp";
                else if (ext.endsWith(".tif") || ext.endsWith(".tiff")) mimeType = "image/tiff";
                
                String dataUrl = "data:" + mimeType + ";base64," + base64;
                results.add(new app.restful.dto.ImageUrlData(pathStr, dataUrl, true));
            }
            
            System.out.println("Regenerated URLs for " + results.stream().filter(r -> r.exists()).count() + " images");
            
            return ResponseEntity.ok(
                new ImageUrlResponse(true, results, "URLs generated")
            );
            
        } catch (Exception e) {
            String msg = e.getClass().getSimpleName() + ": " + e.getMessage();
            System.err.println("URL regeneration error: " + msg);
            e.printStackTrace();
            return ResponseEntity.badRequest().body(
                new ImageUrlResponse(false, List.of(), msg)
            );
        }
    }
}
