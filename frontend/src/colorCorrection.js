import { showToast }   from './toast.js';
import { ButtonLoader } from './uiState.js';
import {
  selectedLibraryImages,
  isSelectionMode,
  exitSelectionMode,
} from './selection.js';

// ── Module state ──────────────────────────────────────────────────────────────
const CC_PRESETS_KEY = 'colorCorrectionPresets';

let ccCurrentMethod     = null;
let ccCurrentImage      = null;
let ccCurrentImagePath  = null;
let ccCurrentParameters = {};
let ccMethods           = [];
let ccShowBefore        = false;
let ccDebounceTimer     = null;

const methodCategories = {
  white_balance: ['gray_world', 'white_patch', 'shades_of_gray'],
  exposure:      ['exposure'],
  saturation:    ['saturation'],
  advanced:      ['color_matrix', 'color_distribution_alignment'],
};
let ccCurrentCategory = null;

let ccSessionImages      = [];
let ccCurrentImageIndex  = 0;
let ccCorrectionResults  = {};

let _libraryImages;

// ── Preview zoom state ────────────────────────────────────────────────────────
let ccPreviewContainer = null;

let ccFitScale     = 1;
let ccCurrentScale = 1;

let ccIsDragging   = false;
let ccDragStartX   = 0;
let ccDragStartY   = 0;
let ccScrollStartX = 0;
let ccScrollStartY = 0;

// ── DOM refs (populated in initColorCorrection) ───────────────────────────────
let colorCorrectionView, ccMethodBtns, ccOriginalImage, ccCorrectedImage,
    ccNoImage, ccImageContainer, ccLoading, ccBeforeAfterToggle, ccResetBtn,
    ccMethodControls, ccTheoryContent, ccPresetName, ccSavePresetBtn,
    ccPresetList, ccGridView, ccPreviewView, ccImagesGrid, ccBackToGridBtn,
    ccPreviewImageName, ccToolGridView, ccToolPreviewView, ccCategoryBtns,
    ccMethodDropdown, librarySelectionControls, ccNavigationBar, ccPrevImageBtn,
    ccNextImageBtn, ccCurrentImageNum, ccTotalImages, ccRemoveFromLabBtn,
    ccSaveCurrentBtn, ccApplyToAllBtn, ccSaveAllBtn;

// ── Public API ────────────────────────────────────────────────────────────────

export function initColorCorrection({ libraryImages }) {
  _libraryImages = libraryImages;
  _initDomRefs();
  _wireEventListeners();
  initPreviewZoom();
  renderPresetList();
  console.log('Color Correction Lab initialised');
}

export function showColorCorrectionView() {
  console.log('Switching to Color Correction view');
  const libraryGrid          = document.getElementById('libraryGrid');
  const libraryScrollContainer = document.getElementById('libraryScrollContainer');
  const emptyState           = document.getElementById('libraryEmptyState');

  if (libraryGrid)          libraryGrid.style.display = 'none';
  if (colorCorrectionView)  colorCorrectionView.style.display = 'grid';
  if (libraryScrollContainer) libraryScrollContainer.style.display = 'none';
  if (librarySelectionControls) librarySelectionControls.style.display = 'none';
  if (emptyState)           emptyState.style.display = 'none';

  if (ccMethods.length === 0) loadColorCorrectionMethods();
}

export function showLibraryGrid() {
  console.log('Switching to Library Grid view');
  const libraryGrid            = document.getElementById('libraryGrid');
  const libraryScrollContainer = document.getElementById('libraryScrollContainer');

  if (libraryGrid)          libraryGrid.style.display = 'block';
  if (colorCorrectionView)  colorCorrectionView.style.display = 'none';
  if (libraryScrollContainer) libraryScrollContainer.style.display = 'block';
  if (librarySelectionControls) librarySelectionControls.style.display = 'flex';
}

/**
 * Open a single library image directly in the Color Correction Lab
 * (called from the library grid onImageClick callback).
 */
export function openSingleImageInLab(img) {
  ccSessionImages = [{
    id:          img.id,
    name:        img.name,
    path:        img.path,
    url:         img.url,
    base64:      img.base64,
    issues:      img.issues      || [],
    features:    img.features    || null,
    aspectRatio: img.aspectRatio || 1.5,
    isRaw:       img.isRaw       || false,
  }];
  ccCurrentImageIndex = 0;
  ccCorrectionResults = {};
  showColorCorrectionView();
  loadImageAtIndex(0);
  switchToPreviewView();
}

// ── Private: init DOM refs ────────────────────────────────────────────────────

