package app.restful.services.correction.saturation;

import java.util.Map;

import org.bytedeco.javacpp.indexer.UByteIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.global.opencv_imgproc;
import org.bytedeco.opencv.opencv_core.Mat;
import org.bytedeco.opencv.opencv_core.MatVector;
import org.springframework.stereotype.Component;

import app.restful.services.correction.CorrectionAlgorithm;
import app.restful.services.correction.ParamUtils;

/**
 * Smart-saturation ("vibrance"): boosts low-saturation pixels more than
 * already-saturated ones, with optional skin-tone protection.
 *
 * <p>Boost formula per pixel (HSV domain, S in [0,255]):
 * <pre>newS = s + a * (255 - s) * (1 - s/255)</pre>
 * where {@code a} is {@code amount} for non-skin pixels and
 * {@code amount * 0.3} for pixels matching skin hue/sat ranges.</p>
 */
@Component
public class VibranceAlgorithm implements CorrectionAlgorithm {

    public static final String ID = "vibrance";

    // HSV skin heuristic: two hue ranges (wrap), saturation window.
    private static final int SKIN_HUE_LOW_MAX  = 25;
    private static final int SKIN_HUE_HIGH_MIN = 165;
    private static final int SKIN_SAT_MIN      = 30;
    private static final int SKIN_SAT_MAX      = 180;
    private static final double SKIN_PROTECT_FACTOR = 0.3;

    @Override
    public String id() { return ID; }

    @Override
    public Mat apply(Mat bgr, Map<String, Object> params) {
        double amount = ParamUtils.getDouble(params, "amount", 0.5);
        boolean skinProtect = ParamUtils.getBoolean(params, "skinProtect", true);
        return applyCore(bgr, amount, skinProtect);
    }

    public static Mat applyCore(Mat bgr, double amount, boolean skinProtect) {
        if (amount < 0) amount = 0;
        if (amount > 2) amount = 2;

        Mat hsv = new Mat();
        opencv_imgproc.cvtColor(bgr, hsv, opencv_imgproc.COLOR_BGR2HSV);

        MatVector channels = new MatVector(3);
        opencv_core.split(hsv, channels);

        Mat h = channels.get(0);
        Mat s = channels.get(1);
        Mat v = channels.get(2);

        int rows = s.rows();
        int cols = s.cols();
        UByteIndexer hIdx = h.createIndexer();
        UByteIndexer sIdx = s.createIndexer();

        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                int hv = hIdx.get(y, x);
                int sv = sIdx.get(y, x);
                double a = amount;
                if (skinProtect && isSkin(hv, sv)) {
                    a *= SKIN_PROTECT_FACTOR;
                }
                double delta = a * (255.0 - sv) * (1.0 - sv / 255.0);
                int ns = (int) Math.round(sv + delta);
                if (ns < 0)   ns = 0;
                if (ns > 255) ns = 255;
                sIdx.put(y, x, ns);
            }
        }
        hIdx.release();
        sIdx.release();

        MatVector merged = new MatVector(h, s, v);
        Mat hsvOut = new Mat();
        opencv_core.merge(merged, hsvOut);

        Mat result = new Mat();
        opencv_imgproc.cvtColor(hsvOut, result, opencv_imgproc.COLOR_HSV2BGR);

        channels.close();
        merged.close();
        hsvOut.release();
        hsv.release();

        return result;
    }

    private static boolean isSkin(int h, int s) {
        if (s < SKIN_SAT_MIN || s > SKIN_SAT_MAX) return false;
        return h <= SKIN_HUE_LOW_MAX || h >= SKIN_HUE_HIGH_MIN;
    }
}
