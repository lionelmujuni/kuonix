package app.restful.services;

import app.restful.dto.ImageClassifyResult;
import app.restful.dto.ImageIssue;
import org.springframework.stereotype.Service;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;

@Service
public class GroupingService {

    public Path groupAndReport(List<ImageClassifyResult> results, Path outputRoot, boolean copy, String filterIssue) throws IOException {
        Files.createDirectories(outputRoot);
        Map<ImageIssue, Integer> counts = new EnumMap<>(ImageIssue.class);
        for (ImageIssue issue: ImageIssue.values()) counts.put(issue, 0);

        Map<ImageIssue, Path> dirs = new EnumMap<>(ImageIssue.class);

        for (ImageClassifyResult r : results) {
            Path src = Paths.get(r.path());
            for (ImageIssue issue: r.issues()) {
                // Filter: skip issues that don't match unless filterIssue is "all"
                if (!"all".equals(filterIssue) && !issue.name().equals(filterIssue)) {
                    continue;
                }
                
                counts.computeIfPresent(issue, (k,v)->v+1);
                
                // Create directory only when needed
                Path issueDir = dirs.computeIfAbsent(issue, iss -> {
                    Path d = outputRoot.resolve(iss.name());
                    try {
                        Files.createDirectories(d);
                    } catch (IOException e) {
                        throw new RuntimeException("Failed to create directory: " + d, e);
                    }
                    return d;
                });
                
                Path dst = issueDir.resolve(src.getFileName().toString());
                if (copy) Files.copy(src, dst, StandardCopyOption.REPLACE_EXISTING);
                else createSymlinkBestEffort(dst, src);
            }
        }

        // CSV
        Path csv = outputRoot.resolve("report.csv");
        writeCsv(csv, results);

        return csv;
    }

    private static void createSymlinkBestEffort(Path link, Path target) throws IOException {
        try {
            Files.createSymbolicLink(link, target.toAbsolutePath());
        } catch (UnsupportedOperationException | FileSystemException e) {
            // Windows without privilege: fallback copy
            Files.copy(target, link, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static void writeCsv(Path csv, List<ImageClassifyResult> results) throws IOException {
        try (BufferedWriter w = Files.newBufferedWriter(csv)) {
            w.write("path,width,height,medianY,meanY,p5Y,p95Y,blackPct,whitePct,stdY,meanS,p95S,labAMean,labBMean,labABDist,castAngleDeg,shadowNoiseRatio,labels\n");
            for (var r: results) {
                var f = r.features();
                w.write(String.join(",",
                        escape(r.path()),
                        String.valueOf(f.width()),
                        String.valueOf(f.height()),
                        fmt(f.medianY()), fmt(f.meanY()), fmt(f.p5Y()), fmt(f.p95Y()),
                        fmt(f.blackPct()), fmt(f.whitePct()), fmt(f.stdY()),
                        fmt(f.meanS()), fmt(f.p95S()),
                        fmt(f.labAMean()), fmt(f.labBMean()), fmt(f.labABDist()), fmt(f.castAngleDeg()),
                        fmt(f.shadowNoiseRatio()),
                        escape(r.issues().toString())
                ));
                w.write("\n");
            }
        }
    }

    private static String fmt(double v) { return String.format(java.util.Locale.US, "%.4f", v); }
    private static String escape(String s) {
        if (s.contains(",") || s.contains("\"")) return "\"" + s.replace("\"","\"\"") + "\"";
        return s;
    }
}
