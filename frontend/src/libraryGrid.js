import { showToast }                                          from './toast.js';
import { saveLibrary, updateLibraryEmptyState }               from './library.js';
import { selectedLibraryImages, isSelectionMode, toggleImageSelection } from './selection.js';

const LIBRARY_SCROLL_KEY = 'libraryScrollPosition';

let _libraryImages, _libraryView, _onImageClick;

export function initLibraryGrid({ libraryImages, libraryView, onImageClick }) {
  _libraryImages = libraryImages;
  _libraryView   = libraryView;
  _onImageClick  = onImageClick;
}

export function getVirtualScroller() { return VirtualLibraryScroller; }

export async function displayLibraryGrid(forceFullRender = false) {
  updateLibraryEmptyState();

  if (_libraryImages.length === 0) {
    VirtualLibraryScroller.disable();
    return;
  }

  if (forceFullRender || !VirtualLibraryScroller.isInitialized) {
    const wasInitialized = VirtualLibraryScroller.isInitialized;
    await VirtualLibraryScroller.initialize(forceFullRender);

    // Attach event delegation for clicks (only once per render cycle)
    if (forceFullRender || !wasInitialized) {
      attachLibraryGridEventDelegation();
    }
  } else {
    // Just update visuals for selection changes
    VirtualLibraryScroller.updateSelectionVisuals();
  }
}

/**
 * Attach event delegation to library grid for efficient event handling.
 * Uses event delegation on scroll container to handle all clicks.
 */
function attachLibraryGridEventDelegation() {
  const scrollContainer = document.getElementById('libraryScrollContainer');
  if (!scrollContainer) return;

  // Remove existing listener if any
  const oldListener = scrollContainer._libraryClickHandler;
  if (oldListener) scrollContainer.removeEventListener('click', oldListener);

  const clickHandler = (e) => {
    // Handle checkbox clicks
    const checkbox = e.target.closest('.library-checkbox');
    if (checkbox) {
      e.stopPropagation();
      const imageId = checkbox.dataset.imageId;
      if (imageId) toggleImageSelection(imageId);
      return;
    }

    // Handle image clicks — delegate CC Lab setup to caller via onImageClick
    const image = e.target.closest('.library-image');
    if (image) {
      const imageId = image.dataset.imageId;
      const img = _libraryImages.find(i => i.id == imageId);
      if (img && _libraryView.style.display !== 'none') {
        if (!img.path) {
          showToast('Please analyze this image first before using Color Correction Lab', 'warning');
          return;
        }
        _onImageClick(img);
      }
      return;
    }
  };

  scrollContainer.addEventListener('click', clickHandler);
  scrollContainer._libraryClickHandler = clickHandler;
}

// ── Virtual Library Scroller ──────────────────────────────────────────────────