function _initDomRefs() {
  colorCorrectionView    = document.getElementById('colorCorrectionView');
  ccMethodBtns           = document.querySelectorAll('.cc-method-btn');
  ccOriginalImage        = document.getElementById('ccOriginalImage');
  ccCorrectedImage       = document.getElementById('ccCorrectedImage');
  ccNoImage              = document.getElementById('ccNoImage');
  ccImageContainer       = document.getElementById('ccImageContainer');
  ccLoading              = document.getElementById('ccLoading');
  ccBeforeAfterToggle    = document.getElementById('ccBeforeAfterToggle');
  ccResetBtn             = document.getElementById('ccResetBtn');
  ccMethodControls       = document.getElementById('ccMethodControls');
  ccTheoryContent        = document.getElementById('ccTheoryContent');
  ccPresetName           = document.getElementById('ccPresetName');
  ccSavePresetBtn        = document.getElementById('ccSavePresetBtn');
  ccPresetList           = document.getElementById('ccPresetList');
  ccGridView             = document.getElementById('ccGridView');
  ccPreviewView          = document.getElementById('ccPreviewView');
  ccImagesGrid           = document.getElementById('ccImagesGrid');
  ccBackToGridBtn        = document.getElementById('ccBackToGridBtn');
  ccPreviewImageName     = document.getElementById('ccPreviewImageName');
  ccToolGridView         = document.getElementById('ccToolGridView');
  ccToolPreviewView      = document.getElementById('ccToolPreviewView');
  ccCategoryBtns         = document.querySelectorAll('.cc-method-btn[data-category]');
  ccMethodDropdown       = document.getElementById('ccMethodDropdown');
  librarySelectionControls = document.getElementById('librarySelectionControls');
  ccNavigationBar        = document.getElementById('ccNavigationBar');
  ccPrevImageBtn         = document.getElementById('ccPrevImageBtn');
  ccNextImageBtn         = document.getElementById('ccNextImageBtn');
  ccCurrentImageNum      = document.getElementById('ccCurrentImageNum');
  ccTotalImages          = document.getElementById('ccTotalImages');
  ccRemoveFromLabBtn     = document.getElementById('ccRemoveFromLabBtn');
  ccSaveCurrentBtn       = document.getElementById('ccSaveCurrentBtn');
  ccApplyToAllBtn        = document.getElementById('ccApplyToAllBtn');
  ccSaveAllBtn           = document.getElementById('ccSaveAllBtn');

  console.log('Color Correction elements check:');
  console.log('- ccMethodBtns:', ccMethodBtns.length);
  console.log('- colorCorrectionView:', colorCorrectionView ? 'found' : 'NULL');
  console.log('- ccGridView:', ccGridView ? 'found' : 'NULL');
  console.log('- ccPreviewView:', ccPreviewView ? 'found' : 'NULL');
}

// ── Private: event wiring ─────────────────────────────────────────────────────

