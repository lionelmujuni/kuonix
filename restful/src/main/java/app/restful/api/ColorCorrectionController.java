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
                "Applies 3×3 linear transformation for color space conversion (e.g., camera RGB to sRGB).",
                "Color correction matrix is a 3×3 linear transformation that maps device-dependent camera RGB to a standard color space (typically sRGB). The matrix is derived through camera calibration using color charts. It corrects for sensor spectral sensitivities and ensures color accuracy across devices. Advanced implementations use multiple matrices per illuminant (MILLA) or error buffering (WEB) for robustness. Computational complexity: O(N) with 9 multiplications per pixel.",
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
            )
        );

        return ResponseEntity.ok(methods);
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
                request.parameters()
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
                request.parameters()
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
}
