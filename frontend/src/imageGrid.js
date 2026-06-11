import { showToast }       from './toast.js';
import { formatIssueName } from './utils.js';

let _uploadedImages, _uploadView, _previewView, _settingsView, _libraryView;
let _topnav, _imageGrid, _imageCount, _updateClearAllButton;

export function initImageGrid({
  uploadedImages, uploadView, previewView, settingsView, libraryView,
  topnav, imageGrid, imageCount, updateClearAllButton,
}) {
  _uploadedImages      = uploadedImages;
  _uploadView          = uploadView;
  _previewView         = previewView;
  _settingsView        = settingsView;
  _libraryView         = libraryView;
  _topnav              = topnav;
  _imageGrid           = imageGrid;
  _imageCount          = imageCount;
  _updateClearAllButton = updateClearAllButton;
}

export function displayImageGrid() {
  // Hide upload view, show preview view
  _uploadView.style.display = 'none';
  _previewView.style.display = 'block';

  // Update count
  _imageCount.textContent = `${_uploadedImages.length} image${_uploadedImages.length !== 1 ? 's' : ''} uploaded`;

  // Clear and rebuild grid
  _imageGrid.innerHTML = '';

  _uploadedImages.forEach((imageData) => {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.dataset.imageId = imageData.id;

    // Thumbnail image
    const img = document.createElement('img');
    img.src = imageData.url;
    img.alt = imageData.name;
    img.title = imageData.name;
    img.className = 'image-thumbnail';

    // Add RAW badge if this is a RAW image
    if (imageData.isRaw) {
      const rawBadge = document.createElement('div');
      rawBadge.className = 'raw-badge';
      rawBadge.style.cssText = `
        position: absolute;
        top: 8px;
        left: 8px;
        background: rgba(255, 152, 0, 0.9);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        z-index: 10;
      `;
      rawBadge.textContent = imageData.isFullyDecoded ? 'RAW ✓' : 'RAW';
      rawBadge.title = imageData.isPreview ? 'Preview quality - full decode in progress' : 'Full quality';
      card.appendChild(rawBadge);
    }

    // Add glass issue badge if image has issues
    if (imageData.issues && imageData.issues.length > 0) {
      const issueBadge = document.createElement('div');
      issueBadge.className = 'glass-issue-badge';
      issueBadge.textContent = imageData.issues.length;
      issueBadge.title = `${imageData.issues.length} issue${imageData.issues.length !== 1 ? 's' : ''} detected`;
      card.appendChild(issueBadge);
    }

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '×';
    removeBtn.title = 'Remove image';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeImage(imageData.id);
    });

    card.appendChild(img);
    card.appendChild(removeBtn);

    // Click to enlarge
    card.addEventListener('click', () => {
      console.log('Image clicked:', imageData.name);
      displayImage(imageData.url, 'preview', imageData);
    });

    _imageGrid.appendChild(card);
  });

  // UPDATE clear all button state
  _updateClearAllButton();
}

export function displayImage(imageURL, origin = 'preview', imageData = null) {
  // Show toast if viewing RAW preview before full decode
  if (imageData && imageData.isRaw && imageData.isPreview && !imageData.isFullyDecoded) {
    showToast('Raw image is still fully decoding - viewing preview quality', 'info', 4000);
  }

  // Hide all views
  _uploadView.style.display    = 'none';
  _previewView.style.display   = 'none';
  _settingsView.style.display  = 'none';
  _libraryView.style.display   = 'none';
  _topnav.style.display        = 'none';

  // Create fullscreen wrapper
  const full = document.createElement('div');
  full.className = 'imgfullscreen';
  full.style.position       = 'fixed';
  full.style.top            = 0;
  full.style.left           = 0;
  full.style.width          = '100vw';
  full.style.height         = '100vh';
  full.style.display        = 'flex';
  full.style.alignItems     = 'center';
  full.style.justifyContent = 'center';
  full.style.zIndex         = 9999;

  // Build issue tags HTML if image has been analyzed
  let issueTagsHTML = '';
  if (imageData && imageData.issues !== undefined) {
    if (imageData.issues.length > 0) {
      issueTagsHTML = `
        <div class="glass-issue-overlay" id="issueOverlay">
          <div class="glass-header">
            <div class="glass-title">Issues Detected</div>
            <button class="glass-close-btn" id="closeIssueOverlay" title="Hide overlay">×</button>
          </div>
          <div class="glass-tags-container">
            ${imageData.issues.map(issue => `
              <span class="glass-tag">${formatIssueName(issue)}</span>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      issueTagsHTML = `
        <div class="glass-issue-overlay" id="issueOverlay">
          <div class="glass-header">
            <div class="glass-title" style="flex: 1;"></div>
            <button class="glass-close-btn" id="closeIssueOverlay" title="Hide overlay">×</button>
          </div>
          <div class="glass-perfect-badge">
            <i class="bi bi-check-circle-fill"></i>
            Perfect Image
          </div>
        </div>
      `;
    }
  }

  full.innerHTML = `
    <button id="imgBackBtn" class="nav-btn"
      style="position:absolute; top:20px; left:20px; background:none;">
      <i class="bi bi-arrow-left nav-icon"></i>
    </button>
    ${issueTagsHTML}
    <img src="${imageURL}" style="max-width:90%; max-height:90%; border-radius:12px;">
  `;

  document.body.appendChild(full);

  // Close button for issue overlay
  const closeOverlayBtn = document.getElementById('closeIssueOverlay');
  if (closeOverlayBtn) {
    closeOverlayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const overlay = document.getElementById('issueOverlay');
      if (overlay) overlay.classList.add('hidden');
    });
  }

  document.getElementById('imgBackBtn').addEventListener('click', () => {
    full.remove();

    _topnav.style.display = 'flex';

    if (origin === 'library') {
      _libraryView.style.display = 'block';
    } else {
      if (_uploadedImages.length > 0) _previewView.style.display = 'block';
      else _uploadView.style.display = 'block';
    }
  });
}

// Remove image from collection (in-place splice to keep shared array reference valid)
export function removeImage(imageId) {
  const idx = _uploadedImages.findIndex(img => img.id === imageId);
  if (idx !== -1) _uploadedImages.splice(idx, 1);

  if (_uploadedImages.length === 0) {
    _previewView.style.display = 'none';
    _uploadView.style.display  = 'block';
  } else {
    displayImageGrid();
  }
  _updateClearAllButton();
}