function _wireEventListeners() {
  // Category selection
  ccCategoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      console.log('Category button clicked:', btn.dataset.category);
      const category = btn.dataset.category;
      ccCategoryBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ccCurrentCategory = category;
      populateMethodDropdown(category);
    });
  });

  // Algorithm dropdown
  if (ccMethodDropdown) {
    ccMethodDropdown.addEventListener('change', (e) => {
      const method = e.target.value;
      if (method) {
        console.log('Method selected from dropdown:', method);
        ccCurrentMethod = method;
        updateMethodControls(method);
        updateTheoryContent(method);
        if (ccCurrentImagePath) {
          const methodInfo = ccMethods.find(m => m.id === method);
          const requiresReference = methodInfo?.parameters.some(p => p.name === 'referenceImagePath');
          if (!requiresReference || ccCurrentParameters.referenceImagePath) {
            applyColorCorrection();
          }
        }
      }
    });
  }

  // Before/After toggle
  if (ccBeforeAfterToggle) {
    ccBeforeAfterToggle.addEventListener('click', () => {
      ccShowBefore = !ccShowBefore;
      if (ccShowBefore) {
        ccOriginalImage.style.display  = 'block';
        ccCorrectedImage.style.display = 'none';
        ccBeforeAfterToggle.innerHTML  = '<i class="bi bi-eye-slash"></i> Showing Before';
      } else {
        ccOriginalImage.style.display  = 'none';
        ccCorrectedImage.style.display = 'block';
        ccBeforeAfterToggle.innerHTML  = '<i class="bi bi-eye"></i> Before/After';
      }
    });
  }

  // Reset parameters
  if (ccResetBtn) {
    ccResetBtn.addEventListener('click', () => {
      const methodInfo = ccMethods.find(m => m.id === ccCurrentMethod);
      if (methodInfo) {
        ccCurrentParameters = {};
        methodInfo.parameters.forEach(param => {
          ccCurrentParameters[param.name] = param.defaultValue;
        });
        updateMethodControls(ccCurrentMethod);
        if (ccCurrentImagePath) {
          const requiresReference = methodInfo.parameters.some(p => p.name === 'referenceImagePath');
          if (!requiresReference || ccCurrentParameters.referenceImagePath) {
            applyColorCorrection();
          }
        }
      }
    });
  }

  // Preset save
  if (ccSavePresetBtn) {
    ccSavePresetBtn.addEventListener('click', () => {
      const name = ccPresetName.value.trim();
      if (!name) { showToast('Please enter a preset name', 'warning'); return; }
      const presets = loadPresets();
      presets.push({ name, method: ccCurrentMethod, parameters: { ...ccCurrentParameters } });
      savePresets(presets);
      renderPresetList();
      ccPresetName.value = '';
      showToast(`Preset "${name}" saved`, 'success');
    });
  }

  // View toolbar
  if (ccToolGridView)    ccToolGridView.addEventListener('click', switchToGridView);
  if (ccToolPreviewView) {
    ccToolPreviewView.addEventListener('click', () => {
      if (ccSessionImages.length > 0) switchToPreviewView();
      else showToast('Add images from Your Library first', 'info');
    });
  }
  if (ccBackToGridBtn) ccBackToGridBtn.addEventListener('click', switchToGridView);

  // Add-to-correction-lab button
  const addToCorrectionBtn = document.getElementById('addToCorrectionBtn');
  if (addToCorrectionBtn) {
    addToCorrectionBtn.addEventListener('click', () => {
      if (isSelectionMode()) exitSelectionMode();

      const selectedImages = _libraryImages.filter(img => selectedLibraryImages.includes(img.id));
      if (selectedImages.length === 0) return;

      const unanalyzedImages = selectedImages.filter(img => !img.path);
      if (unanalyzedImages.length > 0) {
        showToast(
          `Please analyze images first before using Color Correction Lab. ` +
          `${unanalyzedImages.length} of ${selectedImages.length} image${unanalyzedImages.length !== 1 ? 's' : ''} need analysis.`,
          'warning',
          5000
        );
        return;
      }

      ccSessionImages = selectedImages.map(img => ({
        id:          img.id,
        name:        img.name,
        path:        img.path,
        url:         img.url,
        base64:      img.base64,
        issues:      img.issues      || [],
        features:    img.features    || null,
        aspectRatio: img.aspectRatio || 1.5,
        isRaw:       img.isRaw       || false,
      }));
      ccCurrentImageIndex = 0;
      ccCorrectionResults = {};

      renderColorLabGrid();
      showColorCorrectionView();
      switchToGridView();

      showToast(`${selectedImages.length} image${selectedImages.length !== 1 ? 's' : ''} added to Color Correction Lab`, 'success');
    });
  }

  // Navigation buttons
  if (ccPrevImageBtn) {
    ccPrevImageBtn.addEventListener('click', () => {
      if (ccCurrentImageIndex > 0) {
        ccCurrentImageIndex--;
        loadImageAtIndex(ccCurrentImageIndex);
      }
    });
  }
  if (ccNextImageBtn) {
    ccNextImageBtn.addEventListener('click', () => {
      if (ccCurrentImageIndex < ccSessionImages.length - 1) {
        ccCurrentImageIndex++;
        loadImageAtIndex(ccCurrentImageIndex);
      }
    });
  }

  // Remove from lab (preview-mode button)
  if (ccRemoveFromLabBtn) {
    ccRemoveFromLabBtn.addEventListener('click', () => {
      if (ccSessionImages.length === 0) return;
      const confirmed = confirm(`Remove "${ccSessionImages[ccCurrentImageIndex].name}" from Color Correction Lab?`);
      if (!confirmed) return;

      ccSessionImages.splice(ccCurrentImageIndex, 1);
      const removedPath = ccCurrentImagePath;
      delete ccCorrectionResults[removedPath];

      if (ccSessionImages.length === 0) {
        clearColorCorrectionLab();
        showToast('All images removed from lab', 'info');
      } else {
        if (ccCurrentImageIndex >= ccSessionImages.length) ccCurrentImageIndex = ccSessionImages.length - 1;
        loadImageAtIndex(ccCurrentImageIndex);
        renderColorLabGrid();
        showToast('Image removed from lab', 'info');
      }
      updateNavigationState();
    });
  }

  // Save current image
  if (ccSaveCurrentBtn) {
    ccSaveCurrentBtn.addEventListener('click', async () => {
      if (!ccCurrentImagePath) return;
      await ButtonLoader.wrap(ccSaveCurrentBtn, 'Saving...', async () => {
        try {
          const response = await fetch('http://localhost:8081/color-correct/apply', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ method: ccCurrentMethod, parameters: ccCurrentParameters, imagePath: ccCurrentImagePath }),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const result = await response.json();
          if (result.success) {
            if (ccCorrectionResults[ccCurrentImagePath]) ccCorrectionResults[ccCurrentImagePath].saved = true;
            showToast(`Image saved: ${ccSessionImages[ccCurrentImageIndex].name}`, 'success');
            updateSaveButtonStates();
          } else throw new Error(result.message);
        } catch (err) {
          console.error('Save error:', err);
          showToast(`Save failed: ${err.message}`, 'error');
          throw err;
        }
      });
    });
  }

  // Apply to all images
  if (ccApplyToAllBtn) {
    ccApplyToAllBtn.addEventListener('click', async () => {
      if (ccSessionImages.length === 0) return;
      const confirmed = confirm(
        `Apply current correction settings to all ${ccSessionImages.length} images?\n\n` +
        `Method: ${ccCurrentMethod}\n` +
        `This will process all images but NOT save them automatically.`
      );
      if (!confirmed) return;

      const progressContainer = document.getElementById('progressContainer');
      const progressBar       = document.getElementById('progressBar');
      const progressText      = document.getElementById('progressText');
      const progressPercent   = document.getElementById('progressPercent');
      progressContainer.style.display = 'block';

      await ButtonLoader.wrap(ccApplyToAllBtn, 'Processing...', async () => {
        try {
          const total = ccSessionImages.length;
          let completed = 0;
          for (const img of ccSessionImages) {
            progressText.textContent    = `Processing ${completed + 1} of ${total}: ${img.name}`;
            progressPercent.textContent = `${Math.round((completed / total) * 100)}%`;
            progressBar.style.width     = `${(completed / total) * 100}%`;
            try {
              const response = await fetch('http://localhost:8081/color-correct/preview', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ method: ccCurrentMethod, parameters: ccCurrentParameters, imagePath: img.path }),
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const result = await response.json();
              if (result.success) {
                ccCorrectionResults[img.path] = { method: ccCurrentMethod, parameters: { ...ccCurrentParameters }, base64: result.base64Image, applied: true, saved: false };
              }
            } catch (err) { console.error(`Error processing ${img.name}:`, err); }
            completed++;
          }
          progressBar.style.width     = '100%';
          progressPercent.textContent = '100%';
          progressText.textContent    = 'Batch processing complete!';
          setTimeout(() => { progressContainer.style.display = 'none'; }, 1000);
          showToast(`Corrections applied to ${completed} images. Use "Save All Corrected" to save.`, 'success', 5000);
          updateSaveButtonStates();
          if (ccCorrectionResults[ccCurrentImagePath]?.base64) {
            ccCorrectedImage.src           = ccCorrectionResults[ccCurrentImagePath].base64;
            ccCorrectedImage.style.display = 'block';
            updateSaveButtonStates();
          }
        } catch (err) {
          console.error('Batch processing error:', err);
          progressContainer.style.display = 'none';
          showToast(`Batch processing failed: ${err.message}`, 'error');
          throw err;
        }
      });
    });
  }

  // Save all corrected
  if (ccSaveAllBtn) {
    ccSaveAllBtn.addEventListener('click', async () => {
      const toSave = Object.entries(ccCorrectionResults).filter(([, result]) => result.applied && !result.saved);
      if (toSave.length === 0) { showToast('No unsaved corrections to save', 'info'); return; }
      const confirmed = confirm(
        `Save ${toSave.length} corrected image${toSave.length !== 1 ? 's' : ''} to workspace?\n\n` +
        `This will permanently save the corrections.`
      );
      if (!confirmed) return;

      const progressContainer = document.getElementById('progressContainer');
      const progressBar       = document.getElementById('progressBar');
      const progressText      = document.getElementById('progressText');
      const progressPercent   = document.getElementById('progressPercent');
      progressContainer.style.display = 'block';

      await ButtonLoader.wrap(ccSaveAllBtn, 'Saving...', async () => {
        try {
          const total = toSave.length;
          let completed = 0, failed = 0;
          for (const [path, result] of toSave) {
            progressText.textContent    = `Saving ${completed + 1} of ${total}...`;
            progressPercent.textContent = `${Math.round((completed / total) * 100)}%`;
            progressBar.style.width     = `${(completed / total) * 100}%`;
            try {
              const response = await fetch('http://localhost:8081/color-correct/apply', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ method: result.method, parameters: result.parameters, imagePath: path }),
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const saveResult = await response.json();
              if (saveResult.success) { result.saved = true; completed++; } else failed++;
            } catch (err) { console.error(`Error saving ${path}:`, err); failed++; }
          }
          progressBar.style.width     = '100%';
          progressPercent.textContent = '100%';
          progressText.textContent    = 'Save complete!';
          setTimeout(() => { progressContainer.style.display = 'none'; }, 1000);
          if (failed === 0) showToast(`Successfully saved ${completed} image${completed !== 1 ? 's' : ''}`, 'success');
          else showToast(`Saved ${completed} image${completed !== 1 ? 's' : ''}, ${failed} failed`, 'warning', 5000);
          updateSaveButtonStates();
        } catch (err) {
          console.error('Batch save error:', err);
          progressContainer.style.display = 'none';
          showToast(`Batch save failed: ${err.message}`, 'error');
          throw err;
        }
      });
    });
  }
}

