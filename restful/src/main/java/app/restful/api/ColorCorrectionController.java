package app.restful.api;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import app.restful.dto.ColorCorrectionMethod;
import app.restful.dto.ColorCorrectionRequest;
import app.restful.dto.ColorCorrectionResult;
import app.restful.dto.ExportRequest;
import app.restful.services.CameraColorMatrices;
import app.restful.services.ColorCorrectionService;
import app.restful.services.StorageService;

@RestController
@RequestMapping("/color-correct")
@CrossOrigin(origins = "*")
public class ColorCorrectionController {

    private final ColorCorrectionService colorCorrection;
    private final StorageService storage;

    public ColorCorrectionController(ColorCorrectionService colorCorrection, StorageService storage) {
        this.colorCorrection = colorCorrection;
        this.storage = storage;
    }

    /**
     * Get available color correction methods with parameter definitions.
     */
    @GetMapping("/methods")
    public ResponseEntity<List<ColorCorrectionMethod>> getMethods() {
        List<ColorCorrectionMethod> methods = List.of(
            new ColorCorrectionMethod(
                "gray_world",
                "Gray World",
                "Assumes the average color of the scene is gray. Balances channels so their averages become equal.",
                "Gray World is a simple yet effective white balance algorithm that operates on the assumption that the average reflectance in a scene is achromatic (gray). It computes the mean of each RGB channel and applies gain factors to equalize them. This removes color cast caused by illumination. Computational complexity: O(N) single pass. Effective for scenes with diverse colors, but fails on monochromatic subjects.",
                List.of()
            ),
            new ColorCorrectionMethod(
                "white_patch",
                "White Patch (Max RGB)",
                "Assumes the brightest patch is white. Scales channels so their maximum values become equal.",
                "White Patch (also called Max RGB) assumes that the brightest point in the scene is a white or achromatic surface (specular highlight). It finds the maximum value in each channel and applies scaling so all maxima align. This method is sensitive to bright colored objects being mistaken for white, but works well when true white highlights exist. Computational complexity: O(N) single pass for finding maxima.",
                List.of()
            ),
            new ColorCorrectionMethod(
                "shades_of_gray",
                "Shades of Gray",
                "Generalization using Minkowski p-norm (p=6 recommended). Balances between Gray World and White Patch.",
                "Shades of Gray extends Gray World by using the p-th power mean (Minkowski norm) instead of arithmetic mean. By tuning p between 1 (Gray World) and infinity (White Patch), it provides a robust compromise. Literature recommends p=6 for optimal performance across diverse scenes. This adaptive approach reduces failure cases of both extreme methods. Computational complexity: O(N) with power operations per pixel.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "p",
                        "Minkowski p-norm",
                        6.0,
                        1.0,
                        12.0,
                        0.5,
                        "Power for norm calculation. p=1 is Gray World, p→∞ is White Patch. Recommended: 6.0"
                    )
                )
            ),
            new ColorCorrectionMethod(
                "exposure",
                "Exposure Adjustment",
                "Corrects brightness by applying uniform gain across all channels. Positive gain brightens, negative darkens.",
                "Exposure adjustment addresses under/overexposure by applying a uniform scaling factor to all RGB channels. Unlike white balance which uses per-channel gains, exposure uses one gain to change brightness without altering color balance. Auto-exposure typically aims to map 18% gray to mid-tone values. Simple global gain is effective for moderate corrections but cannot recover clipped highlights or completely black shadows. Computational complexity: O(N) multiplication per pixel.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "gain",
                        "Exposure Gain",
                        1.0,
                        0.1,
                        3.0,
                        0.05,
                        "Brightness multiplier. 1.0 = no change, >1.0 = brighter, <1.0 = darker"
                    )
                )
            ),
            new ColorCorrectionMethod(
                "saturation",
                "Saturation Enhancement",
                "Adjusts color vividness in HSV space. Factor >1 increases saturation, <1 decreases.",
                "Saturation enhancement operates in HSV color space by scaling the Saturation channel while preserving Hue and Value. This makes colors more vivid (factor >1) or more muted (factor <1) without changing their identity or brightness. Useful for compensating desaturation from lighting or sensor characteristics. Excessive saturation can cause gamut clipping and unnatural appearance. Computational complexity: O(N) with RGB↔HSV conversion overhead.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "factor",
                        "Saturation Factor",
                        1.2,
                        0.0,
                        2.0,
                        0.05,
                        "Saturation multiplier. 1.0 = no change, >1.0 = more vivid, <1.0 = more muted"
                    )
                )
            ),
            new ColorCorrectionMethod(
                "color_matrix",
                "Color Matrix Transform",
                "3×3 linear transform from your camera's native colour to standard sRGB. Each row defines how one output channel (R, G, B) is built from the three input channels.",
                "Every digital camera sees colour slightly differently — its red, green and blue sensors have spectral sensitivities that do not match the human eye. A Colour Correction Matrix (CCM) is the 3×3 linear map that rotates camera-native RGB into a standard display space such as sRGB. The matrix is calibrated once per camera: photograph a reference target (a Macbeth ColorChecker) under a known illuminant, then solve for the 3×3 that minimises the squared error between the camera's captured patches and the known reference values. Reading the matrix: row i, column j says how much of input channel j contributes to output channel i. The diagonal keeps each channel mostly itself; the off-diagonals cross-mix to compensate for the sensor's spectral overlap. A well-formed CCM has rows summing to 1.0, which means pure white in stays pure white out (the white-point-preserving constraint). The camera presets offered here come from dcraw's published adobe_coeff table. Computational complexity: O(N) with 9 multiplications per pixel.",
                List.of(
                    new ColorCorrectionMethod.Parameter("m0", "Matrix [0,0]", 1.0, -2.0, 2.0, 0.01, "Top-left element"),
                    new ColorCorrectionMethod.Parameter("m1", "Matrix [0,1]", 0.0, -2.0, 2.0, 0.01, "Top-center element"),
                    new ColorCorrectionMethod.Parameter("m2", "Matrix [0,2]", 0.0, -2.0, 2.0, 0.01, "Top-right element"),
                    new ColorCorrectionMethod.Parameter("m3", "Matrix [1,0]", 0.0, -2.0, 2.0, 0.01, "Middle-left element"),
                    new ColorCorrectionMethod.Parameter("m4", "Matrix [1,1]", 1.0, -2.0, 2.0, 0.01, "Middle-center element"),
                    new ColorCorrectionMethod.Parameter("m5", "Matrix [1,2]", 0.0, -2.0, 2.0, 0.01, "Middle-right element"),
                    new ColorCorrectionMethod.Parameter("m6", "Matrix [2,0]", 0.0, -2.0, 2.0, 0.01, "Bottom-left element"),
                    new ColorCorrectionMethod.Parameter("m7", "Matrix [2,1]", 0.0, -2.0, 2.0, 0.01, "Bottom-center element"),
                    new ColorCorrectionMethod.Parameter("m8", "Matrix [2,2]", 1.0, -2.0, 2.0, 0.01, "Bottom-right element")
                )
            ),
            new ColorCorrectionMethod(
                "temperature_tint",
                "Temperature & Tint",
                "Manual white balance using colour temperature (Kelvin) and green/magenta tint. Standard in every professional RAW editor.",
                "Temperature & Tint gives direct manual control over white balance. Colour temperature (in Kelvin) shifts the image from warm/orange (low K) to cool/blue (high K) using the Planckian locus — the curve traced by a black-body radiator. Tint adjusts the perpendicular axis, adding green (+) or magenta (−) to compensate for non-blackbody light sources such as fluorescent tubes. Per-channel gains are normalised so no channel clips. This covers the same two-parameter space as the WB sliders in Adobe Camera Raw and Lightroom.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "tempK",
                        "Colour Temperature (K)",
                        5500.0,
                        2000.0,
                        10000.0,
                        50.0,
                        "Kelvin value. 2000–3500 K = warm/candlelight, 5000–6500 K = daylight, 7000–10000 K = overcast/shade"
                    ),
                    new ColorCorrectionMethod.Parameter(
                        "tint",
                        "Tint",
                        0.0,
                        -1.0,
                        1.0,
                        0.05,
                        "Green ↔ Magenta bias. Positive = more green, negative = more magenta"
                    )
                )
            ),
            new ColorCorrectionMethod(
                "color_distribution_alignment",
                "Color Distribution Alignment",
                "Matches source image's color statistics (mean, std) to a reference image. Enables consistent color grading across multiple images.",
                "Color Distribution Alignment (Dal'Col et al. 2023) is a reference-based method that matches the statistical color distribution of the source image to a target/reference image. It operates in LAB color space for perceptual uniformity. For each LAB channel, it: (1) subtracts source mean, (2) scales by std ratio, (3) adds target mean. This effectively transfers the color 'look' from reference to source. Use cases: multi-camera calibration, texture mapping, batch consistency, style transfer. Works best when images have similar content. Computational complexity: O(N) per image for statistics, O(N) for transformation.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "referenceImagePath",
                        "Reference Image",
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        "Path to reference image whose color style will be matched (file path parameter)"
                    ),
                    new ColorCorrectionMethod.Parameter(
                        "strength",
                        "Correction Strength",
                        1.0,
                        0.0,
                        1.0,
                        0.05,
                        "Blend factor. 1.0 = full correction, 0.0 = no change"
                    )
                )
            ),
            new ColorCorrectionMethod(
                "clahe_lab",
                "CLAHE (Local Contrast)",
                "Contrast-Limited Adaptive Histogram Equalization on the L* channel. Boosts local contrast without shifting color.",
                "CLAHE (Zuiderveld, 1994) equalizes the histogram in overlapping tiles and clips bins above a threshold to suppress noise amplification. Applied to L* only, chroma is preserved so no color drift. Default clipLimit=2.0 and tileGrid=8 give tasteful local-contrast enhancement on most images. Raise clipLimit for flatter images; raise tileGrid for smoother transitions on smooth gradients. Computational complexity: O(N) per image.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "clipLimit",
                        "Clip Limit",
                        2.0,
                        1.0,
                        8.0,
                        0.1,
                        "Per-tile histogram clip threshold. Higher = more contrast, more risk of noise amplification"
                    ),
                    new ColorCorrectionMethod.Parameter(
                        "tileGrid",
                        "Tile Grid Size",
                        8.0,
                        2.0,
                        32.0,
                        1.0,
                        "Image is divided into tileGrid × tileGrid tiles. Smaller = more local, larger = smoother"
                    )
                )
            ),
            new ColorCorrectionMethod(
                "hsl_targeted",
                "HSL Targeted (Per-Hue Saturation)",
                "Boost or pull back saturation on a specific hue band (red/yellow/green/cyan/blue/magenta) without touching the others.",
                "HSL-Targeted selective saturation drives six Gaussian-feathered hue bands centred on the primaries and secondaries (0°, 60°, 120°, 180°, 240°, 300°). Per pixel, the saturation multiplier is 1 + Σ δᵢ · wᵢ(h), where wᵢ(h) = exp(−d(h, cᵢ)² / 2σ²) with σ≈20°. Bands overlap softly so transitions stay continuous — a yellow-orange pixel gets weighted input from both the red and yellow sliders. Common workflows: pull an oversaturated red dress back (redSat=-0.3) while leaving green foliage intact; deepen a blue sky without spilling into skin tones. Each delta in [-1, 0] desaturates; (0, 1] boosts. All zeros is identity. Complexity: O(N) with a 180-entry hue LUT.",
                List.of(
                    new ColorCorrectionMethod.Parameter("redSat",     "Red Saturation",     0.0, -1.0, 1.0, 0.05, "Red band delta. Negative desaturates, positive boosts."),
                    new ColorCorrectionMethod.Parameter("yellowSat",  "Yellow Saturation",  0.0, -1.0, 1.0, 0.05, "Yellow band delta."),
                    new ColorCorrectionMethod.Parameter("greenSat",   "Green Saturation",   0.0, -1.0, 1.0, 0.05, "Green band delta."),
                    new ColorCorrectionMethod.Parameter("cyanSat",    "Cyan Saturation",    0.0, -1.0, 1.0, 0.05, "Cyan band delta."),
                    new ColorCorrectionMethod.Parameter("blueSat",    "Blue Saturation",    0.0, -1.0, 1.0, 0.05, "Blue band delta."),
                    new ColorCorrectionMethod.Parameter("magentaSat", "Magenta Saturation", 0.0, -1.0, 1.0, 0.05, "Magenta band delta.")
                )
            ),
            new ColorCorrectionMethod(
                "vibrance",
                "Vibrance (Smart Saturation)",
                "Boosts low-saturation pixels more than already-vivid ones, with optional skin-tone protection.",
                "Vibrance is a non-linear saturation boost: the gain per pixel scales with (1 - s)² so dull colors get lifted while already-saturated colors barely move. Skin protection damps the boost inside typical skin hue (H ∈ [0°, 25°] ∪ [330°, 360°]) and saturation ([30, 180]) ranges by a factor of 0.3, avoiding the 'sunburn' look plain saturation produces on portraits. Recommended for dull outdoor/landscape images and any portrait where generic saturation is too aggressive. Computational complexity: O(N).",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "amount",
                        "Amount",
                        0.5,
                        0.0,
                        2.0,
                        0.05,
                        "Strength of the vibrance boost. 0 = identity, 0.5 = moderate, >1 = strong"
                    ),
                    new ColorCorrectionMethod.Parameter(
                        "skinProtect",
                        "Skin Protection",
                        1.0,
                        0.0,
                        1.0,
                        1.0,
                        "1 = damp boost on skin tones (recommended for portraits), 0 = treat all hues equally"
                    )
                )
            ),
            new ColorCorrectionMethod(
                "ffcc",
                "FFCC (Daylight Prior WB)",
                "Log-chroma histogram illuminant estimation with a Gaussian daylight prior. Falls back to Gray World on low-confidence scenes.",
                "Simplified Fast Fourier Colour Constancy (Barron & Tsai, CVPR 2017). Builds a 64×64 log-chroma histogram, weights it with a Gaussian prior centred on the daylight illuminant, and picks the peak as the estimated light source. Falls back to Gray World when confidence is below threshold.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "confidenceThreshold",
                        "Confidence Threshold",
                        0.5,
                        0.0,
                        1.0,
                        0.05,
                        "Below this confidence the algorithm falls back to Gray World. Lower = trust the estimate more."
                    )
                )
            ),
            new ColorCorrectionMethod(
                "ace",
                "ACE (Auto Colour Equalization)",
                "Simultaneously removes colour casts, corrects exposure and boosts local contrast via local normalisation.",
                "Fast Automatic Colour Equalization (Rizzi et al., 2002) models the visual system's local adaptation. Each channel is re-centred and rescaled relative to a local neighbourhood. Strong one-click Auto starting point for images with mixed lighting.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "alpha",
                        "Correction Strength",
                        5.0,
                        1.0,
                        10.0,
                        0.5,
                        "Higher clips the normalised range more aggressively. 5 covers ±1σ in the mapped output."
                    ),
                    new ColorCorrectionMethod.Parameter(
                        "subsample",
                        "Window Size",
                        4.0,
                        1.0,
                        8.0,
                        1.0,
                        "Controls local window radius. Higher = smaller window, faster, less globally consistent."
                    )
                )
            ),
            new ColorCorrectionMethod(
                "bm3d",
                "BM3D Denoise",
                "Block-Matching 3D denoising. Best-in-class noise removal, optionally applied only to shadow areas.",
                "BM3D (Dabov et al., 2007) groups similar image patches into 3D stacks, applies a transform-domain collaborative filter, and reconstructs. Applied only to shadows by default to preserve natural texture in bright regions.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "sigma",
                        "Noise Sigma",
                        15.0,
                        1.0,
                        100.0,
                        1.0,
                        "Expected noise standard deviation. Match to your image's actual noise level."
                    ),
                    new ColorCorrectionMethod.Parameter(
                        "shadowMaskOnly",
                        "Shadow Mask Only",
                        1.0,
                        0.0,
                        1.0,
                        1.0,
                        "1 = apply denoising only in dark shadow areas. 0 = denoise the full image."
                    )
                )
            ),
            new ColorCorrectionMethod(
                "dark_channel_dehaze",
                "Dark Channel Dehaze",
                "Removes haze and fog using the dark-channel prior (He, Sun & Tang, CVPR 2009).",
                "Most pixels in haze-free outdoor patches contain at least one near-zero channel. The dark channel detects hazy regions where all channels are elevated. Atmospheric light is estimated from the brightest dark-channel pixels, and scene radiance is recovered per pixel.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "omega",
                        "Haze Removal Strength",
                        0.95,
                        0.5,
                        1.0,
                        0.05,
                        "Lower values keep more atmospheric haze for a natural look. 0.95 = full removal."
                    ),
                    new ColorCorrectionMethod.Parameter(
                        "t0",
                        "Transmission Floor",
                        0.1,
                        0.01,
                        0.5,
                        0.01,
                        "Minimum transmission value. Prevents division noise in genuinely opaque regions."
                    )
                )
            ),
            new ColorCorrectionMethod(
                "local_laplacian",
                "Local Laplacian",
                "Edge-aware tone compression and detail enhancement via Local Laplacian filtering (Paris et al., SIGGRAPH 2011).",
                "Operates on the L* channel only. For each pyramid level, similar-brightness patches get detail enhancement while edges straddling a large tone difference are compressed without ringing. Excellent for scenes with both shadow and highlight detail.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "alpha",
                        "Detail Remap",
                        0.4,
                        0.1,
                        1.0,
                        0.05,
                        "<1 enhances micro-contrast (recommended), >1 smooths fine texture."
                    ),
                    new ColorCorrectionMethod.Parameter(
                        "beta",
                        "Tone Compression",
                        0.5,
                        0.1,
                        1.0,
                        0.05,
                        "Compression of large-amplitude edges. Lower = stronger compression."
                    ),
                    new ColorCorrectionMethod.Parameter(
                        "sigma",
                        "Edge Threshold",
                        0.2,
                        0.05,
                        0.5,
                        0.05,
                        "Normalised luminance threshold above which the edge compression branch fires."
                    )
                )
            ),
            new ColorCorrectionMethod(
                "highlight_recovery",
                "Highlight Recovery",
                "Recovers blown highlights by fusing virtual under-exposures using Mertens exposure fusion.",
                "Synthesises virtual darker exposures from the source and fuses them with the Mertens algorithm. The weight maps favour well-exposed pixels, pulling back clipped highlight detail without darkening the rest of the frame.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "strength",
                        "Recovery Strength",
                        1.0,
                        0.0,
                        1.0,
                        0.05,
                        "Blend with the original. 1.0 = full recovery, 0.0 = no change."
                    )
                )
            ),
            new ColorCorrectionMethod(
                "msrcr_retinex",
                "MSRCR Retinex",
                "Multi-Scale Retinex with Colour Restoration. Lifts shadow detail and suppresses colour casts across multiple scales.",
                "MSRCR (Rahman/Jobson, 1996–97) separates illumination from reflectance at three Gaussian scales, then restores per-pixel colour balance via a log-ratio Colour Restoration Factor. Effective for low-light images and scenes with strongly uneven illumination.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "strength",
                        "Strength",
                        0.7,
                        0.0,
                        1.0,
                        0.05,
                        "Blend factor between corrected and original. 0.7 is a good general starting point."
                    ),
                    new ColorCorrectionMethod.Parameter(
                        "colorRestoration",
                        "Colour Restoration",
                        1.2,
                        0.0,
                        2.0,
                        0.1,
                        "Strength of the colour restoration factor. Higher restores more chroma in dark areas."
                    )
                )
            ),
            new ColorCorrectionMethod(
                "reinhard_tonemap",
                "Reinhard Tone Map",
                "Photographic tone mapping (Reinhard et al., SIGGRAPH 2002). Film-like highlight compression preserving mid-tones.",
                "The classical Reinhard global operator. Scales luminance by the key value, then maps with the Reinhard curve to compress highlights while preserving mid-tones. Operates on luminance only so hue and saturation are preserved.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "keyValue",
                        "Key Value",
                        0.18,
                        0.05,
                        0.5,
                        0.01,
                        "Target average brightness. 0.18 is middle gray (Zone V). Higher = brighter output."
                    ),
                    new ColorCorrectionMethod.Parameter(
                        "whitePoint",
                        "White Point",
                        1.0,
                        0.5,
                        4.0,
                        0.1,
                        "Burn-out threshold. Higher = more highlight detail is preserved before clipping."
                    )
                )
            ),
            new ColorCorrectionMethod(
                "mantiuk_tonemap",
                "Mantiuk Tone Map",
                "Perceptual tone mapping (Mantiuk et al., 2008). Compresses dynamic range per the human contrast sensitivity function.",
                "Wraps OpenCV's TonemapMantiuk. Consistently scores well in tone-mapping comparisons on mixed-luminance scenes. Stronger local contrast preservation than Reinhard at similar global compression.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "saturation",
                        "Saturation",
                        1.0,
                        0.0,
                        2.0,
                        0.05,
                        "Colour saturation of the tonemapped output. 1.0 = unchanged."
                    ),
                    new ColorCorrectionMethod.Parameter(
                        "contrastScale",
                        "Contrast Scale",
                        0.75,
                        0.1,
                        1.0,
                        0.05,
                        "Global contrast compression factor. Lower = stronger compression."
                    )
                )
            ),
            new ColorCorrectionMethod(
                "gamut_compress",
                "Gamut Compress",
                "ACES-style soft gamut compression. Pulls over-saturated chroma back toward neutral without changing hue.",
                "Applies the Parametric Reinhard soft-knee from the Academy ACES Gamut Compress LMT. Compression is applied to per-channel distance-from-achromatic, preserving hue. Useful for fixing neon colours that print or display incorrectly.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "threshold",
                        "Threshold",
                        0.8,
                        0.1,
                        0.99,
                        0.01,
                        "Distance-from-achromatic above which compression starts. ACES default: 0.8."
                    ),
                    new ColorCorrectionMethod.Parameter(
                        "limit",
                        "Limit",
                        1.2,
                        0.5,
                        2.0,
                        0.05,
                        "Asymptote for the soft knee. Values above this are compressed to approach but not reach it."
                    )
                )
            ),
            new ColorCorrectionMethod(
                "harmonization",
                "Colour Harmonization",
                "Snaps pixel hues toward a classical harmony template (Cohen-Or, SIGGRAPH 2006).",
                "Partitions the hue wheel into one or two narrow bands per the chosen template and rotates out-of-template hues to the nearest allowed hue. Saturated pixels are shifted more aggressively than near-neutrals.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "offsetDeg",
                        "Template Rotation (°)",
                        0.0,
                        0.0,
                        360.0,
                        5.0,
                        "Rotates the harmony template around the hue wheel. 0 = anchored to red."
                    )
                )
            ),
            new ColorCorrectionMethod(
                "memory_color_skin",
                "Memory Colour Skin",
                "Shifts skin-pixel chroma toward a preferred memory-colour target in L*C*h° without touching luminance.",
                "Identifies skin pixels via HSV hue/saturation ranges, then blends their a*b* chroma vector toward a reference skin centroid (default: L*=68, C*=28, h°=38 — mid-tone Caucasian from CIE TC 8-08). Preserves luminance entirely.",
                List.of(
                    new ColorCorrectionMethod.Parameter(
                        "adaptationStrength",
                        "Adaptation Strength",
                        0.6,
                        0.0,
                        1.0,
                        0.05,
                        "How far to pull skin chroma toward the target. 0 = no change, 1 = full snap."
                    )
                )
            )
        );

        return ResponseEntity.ok(methods);
    }

    /**
     * Response DTO for the camera-matrix preset list consumed by the Color
     * Matrix Transform UI. Each entry is one picker option; matrix is a
     * row-major 3x3 where row = output channel (R/G/B) and column = input.
     */
    public record CameraMatrixPreset(String name, double[][] matrix) {}

    /**
     * List of camera colour-correction matrix presets, sourced from the
     * existing {@link CameraColorMatrices} registry plus a generic sRGB
     * fallback. Used by the Color Lab UI to populate a preset dropdown so
     * users do not have to hand-tune nine values.
     */
    @GetMapping("/camera-matrices")
    public ResponseEntity<List<CameraMatrixPreset>> getCameraMatrices() {
        java.util.List<CameraMatrixPreset> presets = new java.util.ArrayList<>();
        presets.add(new CameraMatrixPreset("Generic sRGB", CameraColorMatrices.getGenericMatrix()));

        java.util.List<String> names = new java.util.ArrayList<>(CameraColorMatrices.getSupportedCameras());
        java.util.Collections.sort(names);
        for (String name : names) {
            double[][] matrix = CameraColorMatrices.getMatrix(name);
            if (matrix != null) {
                presets.add(new CameraMatrixPreset(name, matrix));
            }
        }

        return ResponseEntity.ok(presets);
    }

    /**
     * Preview color correction - returns Base64 encoded JPEG for display.
     */
    @PostMapping("/preview")
    public ResponseEntity<ColorCorrectionResult> preview(@RequestBody ColorCorrectionRequest request) {
        try {
            Path imagePath = Paths.get(request.imagePath());
            
            if (!java.nio.file.Files.exists(imagePath)) {
                return ResponseEntity.badRequest().body(
                    new ColorCorrectionResult("", false, "Image file not found: " + request.imagePath(), null)
                );
            }

            String base64Image = colorCorrection.processImageToBase64(
                imagePath,
                request.method(),
                request.parameters(),
                request.region()
            );

            return ResponseEntity.ok(
                new ColorCorrectionResult(base64Image, true, "Preview generated successfully", null)
            );

        } catch (Exception e) {
            String errorMsg = e.getClass().getSimpleName() + ": " + e.getMessage();
            System.err.println("Color correction preview error: " + errorMsg);
            e.printStackTrace();
            return ResponseEntity.badRequest().body(
                new ColorCorrectionResult("", false, errorMsg, null)
            );
        }
    }

    /**
     * Commit a correction as the new working baseline so subsequent corrections
     * chain on top of it. Writes the result to the hidden working-copy directory
     * (not the user-visible workspace root) and returns both the new path and
     * base64 so the frontend can update its viewer without a second round-trip.
     */
    @PostMapping("/commit")
    public ResponseEntity<ColorCorrectionResult> commit(@RequestBody ColorCorrectionRequest request) {
        try {
            Path inputPath = Paths.get(request.imagePath());

            if (!java.nio.file.Files.exists(inputPath)) {
                return ResponseEntity.badRequest().body(
                    new ColorCorrectionResult("", false, "Image file not found: " + request.imagePath(), null)
                );
            }

            // Derive step number from current filename: foo_step2_... → step 3
            String filename = inputPath.getFileName().toString();
            int lastDot = filename.lastIndexOf('.');
            String baseName = lastDot > 0 ? filename.substring(0, lastDot) : filename;

            int step = 1;
            String rootName = baseName;
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("^(.*)_step(\\d+)_.+$").matcher(baseName);
            if (m.matches()) {
                rootName = m.group(1);
                step = Integer.parseInt(m.group(2)) + 1;
            }

            String outputFilename = rootName + "_step" + step + "_" + request.method() + ".jpg";
            Path outputPath = storage.getWorkingDir().resolve(outputFilename);

            colorCorrection.processAndSaveImage(
                inputPath,
                outputPath,
                request.method(),
                request.parameters(),
                request.region()
            );

            byte[] savedBytes = java.nio.file.Files.readAllBytes(outputPath);
            String base64 = "data:image/jpeg;base64," + java.util.Base64.getEncoder().encodeToString(savedBytes);

            return ResponseEntity.ok(
                new ColorCorrectionResult(base64, true, "Correction committed", outputPath.toString())
            );

        } catch (Exception e) {
            String errorMsg = e.getClass().getSimpleName() + ": " + e.getMessage();
            System.err.println("Color correction commit error: " + errorMsg);
            e.printStackTrace();
            return ResponseEntity.badRequest().body(
                new ColorCorrectionResult("", false, errorMsg, null)
            );
        }
    }

    /**
     * Apply color correction and save to workspace.
     */
    @PostMapping("/apply")
    public ResponseEntity<ColorCorrectionResult> apply(@RequestBody ColorCorrectionRequest request) {
        try {
            Path inputPath = Paths.get(request.imagePath());
            
            if (!java.nio.file.Files.exists(inputPath)) {
                return ResponseEntity.badRequest().body(
                    new ColorCorrectionResult("", false, "Image file not found: " + request.imagePath(), null)
                );
            }

            // Generate output filename with .jpg extension
            String filename = inputPath.getFileName().toString();
            String baseName;
            int lastDot = filename.lastIndexOf('.');
            if (lastDot > 0) {
                baseName = filename.substring(0, lastDot);
            } else {
                baseName = filename;
            }
            String outputFilename = baseName + "_" + request.method() + ".jpg";

            // Save to workspace
            Path workspaceDir = storage.getWorkspaceDir();
            Path outputPath = workspaceDir.resolve(outputFilename);

            colorCorrection.processAndSaveImage(
                inputPath,
                outputPath,
                request.method(),
                request.parameters(),
                request.region()
            );

            return ResponseEntity.ok(
                new ColorCorrectionResult(
                    "", 
                    true, 
                    "Image saved successfully", 
                    outputPath.toString()
                )
            );

        } catch (Exception e) {
            String errorMsg = e.getClass().getSimpleName() + ": " + e.getMessage();
            System.err.println("Color correction apply error: " + errorMsg);
            e.printStackTrace();
            return ResponseEntity.badRequest().body(
                new ColorCorrectionResult("", false, errorMsg, null)
            );
        }
    }

    /**
     * Export an image with format selection (jpg/png/tiff), quality, custom folder, and naming.
     */
    @PostMapping("/export")
    public ResponseEntity<ColorCorrectionResult> export(@RequestBody ExportRequest req) {
        try {
            Path inputPath = Paths.get(req.imagePath());
            if (!java.nio.file.Files.exists(inputPath)) {
                return ResponseEntity.badRequest().body(
                    new ColorCorrectionResult("", false, "Image file not found: " + req.imagePath(), null)
                );
            }

            String format  = (req.format()   != null) ? req.format()   : "jpg";
            int    quality = (req.quality()   != null) ? req.quality()  : 95;
            String naming  = (req.naming()    != null) ? req.naming()   : "suffix";
            String method  = (req.method()    != null) ? req.method()   : "exposure";
            java.util.Map<String, Object> params = (req.parameters() != null)
                ? req.parameters()
                : java.util.Map.of("gain", 1.0);

            // Resolve output directory.
            Path outDir;
            if (req.targetDir() != null && !req.targetDir().isBlank()) {
                outDir = Paths.get(req.targetDir());
                java.nio.file.Files.createDirectories(outDir);
            } else {
                outDir = storage.getWorkspaceDir();
            }

            String outputFilename = ColorCorrectionService.buildExportFilename(inputPath, method, format, naming);
            Path outputPath = outDir.resolve(outputFilename);

            colorCorrection.processAndSaveImageWithFormat(inputPath, outputPath, method, params, format, quality);

            return ResponseEntity.ok(
                new ColorCorrectionResult("", true, "Exported to " + outputPath.getFileName(), outputPath.toString())
            );

        } catch (Exception e) {
            String errorMsg = e.getClass().getSimpleName() + ": " + e.getMessage();
            System.err.println("Export error: " + errorMsg);
            e.printStackTrace();
            return ResponseEntity.badRequest().body(
                new ColorCorrectionResult("", false, errorMsg, null)
            );
        }
    }
}
