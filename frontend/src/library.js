// ── Library Persistence & Backend Health ─────────────────────────────────────
import { showToast } from './toast.js';

const LIBRARY_KEY = 'persistentLibrary';

// Module-private context — injected via initLibrary()
let _libraryImages;
let _libraryView;
let _emptyState;
let _displayLibraryGrid;

/**
 * Inject DOM refs and shared state into this module.
 * Must be called once inside DOMContentLoaded, before loadLibrary().
 *
 * @param {object}   opts
 * @param {Array}    opts.libraryImages     Shared mutable image array
 * @param {Element}  opts.libraryView       The library section element
 * @param {Element}  opts.emptyState        Empty-state placeholder element
 * @param {Function} opts.displayLibraryGrid Re-render callback
 */
export function initLibrary({ libraryImages, libraryView, emptyState, displayLibraryGrid }) {
  _libraryImages     = libraryImages;
  _libraryView       = libraryView;
  _emptyState        = emptyState;
  _displayLibraryGrid = displayLibraryGrid;
}

// ── Library Persistence ───────────────────────────────────────────────────────

/** Persist library metadata (no Base64) to localStorage. */
export function saveLibrary() {
  const saveData = _libraryImages.map(img => ({
    id:          img.id,
    name:        img.name,
    size:        img.size,
    issues:      img.issues,
    path:        img.path,
    aspectRatio: img.aspectRatio,
  }));
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(saveData));
  console.log(`Saved library metadata for ${saveData.length} images (${JSON.stringify(saveData).length} bytes)`);
}

/** Load library metadata from localStorage and regenerate backend URLs. */
export async function loadLibrary() {
  const raw = localStorage.getItem(LIBRARY_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    _libraryImages.length = 0;

    parsed.forEach(savedImg => {
      _libraryImages.push({
        id:          savedImg.id,
        name:        savedImg.name,
        size:        savedImg.size,
        issues:      savedImg.issues || [],
        path:        savedImg.path,
        aspectRatio: savedImg.aspectRatio || 1.5,
        url:         null,
        base64:      null,
        file:        null,
      });
    });

    console.log(`Library loaded: ${_libraryImages.length} images from metadata`);

    if (_libraryImages.length > 0) {
      const backendReady = await waitForBackend();
      if (backendReady) {
        await regenerateImageURLs();
      } else {
        showToast('Backend not available - library images may not display', 'warning', 6000);
      }
    }
  } catch (err) {
    console.error('Failed to load library:', err);
  }
}

// ── URL Regeneration ──────────────────────────────────────────────────────────

/** Fetch fresh data-URLs from the backend for images that lack one. */
export async function regenerateImageURLs(retryCount = 0, maxRetries = 3) {
  const imagesWithPaths = _libraryImages.filter(img => img.path && !img.url);
  if (imagesWithPaths.length === 0) return;

  try {
    const response = await fetch('http://localhost:8081/images/get-urls', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ paths: imagesWithPaths.map(img => img.path) }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.message || 'URL regeneration failed');

    data.images.forEach((urlData, index) => {
      const img = imagesWithPaths[index];
      if (urlData.exists && urlData.dataUrl) {
        img.url    = urlData.dataUrl;
        img.base64 = urlData.dataUrl;
      } else {
        console.warn(`Image not found in workspace: ${img.name}`);
      }
    });

    if (_libraryView.style.display !== 'none') {
      _displayLibraryGrid(true);
      updateLibraryEmptyState();
    }

    console.log(`✓ Regenerated URLs for ${data.images.filter(i => i.exists).length} images`);

  } catch (error) {
    console.error(`Failed to regenerate image URLs (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);

    if (retryCount < maxRetries) {
      const delayMs = Math.pow(2, retryCount) * 1000;
      console.log(`Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return regenerateImageURLs(retryCount + 1, maxRetries);
    }

    showToast('Failed to load library images - backend may not be running', 'error');
  }
}

// ── Backend Health Check ──────────────────────────────────────────────────────

/**
 * Poll the backend until it responds or max attempts are exhausted.
 * @returns {Promise<boolean>}
 */
export async function waitForBackend(maxAttempts = 30, delayMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch('http://localhost:8081/color-correct/methods', {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        console.log('✓ Backend ready');
        return true;
      }
    } catch (err) {
      console.log(`Backend not ready, attempt ${i + 1}/${maxAttempts}...`);
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  console.warn('Backend health check failed after max attempts');
  return false;
}

// ── Empty-State UI ────────────────────────────────────────────────────────────

/** Show or hide the library empty-state placeholder based on image count. */
export function updateLibraryEmptyState() {
  const hasImages = _libraryImages.length > 0;

  if (_emptyState) {
    _emptyState.style.display = hasImages ? 'none' : 'flex';
  }

  const scrollContainer = document.getElementById('libraryScrollContainer');
  if (scrollContainer) {
    scrollContainer.style.display = hasImages ? 'block' : 'none';
  }
}