// ── Private helpers ────────────────────────────────────────────────────────────

async function loadColorCorrectionMethods() {
  try {
    const response = await fetch('http://localhost:8081/color-correct/methods');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    ccMethods = await response.json();
    console.log('Loaded color correction methods:', ccMethods.length);
  } catch (err) {
    console.error('Failed to load color correction methods:', err);
    showToast('Failed to connect to color correction service', 'error');
  }
}

function populateMethodDropdown(category) {
  const methods = methodCategories[category];
  if (!methods) { console.warn('No methods found for category:', category); return; }

  ccMethodDropdown.innerHTML = '<option value="" selected disabled>Select an algorithm...</option>';
  methods.forEach(methodId => {
    const methodInfo = ccMethods.find(m => m.id === methodId);
    if (methodInfo) {
      const option = document.createElement('option');
      option.value       = methodId;
      option.textContent = methodInfo.name;
      ccMethodDropdown.appendChild(option);
    }
  });
  ccMethodDropdown.value = '';
  ccMethodControls.innerHTML = '<p style="color: var(--color-text-secondary);">Select an algorithm from the dropdown above.</p>';
  ccTheoryContent.innerHTML  = '<p style="color: var(--color-text-secondary);">Select an algorithm to view its theory and research background.</p>';
}

function buildReferenceImageControl(param, value) {
  const previewHTML = value
    ? `<div class="cc-ref-preview" style="margin-top: 8px;">
         <img src="file://${value}" style="max-width:100%;height:auto;border-radius:var(--radius-base);border:1px solid var(--color-border);">
       </div>`
    : '';
  return `
    <div class="form-group">
      <label class="form-label">${param.label}</label>
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <input type="text" class="form-control cc-ref-path-input" data-param="${param.name}"
          placeholder="Select reference image..." value="${value}" readonly
          style="flex:1;cursor:pointer;font-size:12px;">
        <button class="btn btn--secondary btn--sm cc-select-ref-btn" style="white-space:nowrap;">
          <i class="bi bi-folder-open"></i> Browse
        </button>
      </div>
      ${previewHTML}
      <p style="font-size:12px;color:var(--color-text-secondary);margin-top:4px;">${param.description}</p>
    </div>`;
}

