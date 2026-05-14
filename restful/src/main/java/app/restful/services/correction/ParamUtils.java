package app.restful.services.correction;

import java.util.Map;

public final class ParamUtils {

    private ParamUtils() {}

    public static double getDouble(Map<String, Object> params, String key, double defaultValue) {
        Object v = params.get(key);
        if (v instanceof Number n) return n.doubleValue();
        return defaultValue;
    }

    public static String getString(Map<String, Object> params, String key, String defaultValue) {
        Object v = params.get(key);
        if (v == null) return defaultValue;
        return v.toString();
    }

    /**
     * Accepts {@code Boolean}, numeric (0 = false, non-zero = true), and
     * strings ("true"/"false", "1"/"0", "yes"/"no"). Anything else falls back
     * to {@code defaultValue}.
     */
    public static boolean getBoolean(Map<String, Object> params, String key, boolean defaultValue) {
        Object v = params.get(key);
        if (v == null) return defaultValue;
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.doubleValue() != 0.0;
        String s = v.toString().trim().toLowerCase();
        return switch (s) {
            case "true", "1", "yes", "on" -> true;
            case "false", "0", "no", "off" -> false;
            default -> defaultValue;
        };
    }
}
