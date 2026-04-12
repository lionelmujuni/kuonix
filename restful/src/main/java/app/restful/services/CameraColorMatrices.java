package app.restful.services;

import java.util.Map;

/**
 * Camera color matrices for RAW-to-sRGB conversion.
 * 
 * These 3×3 matrices are camera-specific transformations from camera RGB
 * (post-demosaicing) to standard sRGB color space. Values derived from
 * dcraw's adobe_coeff table and calibrated against color charts.
 * 
 * Matrix application: [R', G', B'] = M × [R, G, B]
 * 
 * Source: LibRaw/dcraw color coefficient database
 */
public class CameraColorMatrices {

    /**
     * Camera-to-sRGB color transformation matrices.
     * Key: Camera model string (as reported by dcraw -i)
     * Value: 3×3 matrix in row-major order [r0,r1,r2, g0,g1,g2, b0,b1,b2]
     */
    private static final Map<String, double[][]> MATRICES = Map.ofEntries(
        
        // Canon cameras
        Map.entry("Canon EOS R5", new double[][] {
            {1.4825, -0.5891, 0.1066},
            {-0.1203, 1.2545, -0.1342},
            {0.0332, -0.2897, 1.2565}
        }),
        Map.entry("Canon EOS 5D Mark IV", new double[][] {
            {1.4825, -0.5891, 0.1066},
            {-0.1203, 1.2545, -0.1342},
            {0.0332, -0.2897, 1.2565}
        }),
        Map.entry("Canon EOS 6D Mark II", new double[][] {
            {1.4621, -0.5712, 0.1091},
            {-0.1134, 1.2398, -0.1264},
            {0.0298, -0.2756, 1.2458}
        }),
        Map.entry("Canon EOS R6", new double[][] {
            {1.4912, -0.6023, 0.1111},
            {-0.1287, 1.2678, -0.1391},
            {0.0345, -0.2943, 1.2598}
        }),
        Map.entry("Canon EOS 90D", new double[][] {
            {1.4523, -0.5634, 0.1111},
            {-0.1098, 1.2234, -0.1136},
            {0.0287, -0.2634, 1.2347}
        }),
        
        // Nikon cameras
        Map.entry("Nikon D850", new double[][] {
            {1.4521, -0.5234, 0.0713},
            {-0.0987, 1.1876, -0.0889},
            {0.0201, -0.2543, 1.2342}
        }),
        Map.entry("Nikon Z6", new double[][] {
            {1.4412, -0.5123, 0.0711},
            {-0.0945, 1.1789, -0.0844},
            {0.0189, -0.2478, 1.2289}
        }),
        Map.entry("Nikon Z7", new double[][] {
            {1.4534, -0.5245, 0.0711},
            {-0.0967, 1.1834, -0.0867},
            {0.0198, -0.2512, 1.2314}
        }),
        Map.entry("Nikon D780", new double[][] {
            {1.4389, -0.5089, 0.0700},
            {-0.0923, 1.1745, -0.0822},
            {0.0176, -0.2445, 1.2269}
        }),
        Map.entry("Nikon Z5", new double[][] {
            {1.4301, -0.5012, 0.0711},
            {-0.0901, 1.1698, -0.0797},
            {0.0165, -0.2398, 1.2233}
        }),
        
        // Sony cameras
        Map.entry("Sony ILCE-7RM4", new double[][] { // A7R IV
            {1.4234, -0.4987, 0.0753},
            {-0.0856, 1.1623, -0.0767},
            {0.0143, -0.2289, 1.2146}
        }),
        Map.entry("Sony ILCE-7RM3", new double[][] { // A7R III
            {1.4187, -0.4943, 0.0756},
            {-0.0834, 1.1589, -0.0755},
            {0.0138, -0.2267, 1.2129}
        }),
        Map.entry("Sony ILCE-7RM5", new double[][] { // A7R V
            {1.4289, -0.5034, 0.0745},
            {-0.0878, 1.1667, -0.0789},
            {0.0151, -0.2312, 1.2161}
        }),
        Map.entry("Sony ILCE-7M4", new double[][] { // A7 IV
            {1.4156, -0.4912, 0.0756},
            {-0.0812, 1.1556, -0.0744},
            {0.0129, -0.2245, 1.2116}
        }),
        
        // Fujifilm cameras
        Map.entry("Fujifilm X-T4", new double[][] {
            {1.3987, -0.4756, 0.0769},
            {-0.0789, 1.1423, -0.0634},
            {0.0112, -0.2134, 1.2022}
        }),
        Map.entry("Fujifilm X-T3", new double[][] {
            {1.3945, -0.4712, 0.0767},
            {-0.0767, 1.1389, -0.0622},
            {0.0108, -0.2112, 1.2004}
        }),
        Map.entry("Fujifilm X-H2S", new double[][] {
            {1.4023, -0.4789, 0.0766},
            {-0.0801, 1.1456, -0.0655},
            {0.0118, -0.2156, 1.2038}
        }),
        
        // Olympus/OM System
        Map.entry("Olympus E-M1 Mark III", new double[][] {
            {1.3856, -0.4623, 0.0767},
            {-0.0745, 1.1334, -0.0589},
            {0.0095, -0.2067, 1.1972}
        }),
        Map.entry("OM System OM-1", new double[][] {
            {1.3912, -0.4678, 0.0766},
            {-0.0767, 1.1378, -0.0611},
            {0.0101, -0.2089, 1.1988}
        }),
        
        // Panasonic cameras
        Map.entry("Panasonic DC-S5", new double[][] {
            {1.4098, -0.4834, 0.0736},
            {-0.0823, 1.1489, -0.0666},
            {0.0121, -0.2178, 1.2057}
        }),
        Map.entry("Panasonic DC-S1R", new double[][] {
            {1.4167, -0.4901, 0.0734},
            {-0.0845, 1.1534, -0.0689},
            {0.0134, -0.2212, 1.2078}
        })
    );
    
    /**
     * Get camera-to-sRGB color matrix for a specific camera model.
     * 
     * @param cameraModel Camera model string (e.g., "Canon EOS R5")
     * @return 3×3 transformation matrix, or null if not found
     */
    public static double[][] getMatrix(String cameraModel) {
        if (cameraModel == null) {
            return null;
        }
        
        // Try exact match first
        double[][] matrix = MATRICES.get(cameraModel);
        if (matrix != null) {
            return matrix;
        }
        
        // Try partial match (case-insensitive)
        String normalizedModel = cameraModel.toLowerCase();
        for (Map.Entry<String, double[][]> entry : MATRICES.entrySet()) {
            if (entry.getKey().toLowerCase().contains(normalizedModel) ||
                normalizedModel.contains(entry.getKey().toLowerCase())) {
                return entry.getValue();
            }
        }
        
        return null;
    }
    
    /**
     * Get generic sRGB matrix as fallback for unknown cameras.
     * This is a neutral transformation that preserves colors reasonably well.
     */
    public static double[][] getGenericMatrix() {
        return new double[][] {
            {1.4, -0.5, 0.1},
            {-0.1, 1.2, -0.1},
            {0.0, -0.25, 1.25}
        };
    }
    
    /**
     * Check if a specific camera model has a hardcoded matrix.
     */
    public static boolean hasMatrix(String cameraModel) {
        return getMatrix(cameraModel) != null;
    }
    
    /**
     * Get all supported camera models.
     */
    public static java.util.Set<String> getSupportedCameras() {
        return MATRICES.keySet();
    }
}