function buildSliderControl(param, value) {
  return `
    <div class="form-group">
      <label class="form-label">
        ${param.label}
        <span style="color:var(--color-text-secondary);font-weight:normal;margin-left:8px;">${value.toFixed(2)}</span>
      </label>
      <input type="range" class="cc-slider" data-param="${param.name}"
        min="${param.min}" max="${param.max}" step="${param.step}" value="${value}">
      <p style="font-size:12px;color:var(--color-text-secondary);margin-top:4px;">${param.description}</p>
    </div>`;
}

function attachSliderListeners(container) {
  container.querySelectorAll('.cc-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const param = e.target.dataset.param;
      const value = parseFloat(e.target.value);
      ccCurrentParameters[param] = value;
      const span = e.target.previousElementSibling?.querySelector('span');
      if (span) span.textContent = value.toFixed(2);
      clearTimeout(ccDebounceTimer);
      ccDebounceTimer = setTimeout(() => { if (ccCurrentImagePath) applyColorCorrection(); }, 300);
    });
  });
}

function attachRefImageButton(container) {
  const btn = container.querySelector('.cc-select-ref-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const result = await window.api.selectReferenceImage();
    if (result && result.filePath) {
      ccCurrentParameters.referenceImagePath = result.filePath;
      updateMethodControls(ccCurrentMethod);
      if (ccCurrentImagePath) applyColorCorrection();
    }
  });
}

function updateMethodControls(method) {
  const methodInfo = ccMethods.find(m => m.id === method);
  if (!methodInfo) {
    ccMethodControls.innerHTML = '<p style="color:var(--color-text-secondary);">No parameters for this method</p>';
    return;
  }
  if (methodInfo.parameters.length === 0) {
    ccMethodControls.innerHTML = '<p style="color:var(--color-text-secondary);">This method has no adjustable parameters. It applies automatically.</p>';
    ccCurrentParameters = {};
    return;
  }
  let html = '';
  methodInfo.parameters.forEach(param => {
    if (param.name === 'referenceImagePath') {
      const value = ccCurrentParameters[param.name] || '';
      ccCurrentParameters[param.name] = value;
      html += buildReferenceImageControl(param, value);
    } else {
      const value = ccCurrentParameters[param.name] !== undefined
        ? ccCurrentParameters[param.name]
        : param.defaultValue;
      ccCurrentParameters[param.name] = value;
      html += buildSliderControl(param, value);
    }
  });
  ccMethodControls.innerHTML = html;
  attachSliderListeners(ccMethodControls);
  attachRefImageButton(ccMethodControls);
}

function updateTheoryContent(method) {
  const methodInfo = ccMethods.find(m => m.id === method);
  if (!methodInfo) { ccTheoryContent.innerHTML = '<p>Loading theory content...</p>'; return; }

  let citation = 'Bianco, S. (2010). "Color Correction Algorithms for Digital Cameras." PhD Thesis.';
  if (method === 'color_distribution_alignment') {
    citation = 'Dal\'Col, L.; Coelho, D.; Madeira, T.; Dias, P.; Oliveira, M. (2023). "A Sequential Color Correction Approach for Texture Mapping of 3D Meshes." <i>Sensors</i> 23, 607.';
  }

  ccTheoryContent.innerHTML = `
    <div class="cc-theory-section-content">
      <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Problem Solved</h4>
      <p style="font-size: 13px; line-height: 1.5; margin-bottom: 16px;">${methodInfo.description}</p>
      <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Algorithm Explanation</h4>
      <div style="font-size: 13px; line-height: 1.6; color: var(--color-text-secondary);">
        ${methodInfo.theory}
      </div>
      <div style="margin-top: 16px; padding: 12px; background: var(--color-secondary); border-radius: var(--radius-base); border-left: 3px solid var(--accent-color);">
        <p style="font-size: 12px; margin: 0; color: var(--color-text-secondary);">
          <i class="bi bi-lightbulb"></i>
          <strong>Research-Based:</strong> ${citation}
        </p>
      </div>
    </div>
  `;
}

async function applyColorCorrection() {
  if (!ccCurrentImagePath) return;
  ccLoading.style.display        = 'flex';
  ccCorrectedImage.style.display = 'none';
  try {
    const response = await fetch('http://localhost:8081/color-correct/preview', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ method: ccCurrentMethod, parameters: ccCurrentParameters, imagePath: ccCurrentImagePath }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result.success) {
      ccCorrectedImage.src           = result.base64Image;
      ccCorrectedImage.style.display = 'block';
      if (ccCurrentImagePath) {
        ccCorrectionResults[ccCurrentImagePath] = {
          method:     ccCurrentMethod,
          parameters: { ...ccCurrentParameters },
          base64:     result.base64Image,
          applied:    true,
          saved:      false,
        };
        updateSaveButtonStates();
      }
    } else throw new Error(result.message);
  } catch (err) {
    console.error('Color correction error:', err);
    showToast(`Correction failed: ${err.message}`, 'error');
  } finally {
    ccLoading.style.display = 'none';
  }
}

