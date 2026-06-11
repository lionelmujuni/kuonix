import { showToast }       from './toast.js';
import { formatIssueName } from './utils.js';

// Exported mutable array — never reassigned, always mutated in-place so all
// importers (VirtualLibraryScroller, addToCorrectionBtn handler, etc.) always
// see the current contents via the same object reference.
export const selectedLibraryImages = [];

let _isLibrarySelectionMode = false;

export function isSelectionMode() { return _isLibrarySelectionMode; }

let _libraryImages, _uploadedImages, _saveLibrary, _displayLibraryGrid, _getVirtualScroller;

export function initSelection({ libraryImages, uploadedImages, saveLibrary, displayLibraryGrid, getVirtualScroller }) {
  _libraryImages      = libraryImages;
  _uploadedImages     = uploadedImages;
  _saveLibrary        = saveLibrary;
  _displayLibraryGrid = displayLibraryGrid;
  _getVirtualScroller = getVirtualScroller;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const selectDropdownBtn = document.getElementById('selectDropdownBtn');
  const selectDropdown    = document.getElementById('selectDropdown');
  const selectByIssueItem = document.querySelector('[data-action="select-by-issue"]');
  const issueSubmenu      = document.getElementById('issueSubmenu');
  const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');

  // Dropdown open/close
  if (selectDropdownBtn && selectDropdown) {
    selectDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = selectDropdown.style.display === 'block';
      selectDropdown.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) populateIssueSubmenu(issueSubmenu);
    });
  }

  if (selectByIssueItem && issueSubmenu) {
    selectByIssueItem.addEventListener('mouseenter', () => {
      const rect        = selectByIssueItem.getBoundingClientRect();
      const dropdownRect = selectDropdown.getBoundingClientRect();
      issueSubmenu.style.top     = `${rect.top - dropdownRect.top}px`;
      issueSubmenu.style.display = 'block';
    });
    selectByIssueItem.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (!issueSubmenu.matches(':hover') && !selectByIssueItem.matches(':hover')) {
          issueSubmenu.style.display = 'none';
        }
      }, 200);
    });
    issueSubmenu.addEventListener('mouseleave', () => {
      issueSubmenu.style.display = 'none';
    });
    selectByIssueItem.addEventListener('click', (e) => {
      console.log('Select-by-issue item clicked');
      e.stopPropagation();
      if (issueSubmenu.style.display === 'block') {
        issueSubmenu.style.display = 'none';
      } else {
        const rect         = selectByIssueItem.getBoundingClientRect();
        const dropdownRect = selectDropdown.getBoundingClientRect();
        issueSubmenu.style.top     = `${rect.top - dropdownRect.top}px`;
        issueSubmenu.style.display = 'block';
        populateIssueSubmenu(issueSubmenu);
      }
    });
  }

  // Dropdown item actions
  document.querySelectorAll('.dropdown-item[data-action]').forEach(item => {
    item.addEventListener('click', (e) => {
      const action = item.dataset.action;
      if (action === 'select-by-issue') { e.stopPropagation(); return; }
      e.stopPropagation();
      switch (action) {
        case 'select-all':        selectAllImages(); break;
        case 'manual-selection':  enableManualSelectionMode(); break;
        case 'cancel-selection':  disableManualSelectionMode(); closeSelectDropdown(selectDropdown, issueSubmenu); break;
      }
    });
  });

  // Delete selected button
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', () => {
      if (selectedLibraryImages.length === 0) return;

      const confirmDelete = confirm(
        `Delete ${selectedLibraryImages.length} selected image${selectedLibraryImages.length !== 1 ? 's' : ''}?`
      );
      if (!confirmDelete) return;

      selectedLibraryImages.forEach(id => {
        const img = _libraryImages.find(i => i.id == id);
        if (img) URL.revokeObjectURL(img.url);
      });

      const toDelete = new Set(selectedLibraryImages);
      for (let i = _libraryImages.length - 1; i >= 0; i--) {
        if (toDelete.has(_libraryImages[i].id)) _libraryImages.splice(i, 1);
      }
      for (let i = _uploadedImages.length - 1; i >= 0; i--) {
        if (toDelete.has(_uploadedImages[i].id)) _uploadedImages.splice(i, 1);
      }

      selectedLibraryImages.length = 0;

      _saveLibrary();
      _displayLibraryGrid(true);
      updateSelectionControls();

      if (_libraryImages.length === 0) {
        _getVirtualScroller().clearScrollPosition();
      }
    });
  }

  // Close dropdown / exit selection mode when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.library-select-container')) {
      closeSelectDropdown(selectDropdown, issueSubmenu);
    }
    if (_isLibrarySelectionMode &&
        !e.target.closest('#libraryGrid') &&
        !e.target.closest('.library-select-container')) {
      disableManualSelectionMode();
    }
  });

  // Select/deselect all (also triggered from CC Lab selection panel)
  const selectAllBtn   = document.getElementById('selectAllBtn');
  const deselectAllBtn = document.getElementById('deselectAllBtn');
  if (selectAllBtn)   selectAllBtn.addEventListener('click', selectAllImages);
  if (deselectAllBtn) deselectAllBtn.addEventListener('click', deselectAllImages);
}

// ── Exported helpers (called from libraryGrid delegation + libraryBtn handler) ──

export function toggleImageSelection(imageId) {
  const index = selectedLibraryImages.indexOf(imageId);
  if (index > -1) selectedLibraryImages.splice(index, 1);
  else             selectedLibraryImages.push(imageId);

  _getVirtualScroller().updateSelectionVisuals();
  updateSelectionControls();
}