const VirtualLibraryScroller = {
  // Configuration constants
  DEFAULT_ASPECT_RATIO: 1.5,
  MIN_COLUMN_WIDTH: 192, // 12rem in pixels
  MAX_COLUMNS: 4,
  CARD_GAP: 10,
  VIEWPORT_BUFFER_MULTIPLIER: 1.5,
  MIN_BUFFER_ROWS: 3,
  MAX_BUFFER_ROWS: 8,
  SCROLL_THROTTLE_MS: 16, // ~60fps

  // State
  isInitialized: false,
  isEnabled: false,
  columnCount: 4,
  rowHeight: 200,
  totalRows: 0,
  bufferRows: 3,
  containerWidth: 0,
  currentScrollTop: 0,
  visibleStartIndex: 0,
  visibleEndIndex: 0,
  scrollRAF: null,
  lastScrollSave: 0,

  // DOM references
  scrollContainer: null,
  scrollSpacer: null,
  grid: null,
  skeleton: null,

  async initialize(forceRecalculate = false) {
    this.scrollContainer = document.getElementById('libraryScrollContainer');
    this.scrollSpacer    = document.getElementById('libraryScrollSpacer');
    this.grid            = document.getElementById('libraryGrid');
    this.skeleton        = document.getElementById('libraryLoadingSkeleton');

    if (!this.scrollContainer || !this.grid) {
      console.error('Virtual scroll containers not found');
      return;
    }

    if (_libraryImages.length === 0) {
      this.disable();
      return;
    }

    this.isEnabled = true;

    const needsAspectCalculation = forceRecalculate || _libraryImages.some(img => !img.aspectRatio);
    if (needsAspectCalculation) {
      await this.calculateMissingAspectRatios();
    }

    this.calculateDimensions();

    if (!this.isInitialized) {
      this.scrollContainer.addEventListener('scroll', () => this.handleScroll());
    }

    this.isInitialized = true;
    this.renderVisibleCards();
  },

  async calculateMissingAspectRatios() {
    const imagesToCalculate = _libraryImages.filter(img => !img.aspectRatio);
    if (imagesToCalculate.length === 0) return;

    if (this.skeleton) this.skeleton.style.display = 'flex';

    console.log(`Calculating aspect ratios for ${imagesToCalculate.length} images...`);

    const promises = imagesToCalculate.map(img =>
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
          img.aspectRatio = image.naturalWidth / image.naturalHeight || this.DEFAULT_ASPECT_RATIO;
          resolve();
        };
        image.onerror = () => {
          img.aspectRatio = this.DEFAULT_ASPECT_RATIO;
          resolve();
        };
        image.src = img.url;
      })
    );

    await Promise.all(promises);

    if (this.skeleton) this.skeleton.style.display = 'none';

    saveLibrary();
    console.log('Aspect ratio calculation complete');
  },

  calculateAverageAspectRatio() {
    const validRatios = _libraryImages
      .map(img => img.aspectRatio)
      .filter(ratio => ratio && ratio > 0);
    if (validRatios.length === 0) return this.DEFAULT_ASPECT_RATIO;
    const sum = validRatios.reduce((acc, val) => acc + val, 0);
    return sum / validRatios.length;
  },

  calculateDimensions() {
    if (!this.scrollContainer) return;
    this.containerWidth = this.scrollContainer.clientWidth;
    this.columnCount = Math.floor((this.containerWidth + this.CARD_GAP) / (this.MIN_COLUMN_WIDTH + this.CARD_GAP));
    this.columnCount = Math.max(1, Math.min(this.columnCount, this.MAX_COLUMNS));
    if (this.scrollSpacer) this.scrollSpacer.style.height = 'auto';
    console.log(`Masonry layout configured: ~${this.columnCount} columns`);
  },

  getVisibleRange(scrollTop) {
    const viewportHeight = this.scrollContainer.clientHeight;
    const estimatedStartRow = Math.max(0, Math.floor(scrollTop / this.rowHeight) - this.bufferRows * 2);
    const estimatedEndRow   = Math.ceil((scrollTop + viewportHeight) / this.rowHeight) + this.bufferRows * 2;
    const startIndex = Math.max(0, estimatedStartRow * this.columnCount);
    const endIndex   = Math.min(_libraryImages.length, estimatedEndRow * this.columnCount);
    return { startIndex, endIndex };
  },

  renderVisibleCards() {
    if (!this.isEnabled || !this.grid) return;

    this.grid.innerHTML = '';

    _libraryImages.forEach(img => {
      const card = document.createElement('div');
      card.className = 'library-card';
      card.dataset.imageId = img.id;

      if (selectedLibraryImages.includes(img.id)) {
        card.classList.add('library-card--selected');
      }

      // Checkbox
      const checkbox = document.createElement('div');
      checkbox.className = `library-checkbox ${isSelectionMode() ? '' : 'hidden'}`;
      checkbox.dataset.imageId = img.id;

      const checkIcon = document.createElement('i');
      checkIcon.className = `bi ${selectedLibraryImages.includes(img.id) ? 'bi-check-circle-fill' : 'bi-circle'}`;
      checkbox.appendChild(checkIcon);

      // Image element
      const image = document.createElement('img');
      image.src       = img.url;
      image.alt       = img.name;
      image.title     = img.name;
      image.className = 'library-image';
      image.dataset.imageId = img.id;

      // Issue badge (hidden while in selection mode)
      if (!isSelectionMode() && img.issues && img.issues.length > 0) {
        const badge = document.createElement('div');
        badge.className  = 'glass-issue-badge';
        badge.textContent = img.issues.length;
        card.appendChild(badge);
      }

      card.appendChild(checkbox);
      card.appendChild(image);
      this.grid.appendChild(card);
    });
  },

  handleScroll() {
    if (!this.isEnabled) return;
    if (this.scrollRAF) cancelAnimationFrame(this.scrollRAF);
    this.scrollRAF = requestAnimationFrame(() => this.saveScrollPosition());
  },

  saveScrollPosition() {
    const now = Date.now();
    if (now - this.lastScrollSave < 250) return;
    this.lastScrollSave = now;
    localStorage.setItem(LIBRARY_SCROLL_KEY, this.scrollContainer.scrollTop.toString());
  },

  restoreScrollPosition() {
    if (!this.scrollContainer) return;
    const savedScroll = localStorage.getItem(LIBRARY_SCROLL_KEY);
    if (savedScroll) this.scrollContainer.scrollTop = parseInt(savedScroll, 10);
  },

  clearScrollPosition() {
    localStorage.removeItem(LIBRARY_SCROLL_KEY);
  },

  recalculate() {
    if (!this.isEnabled) return;
    console.log('Recalculating virtual scroll...');
    this.calculateDimensions();
    this.renderVisibleCards();
  },

  disable() {
    this.isEnabled = false;
    if (this.grid)        this.grid.innerHTML = '';
    if (this.scrollSpacer) this.scrollSpacer.style.height = '0';
  },

  updateSelectionVisuals() {
    if (!this.grid) return;
    const cards = this.grid.querySelectorAll('.library-card');
    cards.forEach(card => {
      const imageId  = card.dataset.imageId;
      const isSelected = selectedLibraryImages.includes(imageId);

      if (isSelected) card.classList.add('library-card--selected');
      else             card.classList.remove('library-card--selected');

      const checkbox = card.querySelector('.library-checkbox');
      if (checkbox) {
        const icon = checkbox.querySelector('i');
        if (icon) icon.className = `bi ${isSelected ? 'bi-check-circle-fill' : 'bi-circle'}`;

        if (isSelectionMode()) checkbox.classList.remove('hidden');
        else                   checkbox.classList.add('hidden');
      }
    });
  },
};