function updateSaveButtonStates() {
  const hasCorrectedImage     = ccCorrectedImage && ccCorrectedImage.style.display !== 'none';
  const hasMultipleImages     = ccSessionImages.length > 1;
  const hasUnsavedCorrections = Object.values(ccCorrectionResults).some(r => r.applied && !r.saved);

  if (ccSaveCurrentBtn) ccSaveCurrentBtn.disabled = !hasCorrectedImage;
  if (ccApplyToAllBtn) {
    if (hasMultipleImages) { ccApplyToAllBtn.style.display = 'inline-flex'; ccApplyToAllBtn.disabled = !hasCorrectedImage; }
    else ccApplyToAllBtn.style.display = 'none';
  }
  if (ccSaveAllBtn) {
    if (hasMultipleImages && hasUnsavedCorrections) { ccSaveAllBtn.style.display = 'inline-flex'; ccSaveAllBtn.disabled = false; }
    else ccSaveAllBtn.style.display = 'none';
  }
}

function updateNavigationState() {
  if (ccSessionImages.length <= 1) { ccNavigationBar.style.display = 'none'; return; }
  ccNavigationBar.style.display   = 'flex';
  ccCurrentImageNum.textContent   = ccCurrentImageIndex + 1;
  ccTotalImages.textContent       = ccSessionImages.length;
  ccPrevImageBtn.disabled         = ccCurrentImageIndex === 0;
  ccNextImageBtn.disabled         = ccCurrentImageIndex === ccSessionImages.length - 1;
}

function loadImageAtIndex(index) {
  if (index < 0 || index >= ccSessionImages.length) return;
  const img = ccSessionImages[index];
  ccCurrentImageIndex = index;
  ccCurrentImagePath  = img.path;
  ccCurrentImage      = img;

  if (!ccCurrentImagePath) {
    showToast('This image needs to be analyzed first before color correction can be applied', 'warning');
    ccNoImage.style.display        = 'flex';
    ccImageContainer.style.display = 'none';
    return;
  }

  ccOriginalImage.onload = () => {
    requestAnimationFrame(() => applyFitLayout());
  };
  ccOriginalImage.src             = img.url || img.base64;
  ccImageContainer.style.display  = '';
  ccImageContainer.style.width    = '';
  ccImageContainer.style.height   = '';
  ccImageContainer.style.overflow = '';
  ccNoImage.style.display         = 'none';

  if (ccCorrectionResults[img.path]?.base64) {
    ccCorrectedImage.src           = ccCorrectionResults[img.path].base64;
    ccCorrectedImage.style.display = 'block';
    ccCurrentMethod                = ccCorrectionResults[img.path].method;
    ccCurrentParameters            = { ...ccCorrectionResults[img.path].parameters };
    ccMethodBtns.forEach(btn => {
      if (btn.dataset.method === ccCurrentMethod) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    updateMethodControls(ccCurrentMethod);
    updateTheoryContent(ccCurrentMethod);
  } else {
    ccCorrectedImage.style.display = 'none';
    if (ccCurrentMethod) {
      const methodInfo = ccMethods.find(m => m.id === ccCurrentMethod);
      const requiresReference = methodInfo?.parameters.some(p => p.name === 'referenceImagePath');
      if (!requiresReference || ccCurrentParameters.referenceImagePath) applyColorCorrection();
    }
  }
  updateNavigationState();
  updateSaveButtonStates();
}

function clearColorCorrectionLab() {
  ccSessionImages      = [];
  ccCurrentImageIndex  = 0;
  ccCurrentImagePath   = null;
  ccCurrentImage       = null;
  ccCorrectionResults  = {};

  ccImageContainer.style.display  = 'none';
  ccNoImage.style.display         = 'flex';
  ccNavigationBar.style.display   = 'none';

  switchToGridView();
  updateSaveButtonStates();
}

function switchToGridView() {
  if (ccGridView)    ccGridView.style.display    = 'block';
  if (ccPreviewView) ccPreviewView.style.display = 'none';
  if (ccToolGridView)    ccToolGridView.classList.add('active');
  if (ccToolPreviewView) ccToolPreviewView.classList.remove('active');
  renderColorLabGrid();
}

function switchToPreviewView() {
  if (ccGridView)        ccGridView.style.display    = 'none';
  if (ccPreviewView)     ccPreviewView.style.display  = 'flex';
  if (ccToolGridView)    ccToolGridView.classList.remove('active');
  if (ccToolPreviewView) ccToolPreviewView.classList.add('active');
  ccFitScale     = 1;
  ccCurrentScale = 1;
  applyScale(1);
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      setTimeout(() => applyFitLayout(), 30)
    )
  );
}

// ── Preview zoom / pan ───────────────────────────────────────────────────────

