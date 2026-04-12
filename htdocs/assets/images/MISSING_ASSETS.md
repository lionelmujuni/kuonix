# Missing Assets - Image Placeholders Needed

## Required Image Files

The following image files are referenced in the website but are currently missing. Until these are provided, placeholder images or gradients will be used.

### Hero Section
- **Path**: `assets/images/hero/aurora.png`
- **Size**: 1920x1080px (Full HD recommended)
- **Purpose**: Hero section background (artistic aesthetic photograph)
- **Temporary**: Using CSS gradient placeholder

### Gallery Images
- **Path**: `assets/images/gallery/flower.jpg`
- **Size**: 800x1200px (portrait orientation)
- **Purpose**: Gallery showcase image (artistic photograph)

- **Path**: `assets/images/gallery/transfer.jpg`
- **Size**: 800x1200px (portrait orientation)
- **Purpose**: Gallery showcase image (artistic photograph)

### Workflow Screenshots (App Interface)
- **Path**: `assets/images/screenshots/workflow-1-upload.png`
- **Size**: 1200x800px
- **Purpose**: Upload & Analyze page showing drag/drop interface and file list
- **Content**: Actual KUONIX app screenshot
- **Current**: Placeholder needed

- **Path**: `assets/images/screenshots/workflow-2-library.png`
- **Size**: 1200x800px
- **Purpose**: Library grid view showing thumbnails with issue tags
- **Content**: Actual KUONIX app screenshot
- **Current**: Placeholder needed

- **Path**: `assets/images/screenshots/workflow-3-export.png`
- **Size**: 1200x800px
- **Purpose**: Export dialog with folder organization and editor path configuration
- **Content**: Actual KUONIX app screenshot
- **Current**: Placeholder needed

### Color Lab Screenshot (App Interface)
- **Path**: `assets/images/screenshots/colorlab-interface.png`
- **Size**: 1400x800px (16:9 aspect ratio)
- **Purpose**: Color Lab split-view with before/after preview, algorithm dropdown, and sliders
- **Content**: Actual KUONIX app screenshot
- **Current**: Placeholder needed

### Custom SVG Icons (Replace Emoji Placeholders)

**Issue Category Icons** (inline SVG in index.html):
1. Exposure icon - Currently ☀️
2. Contrast icon - Currently ◐
3. Saturation icon - Currently 💧
4. Color Cast icon - Currently 🎨
5. Noise icon - Currently 📊
- **Size**: 60x60px display
- **Style**: Minimalist, modern, using `var(--accent-cyan)` color

**RAW Support Icon** (inline SVG in index.html):
- Camera icon - Currently 📷
- **Size**: 120x120px display
- **Style**: Match website design language

### Icons/Favicons
- **Path**: `assets/icons/favicon.ico`
- **Size**: 32x32px
- **Purpose**: Browser tab icon

- **Path**: `assets/icons/favicon-16x16.png`
- **Size**: 16x16px

- **Path**: `assets/icons/favicon-32x32.png`
- **Size**: 32x32px

- **Path**: `assets/icons/apple-touch-icon.png`
- **Size**: 180x180px
- **Purpose**: iOS home screen icon

## Priority Order

1. **High Priority**: App screenshots (workflow-1, workflow-2, workflow-3, colorlab-interface) - showcase actual functionality
2. **Medium Priority**: Custom SVG icons - replace emoji placeholders for professional appearance
3. **Medium Priority**: Hero and gallery images - aesthetic photographs for visual appeal
4. **Low Priority**: Favicons - branding enhancement

## How to Add Images

1. Place image files in the appropriate directory as listed above
2. Ensure proper naming (case-sensitive on some servers)
3. Recommended formats:
   - Photos: JPG (optimized, 80-85% quality)
   - Graphics/UI: PNG
   - Icons: SVG (inline) or PNG
   - Consider adding WebP versions for better performance

## Image Optimization

Before adding images, optimize them:
- Use tools like TinyPNG, ImageOptim, or Squoosh
- Target file sizes: <200KB for photos, <50KB for icons
- Consider responsive variants for mobile

## Notes

- **Workflow screenshots** should show the real KUONIX Electron app interface
- **Hero/gallery images** should be aesthetic photographs (not app screenshots)
- **Custom SVG icons** will improve visual design over emoji placeholders
- All images should be optimized for web (compressed without quality loss)