export function updateSelectionControls() {
  const selectionCount     = document.getElementById('selectionCount');
  const addToCorrectionBtn = document.getElementById('addToCorrectionBtn');
  const deleteSelectedBtn  = document.getElementById('deleteSelectedBtn');
  const cancelSelectionItem = document.querySelector('[data-action="cancel-selection"]');
  const manualSelectionItem = document.querySelector('[data-action="manual-selection"]');

  if (selectionCount) {
    if (selectedLibraryImages.length > 0) {
      selectionCount.textContent  = `${selectedLibraryImages.length} image${selectedLibraryImages.length !== 1 ? 's' : ''} selected`;
      selectionCount.style.display = 'block';
    } else {
      selectionCount.style.display = 'none';
    }
  }

  if (addToCorrectionBtn) addToCorrectionBtn.disabled = selectedLibraryImages.length === 0;
  if (deleteSelectedBtn)  deleteSelectedBtn.style.display = selectedLibraryImages.length > 0 ? 'inline-flex' : 'none';

  if (cancelSelectionItem) cancelSelectionItem.style.display = _isLibrarySelectionMode ? 'flex' : 'none';
  if (manualSelectionItem) manualSelectionItem.style.display = _isLibrarySelectionMode ? 'none' : 'flex';
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function selectAllImages() {
  selectedLibraryImages.length = 0;
  _libraryImages.forEach(img => selectedLibraryImages.push(img.id));
  _getVirtualScroller().updateSelectionVisuals();
  updateSelectionControls();
  // closeSelectDropdown called via initSelection's locally captured refs... use query
  const sd = document.getElementById('selectDropdown');
  const is = document.getElementById('issueSubmenu');
  closeSelectDropdown(sd, is);
}

function deselectAllImages() {
  selectedLibraryImages.length = 0;
  _getVirtualScroller().updateSelectionVisuals();
  updateSelectionControls();
}

function selectByIssue(issueType) {
  console.log('selectByIssue called with:', issueType);
  if (!issueType) {
    console.error('No issue type provided');
    showToast('Invalid issue type', 'error');
    return;
  }
  if (_libraryImages.length === 0) {
    console.warn('Library is empty');
    showToast('Library is empty - please upload and analyze images first', 'warning');
    return;
  }

  selectedLibraryImages.length = 0;
  _libraryImages.forEach(img => {
    if (Array.isArray(img.issues) && img.issues.includes(issueType)) {
      console.log(`✓ Image "${img.name}" has issue "${issueType}"`);
      selectedLibraryImages.push(img.id);
    }
  });

  console.log(`Selected ${selectedLibraryImages.length} images with issue "${issueType}"`);

  if (selectedLibraryImages.length === 0) {
    showToast(`No images found with issue: ${formatIssueName(issueType)}`, 'info');
  } else {
    showToast(`Selected ${selectedLibraryImages.length} image${selectedLibraryImages.length !== 1 ? 's' : ''} with ${formatIssueName(issueType)}`, 'success');
  }

  _getVirtualScroller().updateSelectionVisuals();
  updateSelectionControls();
  const sd = document.getElementById('selectDropdown');
  const is = document.getElementById('issueSubmenu');
  closeSelectDropdown(sd, is);
}

function enableManualSelectionMode() {
  _isLibrarySelectionMode = true;
  _getVirtualScroller().updateSelectionVisuals();
  updateSelectionControls();
  const sd = document.getElementById('selectDropdown');
  const is = document.getElementById('issueSubmenu');
  closeSelectDropdown(sd, is);
}

export function exitSelectionMode() { disableManualSelectionMode(); }

function disableManualSelectionMode() {
  _isLibrarySelectionMode = false;
  selectedLibraryImages.length = 0;
  _getVirtualScroller().updateSelectionVisuals();
  updateSelectionControls();
}

function closeSelectDropdown(selectDropdown, issueSubmenu) {
  if (selectDropdown) selectDropdown.style.display = 'none';
  if (issueSubmenu)   issueSubmenu.style.display   = 'none';
}

function populateIssueSubmenu(issueSubmenu) {
  if (!issueSubmenu) return;
  issueSubmenu.innerHTML = '<div class="dropdown-item-empty">Loading issues...</div>';

  const allIssues = new Set();
  let imagesWithIssues = 0;
  _libraryImages.forEach(img => {
    if (Array.isArray(img.issues) && img.issues.length > 0) {
      imagesWithIssues++;
      img.issues.forEach(issue => allIssues.add(issue));
    }
  });

  console.log(`Found ${allIssues.size} unique issues across ${imagesWithIssues}/${_libraryImages.length} images`);
  console.log('Issues:', Array.from(allIssues));

  if (allIssues.size === 0) {
    issueSubmenu.innerHTML = '<div class="dropdown-item-empty">No analyzed images with issues found. Please analyze images first.</div>';
    return;
  }

  issueSubmenu.innerHTML = '';
  Array.from(allIssues).sort().forEach(issue => {
    const count = _libraryImages.filter(img =>
      Array.isArray(img.issues) && img.issues.includes(issue)
    ).length;
    const item = document.createElement('button');
    item.className = 'dropdown-item';
    item.innerHTML = `<i class="bi bi-exclamation-circle"></i> ${formatIssueName(issue)} <span class="issue-count-badge">(${count})</span>`;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      selectByIssue(issue);
    });
    issueSubmenu.appendChild(item);
  });
}