function initPreviewZoom() {
  ccPreviewContainer = document.getElementById('ccPreviewContainer');
  // ccImageContainer and ccOriginalImage already populated by _initDomRefs()
  if (!ccPreviewContainer || !ccImageContainer || !ccOriginalImage) return;

  console.log('Zoom init — container:', ccPreviewContainer, 'size:', ccPreviewContainer?.clientWidth, 'x', ccPreviewContainer?.clientHeight);

  // Recompute fit scale whenever a new image finishes loading
  ccOriginalImage.addEventListener('load', () => {
    computeFitScale();
    applyScale(ccFitScale);
    ccPreviewContainer.scrollTop  = 0;
    ccPreviewContainer.scrollLeft = 0;
  });

  // Recompute on container resize (e.g. window resize, panel resize)
  new ResizeObserver(() => {
    if (!ccOriginalImage.src) return;
    computeFitScale();
    if (ccCurrentScale < ccFitScale) applyScale(ccFitScale);
  }).observe(ccPreviewContainer);

  // Toolbar buttons
  const zoomInBtn  = document.getElementById('ccToolZoomIn');
  const zoomOutBtn = document.getElementById('ccToolZoomOut');
  const fitBtn     = document.getElementById('ccToolFit');

  zoomInBtn  && zoomInBtn.addEventListener('click', () => zoomBy(1.25));
  zoomOutBtn && zoomOutBtn.addEventListener('click', () => zoomBy(1 / 1.25));
  fitBtn     && fitBtn.addEventListener('click', () => {
    computeFitScale();
    applyScale(ccFitScale);
    ccPreviewContainer.scrollTop  = 0;
    ccPreviewContainer.scrollLeft = 0;
  });

  // Drag-to-pan (only when zoomed past fit)
  ccPreviewContainer.addEventListener('mousedown', (e) => {
    if (ccCurrentScale <= ccFitScale + 0.001) return;
    ccIsDragging   = true;
    ccDragStartX   = e.clientX;
    ccDragStartY   = e.clientY;
    ccScrollStartX = ccPreviewContainer.scrollLeft;
    ccScrollStartY = ccPreviewContainer.scrollTop;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!ccIsDragging) return;
    ccPreviewContainer.scrollLeft = ccScrollStartX - (e.clientX - ccDragStartX);
    ccPreviewContainer.scrollTop  = ccScrollStartY - (e.clientY - ccDragStartY);
  });

  window.addEventListener('mouseup', () => { ccIsDragging = false; });
}

export function computeFitScale() {
  if (!ccPreviewContainer || !ccOriginalImage) return;
  const iw = ccOriginalImage.naturalWidth;
  const ih = ccOriginalImage.naturalHeight;
  const cw = ccPreviewContainer.clientWidth;
  const ch = ccPreviewContainer.clientHeight;
  if (!iw || !ih || !cw || !ch) { ccFitScale = 1; ccCurrentScale = 1; return; }
  // Fit entire image; never upscale beyond 100%
  ccFitScale     = Math.min(cw / iw, ch / ih, 1);
  ccCurrentScale = ccFitScale;
}

function applyFitLayout() {
  if (!ccPreviewContainer || !ccOriginalImage || !ccImageContainer) return;
  const cw = ccPreviewContainer.clientWidth;
  const ch = ccPreviewContainer.clientHeight;
  const iw = ccOriginalImage.naturalWidth;
  const ih = ccOriginalImage.naturalHeight;

  console.log('[applyFitLayout]', { cw, ch, iw, ih, fitScale: (iw && ih) ? Math.min(cw / iw, ch / ih) : 'n/a' });

  // If container has no size yet, retry after a short delay
  if (!cw || !ch || !iw || !ih) {
    setTimeout(() => applyFitLayout(), 50);
    return;
  }

  ccFitScale     = Math.min(cw / iw, ch / ih);
  ccCurrentScale = ccFitScale;

  const fw   = Math.round(iw * ccFitScale);
  const fh   = Math.round(ih * ccFitScale);
  const left = Math.round((cw - fw) / 2);
  const top  = Math.round((ch - fh) / 2);

  ccImageContainer.style.left   = left + 'px';
  ccImageContainer.style.top    = top  + 'px';
  ccImageContainer.style.width  = fw   + 'px';
  ccImageContainer.style.height = fh   + 'px';
  ccPreviewContainer.style.overflow = 'hidden';
}

export function applyScale(scale) {
  if (!ccImageContainer || !ccOriginalImage) return;

  ccCurrentScale = scale;
  const atFit = ccCurrentScale <= ccFitScale + 0.001;

  if (atFit) {
    // CSS handles fit — clear all inline overrides
    ccImageContainer.style.width    = '';
    ccImageContainer.style.height   = '';
    ccImageContainer.style.overflow = '';
    ccOriginalImage.style.transform  = 'translate(-50%, -50%)';
    ccOriginalImage.style.maxWidth   = '100%';
    ccOriginalImage.style.maxHeight  = '100%';
    ccOriginalImage.style.width      = 'auto';
    ccOriginalImage.style.height     = 'auto';
    if (ccCorrectedImage) {
      ccCorrectedImage.style.transform = 'translate(-50%, -50%)';
      ccCorrectedImage.style.maxWidth  = '100%';
      ccCorrectedImage.style.maxHeight = '100%';
      ccCorrectedImage.style.width     = 'auto';
      ccCorrectedImage.style.height    = 'auto';
    }
    if (ccPreviewContainer) ccPreviewContainer.style.overflow = 'hidden';
  } else {
    // Zoomed in: explicit px dimensions for scroll/pan
    const iw = ccOriginalImage.naturalWidth;
    const ih = ccOriginalImage.naturalHeight;
    const scaledW = Math.floor(iw * ccCurrentScale);
    const scaledH = Math.floor(ih * ccCurrentScale);
    ccImageContainer.style.width    = `${scaledW}px`;
    ccImageContainer.style.height   = `${scaledH}px`;
    ccImageContainer.style.overflow = 'visible';
    ccOriginalImage.style.transform  = 'none';
    ccOriginalImage.style.maxWidth   = 'none';
    ccOriginalImage.style.maxHeight  = 'none';
    ccOriginalImage.style.width      = '100%';
    ccOriginalImage.style.height     = '100%';
    if (ccCorrectedImage) {
      ccCorrectedImage.style.transform = 'none';
      ccCorrectedImage.style.maxWidth  = 'none';
      ccCorrectedImage.style.maxHeight = 'none';
      ccCorrectedImage.style.width     = '100%';
      ccCorrectedImage.style.height    = '100%';
    }
    if (ccPreviewContainer) ccPreviewContainer.style.overflow = 'auto';
  }
}

