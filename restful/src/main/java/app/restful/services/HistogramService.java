package app.restful.services;

import app.restful.dto.HistogramData;
import org.bytedeco.javacpp.FloatPointer;
import org.bytedeco.javacpp.IntPointer;
import org.bytedeco.javacpp.indexer.FloatIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgcodecs;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.bytedeco.opencv.opencv_core.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Computes per-channel histograms with OpenCV for the editing histogram panel.
 *
 * <p>The frontend previously built a luminance histogram in the browser from
 * canvas pixel data; this serves the same view from the already-decoded image
 * using {@code calcHist} — accurate, multi-channel, and consistent with the
 * analysis pipeline. Each channel is a single native O(N) pass.</p>
 */
@Service
public class HistogramService {

    private static final Logger log = LoggerFactory.getLogger(HistogramService.class);

    private final RawProcessingService rawService;

    public HistogramService(RawProcessingService rawService) {
        this.rawService = rawService;
    }

    /**
     * @param path     image to read (for RAW this is the decoded preview/full path)
     * @param bins     histogram resolution (caller clamps; typical 256)
     * @param advanced also compute the contextual hue + dark-channel histograms
     */
    public HistogramData compute(Path path, int bins, boolean advanced) {
        if (!Files.exists(path)) {
            throw new IllegalArgumentException("File not found: " + path);
        }

        // RAW files are not directly readable by imread — resolve to the decoded
        // image the rest of the pipeline already produced.
        Path imagePath = resolveReadable(path);

        Mat bgr = opencv_imgcodecs.imread(imagePath.toString(), opencv_imgcodecs.IMREAD_COLOR);
        if (bgr == null || bgr.empty()) {
            throw new IllegalArgumentException("Unreadable image: " + imagePath);
        }

        try {
            MatVector ch = new MatVector(3);
            opencv_core.split(bgr, ch);
            int[] blue  = hist8(ch.get(0), bins, 256f);
            int[] green = hist8(ch.get(1), bins, 256f);
            int[] red   = hist8(ch.get(2), bins, 256f);
            ch.close();

            Mat gray = new Mat();
            opencv_imgproc.cvtColor(bgr, gray, opencv_imgproc.COLOR_BGR2GRAY);
            int[] luma = hist8(gray, bins, 256f);
            gray.release();

            Mat hsv = new Mat();
            opencv_imgproc.cvtColor(bgr, hsv, opencv_imgproc.COLOR_BGR2HSV);
            MatVector hsvCh = new MatVector(3);
            opencv_core.split(hsv, hsvCh);
            int[] saturation = hist8(hsvCh.get(1), bins, 256f);
            int[] hue = advanced ? hist8(hsvCh.get(0), bins, 180f) : null; // OpenCV hue is 0..180
            hsvCh.close();
            hsv.release();

            int[] darkChannel = advanced ? darkChannelHist(bgr, bins) : null;

            return new HistogramData(bins, luma, red, green, blue, saturation, hue, darkChannel);
        } finally {
            bgr.release();
        }
    }

    /** For a RAW path, prefer the cached full decode, then the preview. */
    private Path resolveReadable(Path path) {
        if (!rawService.isRawFile(path)) return path;
        Path full = rawService.getImageCache().get(path, true);
        if (full != null && Files.exists(full)) return full;
        Path preview = rawService.getImageCache().get(path, false);
        if (preview != null && Files.exists(preview)) return preview;
        log.warn("No decoded image available for histogram: {}", path);
        return path;
    }

    /** Single-channel 8-bit histogram over [0, maxRange) → raw counts. */
    private static int[] hist8(Mat src, int bins, float maxRange) {
        Mat hist = new Mat();
        opencv_imgproc.calcHist(
                src, 1, new IntPointer(new int[]{0}),
                new Mat(),
                hist, 1, new IntPointer(new int[]{bins}),
                new FloatPointer(new float[]{0f, maxRange}));
        int[] out = new int[bins];
        FloatIndexer idx = hist.createIndexer();
        for (int i = 0; i < bins; i++) out[i] = Math.round(idx.get(i, 0));
        idx.close();
        hist.release();
        return out;
    }

    /**
     * Dark-channel histogram (per-pixel min over BGR, min-eroded). Haze lifts the
     * whole distribution off zero, so a clear image clusters near 0 while a hazy
     * one shifts right — the visual companion to the {@code Hazy} classifier.
     */
    private static int[] darkChannelHist(Mat bgr, int bins) {
        MatVector ch = new MatVector(3);
        opencv_core.split(bgr, ch);
        Mat minBG = new Mat();
        opencv_core.min(ch.get(0), ch.get(1), minBG);
        Mat minBGR = new Mat();
        opencv_core.min(minBG, ch.get(2), minBGR);
        Mat eroded = new Mat();
        Mat kernel = opencv_imgproc.getStructuringElement(opencv_imgproc.MORPH_RECT, new Size(7, 7));
        opencv_imgproc.erode(minBGR, eroded, kernel);
        int[] out = hist8(eroded, bins, 256f);
        ch.close();
        minBG.release(); minBGR.release(); eroded.release(); kernel.release();
        return out;
    }
}