function zoomBy(factor) {
  const MAX_SCALE = 8;
  applyScale(Math.min(MAX_SCALE, Math.max(ccFitScale, ccCurrentScale * factor)));
}

function renderColorLabGrid() {
  if (!ccImagesGrid) return;
  if (ccSessionImages.length === 0) {
    ccImagesGrid.innerHTML = `
      <div class="cc-grid-placeholder">
        <i class="bi bi-images" style="font-size: 48px; opacity: 0.3;"></i>
        <p>Add images from Your Library to begin</p>
      </div>
    `;
    return;
  }

  ccImagesGrid.innerHTML = ccSessionImages.map((img, index) => {
    const hasCorrection = ccCorrectionResults[img.path]?.applied;
    const isSaved       = ccCorrectionResults[img.path]?.saved;
    const isSelected    = index === ccCurrentImageIndex;
    let statusIcon = '', statusClass = '';
    if (isSaved)         { statusIcon = '<i class="bi bi-check-circle-fill"></i>'; statusClass = 'corrected'; }
    else if (hasCorrection) { statusIcon = '<i class="bi bi-pencil-fill"></i>'; statusClass = 'pending'; }
    return `
      <div class="cc-grid-item ${isSelected ? 'selected' : ''}" data-index="${index}" data-path="${img.path || ''}">
        <img src="${img.url || img.base64}" alt="${img.name}" loading="lazy">
        ${statusIcon ? `<div class="cc-grid-item-status ${statusClass}">${statusIcon}</div>` : ''}
        <div class="cc-grid-item-overlay"><span>${img.name}</span></div>
      </div>
    `;
  }).join('');

  ccImagesGrid.querySelectorAll('.cc-grid-item').forEach(item => {
    item.addEventListener('click', () => openImageInPreview(parseInt(item.dataset.index, 10)));
  });
}

function openImageInPreview(index) {
  if (index < 0 || index >= ccSessionImages.length) return;
  const img = ccSessionImages[index];
  ccCurrentImageIndex = index;
  if (ccPreviewImageName) ccPreviewImageName.textContent = img.name || `Image ${index + 1}`;
  loadImageAtIndex(index);
  switchToPreviewView();
}

export function loadPresets() {
  const raw = localStorage.getItem(CC_PRESETS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function savePresets(presets) { localStorage.setItem(CC_PRESETS_KEY, JSON.stringify(presets)); }

function renderPresetList() {
  if (!ccPresetList) return;
  const presets = loadPresets();
  if (presets.length === 0) {
    ccPresetList.innerHTML = '<p style="font-size: 12px; color: var(--color-text-secondary); text-align: center;">No saved presets</p>';
    return;
  }
  let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
  presets.forEach((preset, index) => {
    html += `
      <div class="cc-preset-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: var(--color-secondary); border-radius: var(--radius-sm);">
        <div>
          <div style="font-size: 13px; font-weight: 500;">${preset.name}</div>
          <div style="font-size: 11px; color: var(--color-text-secondary);">${preset.method}</div>
        </div>
        <div style="display: flex; gap: 4px;">
          <button class="btn btn--secondary btn--sm cc-load-preset" data-index="${index}" title="Load">
            <i class="bi bi-upload"></i>
          </button>
          <button class="btn btn--secondary btn--sm cc-delete-preset" data-index="${index}" title="Delete">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>`;
  });
  html += '</div>';
  ccPresetList.innerHTML = html;

  ccPresetList.querySelectorAll('.cc-load-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index  = parseInt(e.currentTarget.dataset.index);
      const preset = presets[index];
      ccCurrentMethod     = preset.method;
      ccCurrentParameters = { ...preset.parameters };
      ccMethodBtns.forEach(b => {
        if (b.dataset.method === preset.method) b.classList.add('active');
        else b.classList.remove('active');
      });
      updateMethodControls(preset.method);
      updateTheoryContent(preset.method);
      if (ccCurrentImagePath) applyColorCorrection();
      showToast(`Loaded preset: ${preset.name}`, 'success');
    });
  });

  ccPresetList.querySelectorAll('.cc-delete-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index  = parseInt(e.currentTarget.dataset.index);
      const preset = presets[index];
      if (confirm(`Delete preset "${preset.name}"?`)) {
        presets.splice(index, 1);
        savePresets(presets);
        renderPresetList();
        showToast('Preset deleted', 'info');
      }
    });
  });
}
