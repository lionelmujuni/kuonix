window.addEventListener('DOMContentLoaded', () => {
  // Element references
  const topnav = document.getElementById('main-nav');
  const navLine = document.querySelector('.nav-line');

  // Top navigation buttons
  const addMoreBtn = document.getElementById('addMoreBtn');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const exportBtn = document.getElementById('exportBtn');
  const libraryBtn = document.getElementById('libraryBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const helpBtn = document.getElementById('helpBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const uploadBtn = document.getElementById('uploadBtn');
  const colorLabBtn = document.getElementById('colorLabBtn');

  // Main views and elements
  const dropArea = document.getElementById('drop-area');
  const fileSelect = document.getElementById('fileSelect');
  const fileElem = document.getElementById('fileElem');
  const uploadView = document.getElementById('uploadView');// Upload view
  const previewView = document.getElementById('previewView');// Preview view
  const settingsView = document.getElementById('settingsView');// Settings view
  const libraryView = document.getElementById('libraryView');// Library view
  const imageGrid = document.getElementById('imageGrid');
  const imageCount = document.getElementById('imageCount');
  const libraryGrid = document.getElementById('libraryGrid');
  const emptyState = document.getElementById('libraryEmptyState');
  
  // Color Correction Lab elements
  const colorCorrectionView = document.getElementById('colorCorrectionView');
  const ccMethodBtns = document.querySelectorAll('.cc-method-btn');
  const ccOriginalImage = document.getElementById('ccOriginalImage');
  const ccCorrectedImage = document.getElementById('ccCorrectedImage');
  const ccNoImage = document.getElementById('ccNoImage');
  const ccImageContainer = document.getElementById('ccImageContainer');
  const ccLoading = document.getElementById('ccLoading');
  const ccBeforeAfterToggle = document.getElementById('ccBeforeAfterToggle');
  const ccResetBtn = document.getElementById('ccResetBtn');
  const ccApplySaveBtn = document.getElementById('ccApplySaveBtn'); // May be hidden in multi-image mode
  const ccMethodControls = document.getElementById('ccMethodControls');
  const ccTheoryContent = document.getElementById('ccTheoryContent');
  const ccSplitOverlay = document.getElementById('ccSplitOverlay');
  const ccPresetName = document.getElementById('ccPresetName');
  const ccSavePresetBtn = document.getElementById('ccSavePresetBtn');
  const ccPresetList = document.getElementById('ccPresetList');
  
  // New Color Lab elements (Grid/Preview View)
  const ccGridView = document.getElementById('ccGridView');
  const ccPreviewView = document.getElementById('ccPreviewView');
  const ccImagesGrid = document.getElementById('ccImagesGrid');
  const ccBackToGridBtn = document.getElementById('ccBackToGridBtn');
  const ccPreviewImageName = document.getElementById('ccPreviewImageName');
  const ccToolGridView = document.getElementById('ccToolGridView');
  const ccToolPreviewView = document.getElementById('ccToolPreviewView');
  
  // Debug: Check if elements are found
  console.log('Color Correction elements check:');
  console.log('- ccMethodBtns:', ccMethodBtns.length);
  console.log('- colorCorrectionView:', colorCorrectionView ? 'found' : 'NULL');
  console.log('- ccGridView:', ccGridView ? 'found' : 'NULL');
  console.log('- ccPreviewView:', ccPreviewView ? 'found' : 'NULL');
  
  // Settings buttons
  const darkModeBtn = document.getElementById('darkModeBtn');
  const systemModeBtn = document.getElementById('systemModeBtn');

  // Accent color buttons
  const accentColorBtns = document.querySelectorAll('.accent-color-btn');

   // Settings inputs for export app
  const exportAppNameInput = document.getElementById('exportAppName');
  const exportAppPathInput = document.getElementById('exportAppPath');
  const exportUseAdminCheckbox = document.getElementById('exportUseAdmin');
  const exportSearchBtn = document.getElementById('exportSearchBtn');

  // Export app settings (runtime state)
  const EXPORT_SETTINGS_KEY = 'exportAppSettings';
  let exportAppName = 'krita.exe';
  let exportAppPath = '';
  let exportUseAdmin = false;

  // Accent color settings
  const ACCENT_COLOR_KEY = 'accentColorSettings';
  
  loadExportSettings();
  loadAccentColor();
  exportAppNameInput.value = exportAppName;
  exportAppPathInput.value = exportAppPath;
  exportUseAdminCheckbox.checked = exportUseAdmin;

  // ============================
  // Navigation Active State Helper
  // ============================
  
  /**
   * Update the active state of navigation buttons
   * @param {HTMLElement} activeBtn - The button to mark as active
   */
  function updateNavActiveState(activeBtn) {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => btn.classList.remove('active'));
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
  }

  let libraryImages = [];

  const LIBRARY_KEY = "persistentLibrary";
  const LIBRARY_SCROLL_KEY = "libraryScrollPosition";

  // Save library metadata only (no Base64) to localStorage
  // Images are stored on backend in persistent workspace directory
  function saveLibrary() {
    const saveData = libraryImages.map(img => ({
      id: img.id,
      name: img.name,
      size: img.size,
      issues: img.issues, // Persist analysis results
      path: img.path, // Persist backend file path for Color Correction Lab
      aspectRatio: img.aspectRatio, // Cache calculated aspect ratio
      // Store only metadata - no Base64 to avoid localStorage size limits
      // Base64 is kept in memory for current session only
    }));
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(saveData));
    console.log(`Saved library metadata for ${saveData.length} images (${JSON.stringify(saveData).length} bytes)`);
  }

  // Load library metadata (URLs must be recreated from files on disk)
  async function loadLibrary() {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      libraryImages.length = 0;

      // Restore metadata (URLs regenerated from backend)
      parsed.forEach(savedImg => {
        libraryImages.push({
          id: savedImg.id,
          name: savedImg.name,
          size: savedImg.size,
          issues: savedImg.issues || [],
          path: savedImg.path, // Backend workspace path
          aspectRatio: savedImg.aspectRatio || 1.5,
          url: null, // Regenerated from backend
          base64: null, // Memory-only, not persisted
          file: null // File handle lost after reload
        });
      });
      
      console.log(`Library loaded: ${libraryImages.length} images from metadata`);
      
      // Wait for backend, then regenerate URLs
      if (libraryImages.length > 0) {
        const backendReady = await waitForBackend();
        if (backendReady) {
          await regenerateImageURLs();
        } else {
          showToast('Backend not available - library images may not display', 'warning', 6000);
        }
      }

    } catch (err) {
      console.error("Failed to load library:", err);
    }
  }

  // Regenerate object URLs from backend workspace files with retry logic
  async function regenerateImageURLs(retryCount = 0, maxRetries = 3) {
    const imagesWithPaths = libraryImages.filter(img => img.path && !img.url);
    if (imagesWithPaths.length === 0) return;
    
    try {
      const response = await fetch('http://localhost:8081/images/get-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paths: imagesWithPaths.map(img => img.path)
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'URL regeneration failed');
      }
      
      // Update library images with fresh data URLs
      data.images.forEach((urlData, index) => {
        const img = imagesWithPaths[index];
        if (urlData.exists && urlData.dataUrl) {
          img.url = urlData.dataUrl;
          img.base64 = urlData.dataUrl; // Store Base64 for CC Lab
        } else {
          console.warn(`Image not found in workspace: ${img.name}`);
        }
      });
      
      // Re-render library grid if visible
      if (libraryView.style.display !== 'none') {
        displayLibraryGrid(true);
        updateLibraryEmptyState();
      }
      
      console.log(`✓ Regenerated URLs for ${data.images.filter(i => i.exists).length} images`);
      
    } catch (error) {
      console.error(`Failed to regenerate image URLs (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);
      
      // Retry with exponential backoff
      if (retryCount < maxRetries) {
        const delayMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(`Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return regenerateImageURLs(retryCount + 1, maxRetries);
      }
      
      showToast('Failed to load library images - backend may not be running', 'error');
    }
  }

  // ============================
  // Backend Health Check
  // ============================
  
  /**
   * Wait for backend to be ready before loading library
   * @param {number} maxAttempts - Maximum number of health check attempts
   * @param {number} delayMs - Delay between attempts in milliseconds
   * @returns {Promise<boolean>} - True if backend is ready, false otherwise
   */
  async function waitForBackend(maxAttempts = 10, delayMs = 1000) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch('http://localhost:8081/color-correct/methods', { 
          method: 'GET',
          signal: AbortSignal.timeout(2000) // 2s timeout per attempt
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

  // Initialize library loading with backend health check
  (async () => {
    await loadLibrary();
  })();

  // ============================
  // Toast Notification System
  // ============================
  
  /**
   * Show a non-blocking glassmorphism toast notification
   * @param {string} message - The message to display
   * @param {string} type - 'success', 'error', or 'info' (default)
   * @param {number} duration - Duration in milliseconds (default 4000)
   */
  function showToast(message, type = 'info', duration = 4000) {
    // Create toast container if it doesn't exist
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    
    // Add icon based on type
    let icon = '';
    if (type === 'success') {
      icon = '<i class="bi bi-check-circle-fill"></i>';
    } else if (type === 'error') {
      icon = '<i class="bi bi-exclamation-circle-fill"></i>';
    } else {
      icon = '<i class="bi bi-info-circle-fill"></i>';
    }
    
    toast.innerHTML = `
      <div class="toast__icon">${icon}</div>
      <div class="toast__message">${message}</div>
      <button class="toast__close" aria-label="Close">
        <i class="bi bi-x"></i>
      </button>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('toast--show');
    });
    
    // Auto-remove after duration
    const autoRemove = setTimeout(() => {
      removeToast(toast);
    }, duration);
    
    // Close button handler
    const closeBtn = toast.querySelector('.toast__close');
    closeBtn.addEventListener('click', () => {
      clearTimeout(autoRemove);
      removeToast(toast);
    });
    
    return toast;
  }

  /**
   * Remove a toast with animation
   * @param {HTMLElement} toast - The toast element to remove
   */
  function removeToast(toast) {
    toast.classList.remove('toast--show');
    toast.classList.add('toast--hide');
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300); // Match CSS animation duration
  }

  let uploadedImages = [];

  // ============================
  // New Navigation Button Handlers
  // ============================
  
  // Upload button - Navigate to upload/preview view
  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      libraryView.style.display = 'none';
      settingsView.style.display = 'none';
      
      if (uploadedImages.length > 0) {
        uploadView.style.display = 'none';
        previewView.style.display = 'block';
      } else {
        previewView.style.display = 'none';
        uploadView.style.display = 'block';
      }
      
      updateNavActiveState(uploadBtn);
    });
  }

  // Color Lab button - Navigate to Library and open Color Correction tab
  if (colorLabBtn) {
    colorLabBtn.addEventListener('click', () => {
      uploadView.style.display = 'none';
      previewView.style.display = 'none';
      settingsView.style.display = 'none';
      libraryView.style.display = 'block';
      
      // Switch to Color Correction view
      showColorCorrectionView();
      
      updateNavActiveState(colorLabBtn);
    });
  }

  /**
   * ButtonLoader - Reusable utility for managing button loading states
   * 
   * This utility provides a consistent UX pattern for async operations by:
   * - Disabling buttons during operations to prevent double-clicks
   * - Showing visual feedback with loading text and animated icon
   * - Automatically restoring original state after completion or error
   * 
   * Usage Examples:
   * 
   * 1. Basic usage with wrap():
   *    await ButtonLoader.wrap(myButton, 'Saving...', async () => {
   *      await saveData();
   *    });
   * 
   * 2. Manual control:
   *    const state = ButtonLoader.start(myButton, 'Processing...');
   *    try {
   *      await doSomething();
   *    } finally {
   *      ButtonLoader.stop(myButton, state);
   *    }
   */
  const ButtonLoader = {
    /**
     * Sets a button to loading state
     * @param {HTMLElement} button - The button element
     * @param {string} loadingText - Text to display during loading
     * @returns {Object} - Object with original state to restore later
     */
    start(button, loadingText = 'Loading...') {
      const originalState = {
        text: button.innerHTML,
        disabled: button.disabled,
        classList: [...button.classList]
      };
      
      button.disabled = true;
      button.classList.add('loading');
      button.innerHTML = `<i class="bi bi-hourglass-split"></i> ${loadingText}`;
      
      return originalState;
    },

    /**
     * Restores button to original state
     * @param {HTMLElement} button - The button element
     * @param {Object} originalState - State returned from start()
     */
    stop(button, originalState) {
      button.innerHTML = originalState.text;
      button.disabled = originalState.disabled;
      button.classList.remove('loading');
    },

    /**
     * Wraps an async operation with loading state management
     * Automatically handles errors and ensures state restoration
     * @param {HTMLElement} button - The button element
     * @param {string} loadingText - Text to display during loading
     * @param {Function} asyncFn - Async function to execute
     * @returns {Promise} - Result of asyncFn
     */
    async wrap(button, loadingText, asyncFn) {
      const originalState = this.start(button, loadingText);
      try {
        return await asyncFn();
      } finally {
        this.stop(button, originalState);
      }
    }
  };

  // Show/hide Clear All button
  function updateClearAllButton() {
    clearAllBtn.style.display = uploadedImages.length > 0 ? 'inline-flex' : 'none';
  }

  // Click to browse image files (Shift+Click for folders)
  fileSelect.addEventListener('click', (e) => {
    if (e.shiftKey) {
      // Shift pressed: Select folders
      fileElem.setAttribute('webkitdirectory', '');
      fileElem.removeAttribute('multiple');
    } else {
      // Default: Select files
      fileElem.removeAttribute('webkitdirectory');
      fileElem.setAttribute('multiple', '');
    }
    fileElem.click();
  });

  // Add more images button
  addMoreBtn.addEventListener('click', (e) => {
    if (e.shiftKey) {
      // Shift pressed: Select folders
      fileElem.setAttribute('webkitdirectory', '');
      fileElem.removeAttribute('multiple');
    } else {
      // Default: Select files
      fileElem.removeAttribute('webkitdirectory');
      fileElem.setAttribute('multiple', '');
    }
    fileElem.click();
  });

  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Highlight drop area when item is dragged over it
  ['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false);
  });

  function highlight() {
    dropArea.classList.add('dragover');
  }

  function unhighlight() {
    dropArea.classList.remove('dragover');
  }

  // Handle dropped files
  dropArea.addEventListener('drop', handleDrop, false);

  async function handleDrop(e) {
    const dt = e.dataTransfer;
    
    // Check if items API is available (for folder detection)
    if (dt.items) {
      const items = Array.from(dt.items);
      const allFiles = await collectFilesFromItems(items);
      if (allFiles.length > 0) {
        showToast(`Found ${allFiles.length} image(s). Processing...`, 'info', 2000);
        handleFiles(allFiles);
      } else {
        showToast('No image files found', 'error');
      }
    } else {
      // Fallback for older browsers
      handleFiles(dt.files);
    }
  }
  
  // Recursively collect all image files from dropped items (files and folders)
  async function collectFilesFromItems(items) {
    const allFiles = [];
    
    async function traverseEntry(entry) {
      if (entry.isFile) {
        return new Promise((resolve) => {
          entry.file(file => {
            // Only collect image files
            const isRaw = isRawFile(file.name);
            const isStandard = file.type.startsWith('image/');
            if (isRaw || isStandard) {
              allFiles.push(file);
            }
            resolve();
          });
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        return new Promise((resolve) => {
          dirReader.readEntries(async (entries) => {
            for (const childEntry of entries) {
              await traverseEntry(childEntry);
            }
            resolve();
          });
        });
      }
    }
    
    // Process all dropped items using Promise.all to ensure all are collected
    const promises = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          promises.push(traverseEntry(entry));
        }
      }
    }
    
    await Promise.all(promises);
    return allFiles;
  }

  // Handle selected files
  fileElem.addEventListener('change', (e) => {
    e.stopPropagation();
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
      // Reset file input after a short delay to allow selecting the same file again
      // Using setTimeout prevents the reset from triggering another change event
      setTimeout(() => {
        fileElem.value = '';
      }, 100);
    }
  });

  // RAW file detection helper
  function isRawFile(filename) {
    const rawExts = ['.cr2', '.cr3', '.nef', '.nrw', '.arw', '.dng', '.orf', '.raf', '.rw2', '.rwl', '.srw', '.pef', '.raw', '.rwz'];
    return rawExts.some(ext => filename.toLowerCase().endsWith(ext));
  }

  // Upload RAW images with two-phase processing
  async function uploadRawImages(rawFiles) {
    const formData = new FormData();
    rawFiles.forEach(f => formData.append('files', f));
    
    try {
      const response = await fetch('http://localhost:8081/images/upload-raw', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'RAW upload failed');
      }
      
      return data.images; // Returns RawImageInfo[]
    } catch (error) {
      console.error('RAW upload error:', error);
      throw error;
    }
  }

  // Batched SSE listener for RAW decode progress
  function startBatchedDecodeListener(taskIds, imageMap) {
    if (taskIds.length === 0) return;
    
    const url = `http://localhost:8081/images/decode-stream?${taskIds.map(id => 'taskIds=' + encodeURIComponent(id)).join('&')}`;
    
    fetch(url).then(response => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      function readStream() {
        reader.read().then(({done, value}) => {
          if (done) {
            console.log('RAW decode stream completed');
            return;
          }
          
          buffer += decoder.decode(value, {stream: true});
          const lines = buffer.split('\n\n');
          buffer = lines.pop();
          
          lines.forEach(message => {
            const eventLines = message.split('\n');
            let eventType = 'message';
            let eventData = '';
            
            eventLines.forEach(line => {
              if (line.startsWith('event:')) {
                eventType = line.substring(6).trim();
              } else if (line.startsWith('data:')) {
                eventData += line.substring(5).trim();
              }
            });
            
            if (!eventData) return;
            
            try {
              const parsed = JSON.parse(eventData);
              
              if (eventType === 'progress') {
                updateImageDecodeProgress(parsed.taskId, parsed.progress, imageMap);
              } else if (eventType === 'complete') {
                updateImageToFullDecode(parsed.taskId, parsed.fullPath, imageMap);
                showToast('RAW image fully decoded', 'success', 2000);
              } else if (eventType === 'error') {
                console.error('Decode error:', parsed.error);
                showToast(`Decode error: ${parsed.error}`, 'error');
              } else if (eventType === 'summary') {
                console.log('All decodes complete:', parsed);
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', eventData, e);
            }
          });
          
          readStream();
        }).catch(error => {
          console.error('SSE stream error:', error);
        });
      }
      
      readStream();
    }).catch(error => {
      console.error('Failed to start decode stream:', error);
      showToast('Failed to monitor RAW decoding', 'error');
    });
  }

  // Update image card with decode progress
  function updateImageDecodeProgress(taskId, progress, imageMap) {
    const imageData = imageMap.get(taskId);
    if (!imageData) return;
    
    imageData.decodeProgress = progress;
    
    // Update the card if it exists in the grid
    const card = document.querySelector(`[data-image-id="${imageData.id}"]`);
    if (card) {
      let progressBadge = card.querySelector('.decode-progress-badge');
      if (!progressBadge) {
        const info = card.querySelector('.image-info');
        progressBadge = document.createElement('div');
        progressBadge.className = 'decode-progress-badge';
        progressBadge.style.cssText = `
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(0, 123, 255, 0.9);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          z-index: 10;
        `;
        card.appendChild(progressBadge);
      }
      progressBadge.textContent = `Decoding ${progress}%`;
    }
  }

  // Update image to full decode when complete
  function updateImageToFullDecode(taskId, fullPath, imageMap) {
    const imageData = imageMap.get(taskId);
    if (!imageData) return;
    
    imageData.serverPath = fullPath;
    imageData.decodeProgress = 100;
    imageData.isFullyDecoded = true;
    
    // Load full-resolution image and update blob URL
    // Convert Windows backslashes to forward slashes for file:// URLs
    const fullUrl = 'file:///' + fullPath.replace(/\\/g, '/');
    fetch(fullUrl)
      .then(res => res.blob())
      .then(blob => {
        // Revoke old preview blob to free memory
        if (imageData.url) {
          URL.revokeObjectURL(imageData.url);
        }
        imageData.url = URL.createObjectURL(blob);
        
        // Update library image URL as well
        const libraryImg = libraryImages.find(lib => lib.id === imageData.id);
        if (libraryImg) {
          if (libraryImg.url) {
            URL.revokeObjectURL(libraryImg.url);
          }
          libraryImg.url = imageData.url;
          saveLibrary();
        }
        
        // Update thumbnail in card
        const card = document.querySelector(`[data-image-id="${imageData.id}"]`);
        if (card) {
          const img = card.querySelector('.image-thumbnail');
          if (img) {
            img.src = imageData.url;
          }
          
          // Remove progress badge
          const progressBadge = card.querySelector('.decode-progress-badge');
          if (progressBadge) {
            progressBadge.remove();
          }
          
          // Update RAW badge to show it's fully decoded
          const rawBadge = card.querySelector('.raw-badge');
          if (rawBadge) {
            rawBadge.textContent = 'RAW ✓';
            rawBadge.style.background = 'rgba(40, 167, 69, 0.9)';
          }
        }
      })
      .catch(err => {
        console.error('Failed to load full decode image:', fullPath, err);
      });
  }

  // Process and display files
  async function handleFiles(files) {
    if (files.length === 0) {
      return;
    }

    const fileArray = Array.from(files);
    
    // Separate RAW and non-RAW files
    const rawFiles = fileArray.filter(file => isRawFile(file.name));
    const standardFiles = fileArray.filter(file => !isRawFile(file.name) && file.type.startsWith('image/'));

    if (rawFiles.length === 0 && standardFiles.length === 0) {
      showToast('No image files found. Please select image files.', 'error');
      return;
    }

    // Handle RAW files with two-phase upload
    if (rawFiles.length > 0) {
      try {
        showToast(`Uploading ${rawFiles.length} RAW image${rawFiles.length !== 1 ? 's' : ''}...`, 'info', 3000);
        const rawImageInfos = await uploadRawImages(rawFiles);
        
        const taskIdMap = new Map(); // taskId -> imageData
        const taskIds = [];
        
        rawImageInfos.forEach(rawInfo => {
          const id = crypto.randomUUID();
          
          // Create image data with preview
          const imageData = {
            file: rawFiles.find(f => f.name === rawInfo.rawPath.split(/[\\/]/).pop()),
            id,
            name: rawInfo.rawPath.split(/[\\/]/).pop(),
            size: rawFiles.find(f => f.name === rawInfo.rawPath.split(/[\\/]/).pop())?.size || 0,
            url: null, // Will be set after fetching preview
            serverPath: rawInfo.previewPath,
            rawPath: rawInfo.rawPath,
            taskId: rawInfo.taskId,
            isRaw: true,
            isPreview: true,
            isFullyDecoded: false,
            decodeProgress: 0
          };
          
          // Fetch preview image as blob
          // Convert Windows backslashes to forward slashes for file:// URLs
          const previewUrl = 'file:///' + rawInfo.previewPath.replace(/\\/g, '/');
          fetch(previewUrl).then(res => res.blob())
            .catch((err) => {
              console.error('Failed to load preview:', rawInfo.previewPath, err);
              // Fallback: create placeholder
              return new Blob();
            })
            .then(blob => {
              imageData.url = URL.createObjectURL(blob);
              
              // Update thumbnail if card already rendered
              const card = document.querySelector(`[data-image-id="${id}"]`);
              if (card) {
                const img = card.querySelector('.image-thumbnail');
                if (img) img.src = imageData.url;
              }
              
              // Add to library so it's available for color correction
              const alreadyInLibrary = libraryImages.some(img => 
                img.name === imageData.name && img.size === imageData.size
              );
              if (!alreadyInLibrary) {
                // Calculate aspect ratio for virtual scrolling
                const img = new Image();
                img.onload = () => {
                  const aspectRatio = img.naturalWidth / img.naturalHeight;
                  
                  libraryImages.push({
                    file: imageData.file,
                    id: imageData.id,
                    name: imageData.name,
                    size: imageData.size,
                    url: imageData.url,
                    path: imageData.rawPath,
                    issues: [],
                    isRaw: true,
                    taskId: imageData.taskId,
                    aspectRatio: aspectRatio || 1.5
                  });
                  saveLibrary();
                  
                  // Recalculate virtual scroll if needed
                  if (libraryView.style.display !== 'none' && VirtualLibraryScroller.isInitialized) {
                    VirtualLibraryScroller.recalculate();
                  }
                };
                img.onerror = () => {
                  libraryImages.push({
                    file: imageData.file,
                    id: imageData.id,
                    name: imageData.name,
                    size: imageData.size,
                    url: imageData.url,
                    path: imageData.rawPath,
                    issues: [],
                    isRaw: true,
                    taskId: imageData.taskId,
                    aspectRatio: 1.5
                  });
                  saveLibrary();
                  
                  if (libraryView.style.display !== 'none' && VirtualLibraryScroller.isInitialized) {
                    VirtualLibraryScroller.recalculate();
                  }
                };
                img.src = imageData.url;
              }
            });
          
          uploadedImages.push(imageData);
          taskIdMap.set(rawInfo.taskId, imageData);
          taskIds.push(rawInfo.taskId);
        });
        
        showToast(`${rawFiles.length} RAW image${rawFiles.length !== 1 ? 's' : ''} uploaded. Full decoding in background...`, 'success', 4000);
        
        // Start background decode monitoring
        startBatchedDecodeListener(taskIds, taskIdMap);
        
      } catch (error) {
        console.error('RAW upload failed:', error);
        showToast(`RAW upload failed: ${error.message}`, 'error');
      }
    }

    // Add new standard images to the collection
    let duplicateCount = 0;
    let addedCount = 0;
    
    standardFiles.forEach(file => {
      // Check for duplicates by name and size
      const isDuplicate = uploadedImages.some(img => 
        img.name === file.name && img.size === file.size
      );
      
      if (isDuplicate) {
        duplicateCount++;
        console.log(`Skipping duplicate: "${file.name}" (${file.size} bytes)`);
        return; // Skip this file
      }
      
      const id = crypto.randomUUID();
      const url = URL.createObjectURL(file);

      const imageData = {
        file: file,
        id,
        name: file.name,
        size: file.size,
        url
      };

      uploadedImages.push(imageData);
      addedCount++;

      // Create object URL for preview and add to library
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result;

        // Check for duplicates by name+size (Base64 comparison removed for performance)
        const alreadyInLibrary = libraryImages.some(img => 
          img.name === file.name && img.size === file.size
        );
        if (alreadyInLibrary) {
            console.log(`Image "${file.name}" (${file.size} bytes) already exists in library. Skipping.`);
            return;
        }

        // Create a separate object URL for library to prevent conflicts
        const libraryUrl = URL.createObjectURL(file);
        
        // Calculate aspect ratio for virtual scrolling
        const img = new Image();
        img.onload = () => {
          const aspectRatio = img.naturalWidth / img.naturalHeight;
          
          libraryImages.push({
            file: file,
            id,
            name: file.name,
            size: file.size,
            base64,  // Keep in memory for current session only
            url: libraryUrl,  // Separate URL for library
            issues: imageData.issues,  // Include analysis results if available
            aspectRatio: aspectRatio || 1.5  // Cache for virtual scrolling
          });
          saveLibrary();  // Saves metadata including aspectRatio
          
          // Recalculate virtual scroll if library grid is visible
          if (libraryView.style.display !== 'none' && VirtualLibraryScroller.isInitialized) {
            VirtualLibraryScroller.recalculate();
          }
        };
        img.onerror = () => {
          // Fallback if image can't be loaded
          libraryImages.push({
            file: file,
            id,
            name: file.name,
            size: file.size,
            base64,
            url: libraryUrl,
            issues: imageData.issues,
            aspectRatio: 1.5  // Default fallback
          });
          saveLibrary();
          
          if (libraryView.style.display !== 'none' && VirtualLibraryScroller.isInitialized) {
            VirtualLibraryScroller.recalculate();
          }
        };
        img.src = libraryUrl;
      };
      reader.readAsDataURL(file); 
    });

    // Show notification if duplicates were found
    if (duplicateCount > 0) {
      const message = duplicateCount === 1 
        ? '1 duplicate image was skipped.' 
        : `${duplicateCount} duplicate images were skipped.`;
      
      // Create a temporary notification
      const notification = document.createElement('div');
      notification.textContent = message;
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--color-warning);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        animation: slideIn 0.3s ease-out;
      `;
      
      document.body.appendChild(notification);
      
      // Remove notification after 4 seconds
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
      }, 4000);
    }

    // Switch to preview view and display images
    displayImageGrid();
  }

  // Display image grid with thumbnails
  function displayImageGrid() {
    // Hide upload view, show preview view
    uploadView.style.display = 'none';
    previewView.style.display = 'block';

    // Update count
    imageCount.textContent = `${uploadedImages.length} image${uploadedImages.length !== 1 ? 's' : ''} uploaded`;

    // Clear and rebuild grid
    imageGrid.innerHTML = '';

    uploadedImages.forEach((imageData, index) => {
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

      // Click to enlarge a
      card.addEventListener('click', () => {
        console.log('Image clicked:', imageData.name);
        displayImage(imageData.url, "preview", imageData)
      });

      imageGrid.appendChild(card);
    });

    // UPDATE clear all button state
    updateClearAllButton();
  }

  function displayImage(imageURL, origin="preview", imageData=null) {
    // Show toast if viewing RAW preview before full decode
    if (imageData && imageData.isRaw && imageData.isPreview && !imageData.isFullyDecoded) {
      showToast('Raw image is still fully decoding - viewing preview quality', 'info', 4000);
    }
    
    // Hide all views
    uploadView.style.display = 'none';
    previewView.style.display = 'none';
    settingsView.style.display = 'none';
    libraryView.style.display = 'none';
    topnav.style.display = 'none';

    // Create fullscreen wrapper
    const full = document.createElement("div");
    full.className = "imgfullscreen";
    full.style.position = "fixed";
    full.style.top = 0;
    full.style.left = 0;
    full.style.width = "100vw";
    full.style.height = "100vh";
    full.style.display = "flex";
    full.style.alignItems = "center";
    full.style.justifyContent = "center";
    full.style.zIndex = 9999;

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
        // Perfect image - show success indicator
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

    // Image element with issue tags overlay
    full.innerHTML = `
      <button id="imgBackBtn" class="nav-btn" 
        style="position:absolute; top:20px; left:20px; background:none;">
        <i class="bi bi-arrow-left nav-icon"></i>
      </button>
      ${issueTagsHTML}
      <img src="${imageURL}" style="max-width:90%; max-height:90%; border-radius:12px;">
    `;

    document.body.appendChild(full);

    // Add close button functionality for issue overlay
    const closeOverlayBtn = document.getElementById('closeIssueOverlay');
    if (closeOverlayBtn) {
      closeOverlayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const overlay = document.getElementById('issueOverlay');
        if (overlay) {
          overlay.classList.add('hidden');
        }
      });
    }

    document.getElementById("imgBackBtn").addEventListener("click", () => {
      full.remove();
      
      // Always show the sidebar
      topnav.style.display = 'flex';

      // Show the appropriate view based on origin
      if (origin === "library") {
          libraryView.style.display = "block";
      } else {
          if (uploadedImages.length > 0) previewView.style.display = 'block';
          else uploadView.style.display = 'block';
      }
    });
  }

  // Remove image from collection
  function removeImage(imageId) {
    // Don't revoke URL here since library might still need it
    uploadedImages = uploadedImages.filter(img => img.id !== imageId);

    if (uploadedImages.length === 0) {
      previewView.style.display = 'none';
      uploadView.style.display = 'block';
    } else {
      displayImageGrid();
    }
    updateClearAllButton();
  }

  // CLEAR ALL Button handler
  clearAllBtn.addEventListener('click', function() {
    // Only revoke URLs that aren't in library
    uploadedImages.forEach(img => {
      if (img.url) {
        const isInLibrary = libraryImages.some(lib => lib.id === img.id);
        if (!isInLibrary) {
          URL.revokeObjectURL(img.url);
        }
      }
    });
    uploadedImages = [];
    previewView.style.display = 'none';
    uploadView.style.display = 'block';
    imageGrid.innerHTML = '';
    imageCount.textContent = '';
    updateClearAllButton();
    
    // Clear analysis results UI
    const summaryDiv = document.getElementById('analysisSummary');
    if (summaryDiv) summaryDiv.style.display = 'none';

    const organizeBtnEl = document.getElementById('organizeBtn');
    if (organizeBtnEl) organizeBtnEl.style.display = 'none';    // Reset any active filters
    currentFilter = 'all';
  });

  // Format file size for display
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Keyboard shortcut: Ctrl/Cmd + O to open file dialog
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      fileElem.click();
    }
    
    // F1 for help window
    if (e.key === 'F1') {
      e.preventDefault();
      helpBtn.click();
    }
  });

  // Paste from clipboard
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    const files = [];
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        files.push(file);
      }
    }
    
    if (files.length > 0) {
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));
      handleFiles(dataTransfer.files);
    }
  });

  // Clean up object URLs when window closes
  window.addEventListener('beforeunload', () => {
    uploadedImages.forEach(imageData => {
      if (imageData.url) {
        URL.revokeObjectURL(imageData.url);
      }
    });
  });

  /**
   * IMAGE ANALYSIS WORKFLOW
   * Complete photographer-focused UX with progress tracking and results preview
   */
  let currentFilter = 'all'; // For filtering images by issue type

  analyzeBtn.addEventListener('click', async () => {
    if (uploadedImages.length === 0) {
      showToast('Please upload images first.', 'error');
      return;
    }

    // Show progress container
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    
    progressContainer.style.display = 'block';

    await ButtonLoader.wrap(analyzeBtn, 'Analyzing...', async () => {
      try {
        // Step 1: Upload images (20% of progress)
        // For RAW images, use existing workspace paths instead of re-uploading
        progressText.textContent = 'Preparing images for analysis...';
        progressBar.style.width = '10%';
        progressPercent.textContent = '10%';

        const imagesToUpload = uploadedImages.filter(img => !img.isRaw);
        const rawImages = uploadedImages.filter(img => img.isRaw);
        
        let paths = [];
        
        // Upload non-RAW images
        if (imagesToUpload.length > 0) {
          const form = new FormData();
          imagesToUpload.forEach(img => form.append("files", img.file));
          
          const upRes = await fetch("http://localhost:8081/images/upload", { 
            method: "POST", 
            body: form 
          });
          
          if (!upRes.ok) {
            const errorData = await upRes.json().catch(() => ({ message: `HTTP ${upRes.status}: ${upRes.statusText}` }));
            throw new Error(errorData.message || `Upload failed: ${upRes.status}`);
          }
          
          const upData = await upRes.json();
          if (!upData.success) {
            throw new Error(upData.message || "Upload failed");
          }
          
          paths = paths.concat(upData.paths);
        }
        
        // For RAW images, use their workspace RAW paths (backend will handle cache lookup)
        paths = paths.concat(rawImages.map(img => img.rawPath));
        progressBar.style.width = '20%';
        progressPercent.textContent = '20%';

        // Step 2: Classify images with streaming progress (20% -> 95%)
        progressText.textContent = `Analyzing 0/${uploadedImages.length} images...`;
        
        const cls = await new Promise((resolve, reject) => {
          fetch("http://localhost:8081/images/classify-stream", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ paths, enableSkin: false })
          }).then(response => {
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let currentEvent = 'message';

            function readStream() {
              reader.read().then(({ done, value }) => {
                if (done) {
                  return;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop(); // Keep incomplete message in buffer

                lines.forEach(message => {
                  const eventLines = message.split('\n');
                  let eventType = 'message';
                  let eventData = '';

                  eventLines.forEach(line => {
                    if (line.startsWith('event:')) {
                      eventType = line.substring(6).trim();
                    } else if (line.startsWith('data:')) {
                      eventData += line.substring(5).trim();
                    }
                  });

                  if (!eventData) return;

                  try {
                    const parsed = JSON.parse(eventData);

                    if (eventType === 'progress') {
                      // Progress update: scale from 20% to 95%
                      const analysisProgress = 20 + (parsed.percentage * 0.75);
                      progressBar.style.width = `${analysisProgress}%`;
                      progressPercent.textContent = `${Math.round(analysisProgress)}%`;
                      progressText.textContent = `Analyzing ${parsed.current}/${parsed.total} images...`;
                    } else if (eventType === 'complete') {
                      resolve(parsed);
                    } else if (eventType === 'error') {
                      reject(new Error(parsed.message || 'Classification failed'));
                    }
                  } catch (e) {
                    console.warn('Failed to parse SSE data:', eventData, e);
                  }
                });

                readStream();
              }).catch(reject);
            }

            readStream();
          }).catch(reject);
        });

        if (!cls.success) {
          throw new Error(cls.message || "Classification failed");
        }

        // Step 3: Process results (95% -> 100%)
        progressText.textContent = 'Processing results...';
        progressBar.style.width = '95%';
        progressPercent.textContent = '95%';

        // Map results back to uploaded images
        for (let i = 0; i < paths.length && i < uploadedImages.length; i++) {
          uploadedImages[i].serverPath = paths[i];
          uploadedImages[i].issues = cls.results[i]?.issues || [];
          uploadedImages[i].features = cls.results[i]?.features || null;
          
          // Sync analysis results and path to library
          const libraryImg = libraryImages.find(lib => lib.id === uploadedImages[i].id);
          if (libraryImg) {
            libraryImg.issues = uploadedImages[i].issues;
            libraryImg.path = paths[i]; // Store backend path for Color Correction Lab
          }
        }
        
        // Save updated library with analysis results
        saveLibrary();

        progressBar.style.width = '100%';
        progressPercent.textContent = '100%';
        progressText.textContent = 'Complete!';

        // Step 4: Update UI
        displayImageGrid(); // Re-render with badges
        showAnalysisSummary(cls.results);
        showOrganizeButton();

        // Hide progress after brief delay
        setTimeout(() => {
          progressContainer.style.display = 'none';
        }, 1000);
        
      } catch (err) {
        console.error("Analysis error:", err);
        progressContainer.style.display = 'none';
        
        // Improved error messaging - distinguish network vs backend errors
        let errorMsg = err.message || 'Unknown error';
        let errorTitle = '❌ Analysis Failed';
        
        if (err.message && err.message.includes('Failed to fetch')) {
          errorTitle = '🌐 Network Error';
          errorMsg = 'Cannot connect to backend server. Please check: Backend is running (port 8081), No firewall blocking connection';
        } else if (err.message && (err.message.includes('HTTP 400') || err.message.includes('HTTP 500'))) {
          errorTitle = '⚠️ Backend Error';
          errorMsg = `The backend encountered an error: ${errorMsg}. Check console logs for details.`;
        }
        
        showToast(`${errorTitle}: ${errorMsg}`, 'error', 6000);
        throw err;
      }
    });
  });

  /**
   * Display analysis summary with issue counts and filters
   */
  function showAnalysisSummary(results) {
    const summaryDiv = document.getElementById('analysisSummary');
    const summaryContent = document.getElementById('summaryContent');
    const filtersContainer = document.getElementById('issueFilters');
    
    // Count issues
    const issueCounts = {};
    let imagesWithIssues = 0;
    
    results.forEach(r => {
      if (r.issues && r.issues.length > 0) {
        imagesWithIssues++;
        r.issues.forEach(issue => {
          issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        });
      }
    });

    const totalIssues = Object.values(issueCounts).reduce((a, b) => a + b, 0);
    const perfectImages = results.length - imagesWithIssues;

    // Get ALL issues sorted by count (descending), then alphabetically
    const allIssues = Object.entries(issueCounts)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]; // Sort by count first
        return a[0].localeCompare(b[0]); // Then alphabetically
      });

    summaryContent.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 12px;">
        <div style="text-align: center;">
          <div style="font-size: 24px; font-weight: 600; color: var(--color-primary);">${results.length}</div>
          <div style="font-size: 12px; color: var(--color-text-secondary);">Total Images</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 24px; font-weight: 600; color: var(--color-success);">${perfectImages}</div>
          <div style="font-size: 12px; color: var(--color-text-secondary);">Perfect</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 24px; font-weight: 600; color: var(--color-warning);">${imagesWithIssues}</div>
          <div style="font-size: 12px; color: var(--color-text-secondary);">Need Fixes</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 24px; font-weight: 600; color: var(--color-error);">${totalIssues}</div>
          <div style="font-size: 12px; color: var(--color-text-secondary);">Total Issues</div>
        </div>
      </div>
      ${allIssues.length > 0 ? `
        <div style="margin-top: 12px;">
          <strong>All Issues Found:</strong>
          <div style="margin: 8px 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px;">
            ${allIssues.map(([issue, count]) => `
              <div style="padding: 4px 8px; background: var(--color-bg-secondary); border-radius: 4px; font-size: 13px;">
                <span style="color: var(--color-text);">${formatIssueName(issue)}</span>
                <span style="color: var(--color-text-secondary); font-size: 11px;"> (${count})</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Build filter buttons - show ALL issues as filter options
    filtersContainer.innerHTML = `
      <button class="filter-btn active" data-filter="all">
        All (${results.length})
      </button>
      <button class="filter-btn" data-filter="perfect">
        ✓ Perfect (${perfectImages})
      </button>
      <button class="filter-btn" data-filter="issues">
        ⚠ Issues (${imagesWithIssues})
      </button>
    `;

    // Add ALL issue filters (not just top 3)
    allIssues.forEach(([issue, count]) => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.dataset.filter = issue;
      btn.textContent = `${formatIssueName(issue)} (${count})`;
      filtersContainer.appendChild(btn);
    });

    // Bind filter buttons
    filtersContainer.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Update active state
        filtersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Apply filter
        const filter = btn.dataset.filter;
        currentFilter = filter;
        applyImageFilter(filter);
      });
    });

    summaryDiv.style.display = 'block';
  }

  /**
   * Filter images based on selected criteria
   */
  function applyImageFilter(filter) {
    const cards = document.querySelectorAll('.image-card');
    
    cards.forEach((card, index) => {
      const imageData = uploadedImages[index];
      let show = true;

      if (filter === 'perfect') {
        show = !imageData.issues || imageData.issues.length === 0;
      } else if (filter === 'issues') {
        show = imageData.issues && imageData.issues.length > 0;
      } else if (filter !== 'all') {
        // Specific issue filter
        show = imageData.issues && imageData.issues.includes(filter);
      }

      card.style.display = show ? 'block' : 'none';
    });
  }

  /**
   * Format issue names for display (shortened versions)
   */
  function formatIssueName(issue) {
    return issue
      .replace(/_/g, ' ')
      .replace(/Needs /g, '')
      .replace(/Oversaturated/g, 'Oversat')
      .replace(/ColorCast/g, 'Cast')
      .replace(/SkinTone/g, 'Skin');
  }

  /**
   * Show export buttons after successful analysis
   */
  function showOrganizeButton() {
    const organizeBtn = document.getElementById('organizeBtn');
    if (organizeBtn) organizeBtn.style.display = 'inline-flex';
  }

  /**
   * EXPORT TO FOLDER - Creates folder structure with organized images
   * Respects the current filter selection
   */
  const organizeBtn = document.getElementById('organizeBtn');
  if (organizeBtn) {
    organizeBtn.addEventListener('click', async () => {
      // Check if a specific issue filter is selected
      if (currentFilter === 'all' || currentFilter === 'perfect' || currentFilter === 'issues') {
        const filterName = currentFilter === 'all' ? 'All Images' : 
                          currentFilter === 'perfect' ? 'Perfect Images' : 
                          'Images with Issues';
        showToast(
          `No Specific Filter Selected. Please select a specific issue filter first. Organize & Export creates a folder for the selected issue type. Current filter: ${filterName}`,
          'error',
          5000
        );
        return;
      }

      // Filter images based on current selection
      const filteredImages = uploadedImages.filter(img => 
        img.issues && img.issues.includes(currentFilter)
      );
      
      const paths = filteredImages.map(u => u.serverPath).filter(Boolean);
      
      if (paths.length === 0) {
        showToast(`No images found with filter: ${formatIssueName(currentFilter)}`, 'error');
        return;
      }

      try {
        // Step 1: Ask user to select output folder
        const outputRoot = await window.dialog.selectFolder();
        if (!outputRoot) return; // User canceled

        // Step 2: Confirm action with preview
        const confirm = window.confirm(
          `📁 Organize & Export\n\n` +
          `Filter: ${formatIssueName(currentFilter)}\n` +
          `Output Location: ${outputRoot}\n\n` +
          `This will create 1 folder and copy ${filteredImages.length} image${filteredImages.length !== 1 ? 's' : ''}.\n` +
          `Original files will be COPIED (not moved).\n` +
          `A CSV report will be generated.\n\n` +
          `Continue?`
        );
        if (!confirm) return;

        // Step 3: Execute grouping with only filtered images
        await ButtonLoader.wrap(organizeBtn, 'Organizing...', async () => {
          const res = await fetch("http://localhost:8081/images/group", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paths,
              outputRoot,
              copy: true,
              enableSkin: false,
              filterIssue: currentFilter
            })
          });

          if (!res.ok) {
            throw new Error(`Server error: ${res.status}`);
          }

          const data = await res.json();
          if (!data.success) {
            throw new Error(data.message || "Organization failed");
          }

          // Step 4: Show success dialog with options
          const openNow = window.confirm(
            `✅ Organization Complete!\n\n` +
            `📁 Location: ${data.outputRoot}\n` +
            `📊 CSV Report: ${data.csvPath}\n` +
            `Filter: ${formatIssueName(currentFilter)}\n\n` +
            `${Object.entries(data.counts || {}).map(([issue, count]) => 
              `   • ${formatIssueName(issue)}: ${count} image${count !== 1 ? 's' : ''}`
            ).join('\n')}\n\n` +
            `Open folder now?`
          );

          if (openNow) {
            window.dialog.openFolder(data.outputRoot);
          }
        });

      } catch (err) {
        console.error("Organize error:", err);
        showToast(`Organization Failed: ${err.message}`, 'error', 5000);
      }
    });
  }

  // Selection mode state
  let isLibrarySelectionMode = false;

  // Selection management functions
  function toggleImageSelection(imageId) {
    const index = selectedLibraryImages.indexOf(imageId);
    if (index > -1) {
      selectedLibraryImages.splice(index, 1);
    } else {
      selectedLibraryImages.push(imageId);
    }
    
    // Update visuals without full re-render
    VirtualLibraryScroller.updateSelectionVisuals();
    updateSelectionControls();
  }

  function selectAllImages() {
    selectedLibraryImages = libraryImages.map(img => img.id);
    VirtualLibraryScroller.updateSelectionVisuals();
    updateSelectionControls();
    closeSelectDropdown();
  }

  function deselectAllImages() {
    selectedLibraryImages = [];
    VirtualLibraryScroller.updateSelectionVisuals();
    updateSelectionControls();
  }

  function selectByIssue(issueType) {
    console.log('selectByIssue called with:', issueType);
    
    // DEFENSIVE: Validate inputs
    if (!issueType) {
      console.error('No issue type provided');
      showToast('Invalid issue type', 'error');
      return;
    }
    
    if (libraryImages.length === 0) {
      console.warn('Library is empty');
      showToast('Library is empty - please upload and analyze images first', 'warning');
      return;
    }
    
    // Select all images that have the specified issue
    selectedLibraryImages = libraryImages
      .filter(img => {
        const hasIssue = Array.isArray(img.issues) && img.issues.includes(issueType);
        if (hasIssue) {
          console.log(`✓ Image "${img.name}" has issue "${issueType}"`);
        }
        return hasIssue;
      })
      .map(img => img.id);
    
    console.log(`Selected ${selectedLibraryImages.length} images with issue "${issueType}"`);
    
    if (selectedLibraryImages.length === 0) {
      showToast(`No images found with issue: ${formatIssueName(issueType)}`, 'info');
    } else {
      showToast(`Selected ${selectedLibraryImages.length} image${selectedLibraryImages.length !== 1 ? 's' : ''} with ${formatIssueName(issueType)}`, 'success');
    }
    
    VirtualLibraryScroller.updateSelectionVisuals();
    updateSelectionControls();
    closeSelectDropdown();
  }

  function enableManualSelectionMode() {
    isLibrarySelectionMode = true;
    VirtualLibraryScroller.updateSelectionVisuals();
    updateSelectionControls();
    closeSelectDropdown();
  }

  function disableManualSelectionMode() {
    isLibrarySelectionMode = false;
    selectedLibraryImages = [];
    VirtualLibraryScroller.updateSelectionVisuals();
    updateSelectionControls();
  }

  function updateSelectionControls() {
    const selectionCount = document.getElementById('selectionCount');
    const addToCorrectionBtn = document.getElementById('addToCorrectionBtn');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const cancelSelectionItem = document.querySelector('[data-action="cancel-selection"]');
    const manualSelectionItem = document.querySelector('[data-action="manual-selection"]');
    
    if (selectionCount) {
      if (selectedLibraryImages.length > 0) {
        selectionCount.textContent = `${selectedLibraryImages.length} image${selectedLibraryImages.length !== 1 ? 's' : ''} selected`;
        selectionCount.style.display = 'block';
      } else {
        selectionCount.style.display = 'none';
      }
    }
    
    if (addToCorrectionBtn) {
      addToCorrectionBtn.disabled = selectedLibraryImages.length === 0;
    }
    
    if (deleteSelectedBtn) {
      deleteSelectedBtn.style.display = selectedLibraryImages.length > 0 ? 'inline-flex' : 'none';
    }
    
    // Show/hide Cancel Selection option based on manual selection mode
    if (cancelSelectionItem) {
      cancelSelectionItem.style.display = isLibrarySelectionMode ? 'flex' : 'none';
    }
    if (manualSelectionItem) {
      manualSelectionItem.style.display = isLibrarySelectionMode ? 'none' : 'flex';
    }
  }

  function populateIssueSubmenu() {
    const issueSubmenu = document.getElementById('issueSubmenu');
    if (!issueSubmenu) return;
    
    // Show loading state
    issueSubmenu.innerHTML = '<div class="dropdown-item-empty">Loading issues...</div>';
    
    // Get unique issues from all library images
    const allIssues = new Set();
    let imagesWithIssues = 0;
    
    libraryImages.forEach(img => {
      // DEFENSIVE: Check if issues exists and is array
      if (Array.isArray(img.issues) && img.issues.length > 0) {
        imagesWithIssues++;
        img.issues.forEach(issue => allIssues.add(issue));
      }
    });
    
    // DEBUG: Log what we found
    console.log(`Found ${allIssues.size} unique issues across ${imagesWithIssues}/${libraryImages.length} images`);
    console.log('Issues:', Array.from(allIssues));
    
    if (allIssues.size === 0) {
      issueSubmenu.innerHTML = '<div class="dropdown-item-empty">No analyzed images with issues found. Please analyze images first.</div>';
      return;
    }
    
    // Create submenu items for each issue
    issueSubmenu.innerHTML = '';
    Array.from(allIssues).sort().forEach(issue => {
      const count = libraryImages.filter(img => 
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

  // Select dropdown functionality
  const selectDropdownBtn = document.getElementById('selectDropdownBtn');
  const selectDropdown = document.getElementById('selectDropdown');
  const selectByIssueItem = document.querySelector('[data-action="select-by-issue"]');
  const issueSubmenu = document.getElementById('issueSubmenu');
  const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');

  // DEBUG: Log element finding
  console.log('Select dropdown elements check:');
  console.log('- selectDropdownBtn:', selectDropdownBtn ? 'FOUND' : 'NULL');
  console.log('- selectDropdown:', selectDropdown ? 'FOUND' : 'NULL');
  console.log('- selectByIssueItem:', selectByIssueItem ? 'FOUND' : 'NULL');
  console.log('- issueSubmenu:', issueSubmenu ? 'FOUND' : 'NULL');

  function closeSelectDropdown() {
    if (selectDropdown) selectDropdown.style.display = 'none';
    if (issueSubmenu) issueSubmenu.style.display = 'none';
  }

  if (selectDropdownBtn && selectDropdown) {
    selectDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = selectDropdown.style.display === 'block';
      selectDropdown.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        populateIssueSubmenu();
      }
    });
  }

  if (selectByIssueItem && issueSubmenu) {
    selectByIssueItem.addEventListener('mouseenter', () => {
      // Position submenu relative to the trigger button
      const rect = selectByIssueItem.getBoundingClientRect();
      const dropdownRect = selectDropdown.getBoundingClientRect();
      
      // Calculate position relative to dropdown container
      const topOffset = rect.top - dropdownRect.top;
      
      issueSubmenu.style.top = `${topOffset}px`;
      issueSubmenu.style.display = 'block';
    });
    selectByIssueItem.addEventListener('mouseleave', (e) => {
      // Keep submenu open if mouse moves into it
      setTimeout(() => {
        if (!issueSubmenu.matches(':hover') && !selectByIssueItem.matches(':hover')) {
          issueSubmenu.style.display = 'none';
        }
      }, 200);
    });
    issueSubmenu.addEventListener('mouseleave', () => {
      issueSubmenu.style.display = 'none';
    });
    
    // Add click handler for better accessibility and touch device support
    selectByIssueItem.addEventListener('click', (e) => {
      console.log('Select-by-issue item clicked');
      e.stopPropagation();
      // Toggle submenu visibility on click
      if (issueSubmenu.style.display === 'block') {
        issueSubmenu.style.display = 'none';
      } else {
        const rect = selectByIssueItem.getBoundingClientRect();
        const dropdownRect = selectDropdown.getBoundingClientRect();
        const topOffset = rect.top - dropdownRect.top;
        issueSubmenu.style.top = `${topOffset}px`;
        issueSubmenu.style.display = 'block';
        populateIssueSubmenu();
      }
    });
  }

  // Dropdown item actions
  document.querySelectorAll('.dropdown-item[data-action]').forEach(item => {
    item.addEventListener('click', (e) => {
      const action = item.dataset.action;
      
      // Don't handle click for select-by-issue (has its own handler)
      if (action === 'select-by-issue') {
        e.stopPropagation();
        return;
      }
      
      e.stopPropagation();
      
      switch(action) {
        case 'select-all':
          selectAllImages();
          break;
        case 'manual-selection':
          enableManualSelectionMode();
          break;
        case 'cancel-selection':
          disableManualSelectionMode();
          closeSelectDropdown();
          break;
      }
    });
  });

  // Delete selected button
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', () => {
      if (selectedLibraryImages.length === 0) return;
      
      const confirmDelete = confirm(`Delete ${selectedLibraryImages.length} selected image${selectedLibraryImages.length !== 1 ? 's' : ''}?`);
      if (!confirmDelete) return;
      
      // Remove selected images
      selectedLibraryImages.forEach(id => {
        const img = libraryImages.find(i => i.id == id);
        if (img) URL.revokeObjectURL(img.url);
      });
      
      libraryImages = libraryImages.filter(img => !selectedLibraryImages.includes(img.id));
      uploadedImages = uploadedImages.filter(img => !selectedLibraryImages.includes(img.id));
      
      selectedLibraryImages = [];
      
      saveLibrary();
      displayLibraryGrid(true); // Force full re-render after deletion
      updateSelectionControls();
      
      // Clear scroll position if library is now empty
      if (libraryImages.length === 0) {
        VirtualLibraryScroller.clearScrollPosition();
      }
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.library-select-container')) {
      closeSelectDropdown();
    }
    // Exit manual selection mode when clicking outside library grid
    if (isLibrarySelectionMode && !e.target.closest('#libraryGrid') && !e.target.closest('.library-select-container')) {
      disableManualSelectionMode();
    }
  });

  libraryBtn.addEventListener('click', async () => {
    uploadView.style.display = 'none';
    previewView.style.display = 'none';
    settingsView.style.display = 'none';

    libraryView.style.display = 'block';
    
    // Switch to Library Grid view
    showLibraryGrid();
    
    updateNavActiveState(libraryBtn);
    await displayLibraryGrid(true); // Force full initialization
    updateSelectionControls();
    
    // Restore scroll position after grid is rendered
    setTimeout(() => {
      VirtualLibraryScroller.restoreScrollPosition();
    }, 50);
  });

  async function displayLibraryGrid(forceFullRender = false) {
    // Update empty state visibility
    updateLibraryEmptyState();
    
    // If library is empty, disable virtual scrolling
    if (libraryImages.length === 0) {
      VirtualLibraryScroller.disable();
      return;
    }
    
    // Initialize or recalculate virtual scrolling
    if (forceFullRender || !VirtualLibraryScroller.isInitialized) {
      await VirtualLibraryScroller.initialize(forceFullRender);
      
      // Attach event delegation for clicks (only once)
      if (forceFullRender || !VirtualLibraryScroller.isInitialized) {
        attachLibraryGridEventDelegation();
      }
    } else {
      // Just update visuals for selection changes
      VirtualLibraryScroller.updateSelectionVisuals();
    }
  }
  
  /**
   * Attach event delegation to library grid for efficient event handling
   * Uses event delegation on scroll container to handle all clicks
   */
  function attachLibraryGridEventDelegation() {
    const scrollContainer = document.getElementById('libraryScrollContainer');
    if (!scrollContainer) return;
    
    // Remove existing listener if any
    const oldListener = scrollContainer._libraryClickHandler;
    if (oldListener) {
      scrollContainer.removeEventListener('click', oldListener);
    }
    
    // Create new delegated click handler
    const clickHandler = (e) => {
      // Handle checkbox clicks
      const checkbox = e.target.closest('.library-checkbox');
      if (checkbox) {
        e.stopPropagation();
        const imageId = checkbox.dataset.imageId;
        if (imageId) {
          toggleImageSelection(imageId);
        }
        return;
      }
      
      // Handle image clicks
      const image = e.target.closest('.library-image');
      if (image) {
        const imageId = image.dataset.imageId;
        const img = libraryImages.find(i => i.id == imageId);
        
        if (img) {
          // Check if we're in library view (not hidden)
          if (libraryView.style.display !== 'none') {
            // Check if image has been analyzed
            if (!img.path) {
              showToast('Please analyze this image first before using Color Correction Lab', 'warning');
              return;
            }
            
            // Add single image to Color Correction Lab session
            ccSessionImages = [{
              id: img.id,
              name: img.name,
              path: img.path,
              url: img.url,
              base64: img.base64,
              issues: img.issues || [],
              features: img.features || null,
              aspectRatio: img.aspectRatio || 1.5,
              isRaw: img.isRaw || false
            }];
            ccCurrentImageIndex = 0;
            ccCorrectionResults = {};
            
            // Switch to Color Correction view
            showColorCorrectionView();
            
            // Load the image in preview mode (single image view)
            loadImageAtIndex(0);
            switchToPreviewView();
            
            showToast(`Opened "${img.name}" in Color Correction Lab`, 'success');
          }
        }
        return;
      }
    };
    
    scrollContainer.addEventListener('click', clickHandler);
    scrollContainer._libraryClickHandler = clickHandler;
  }
  
  // Show/hide library empty state based on image count
  function updateLibraryEmptyState() {
    const hasImages = libraryImages.length > 0;
    
    if (emptyState) {
      emptyState.style.display = hasImages ? 'none' : 'flex';
    }
    
    const scrollContainer = document.getElementById('libraryScrollContainer');
    if (scrollContainer) {
      scrollContainer.style.display = hasImages ? 'block' : 'none';
    }
  }

  settingsBtn.addEventListener('click', () => {
    uploadView.style.display = 'none';
    previewView.style.display = 'none';
    libraryView.style.display = 'none';
    settingsView.style.display = 'block';
    
    updateNavActiveState(settingsBtn);
  });

  // Send images to Spring Boot, get back absolute disk paths
  async function fetchImagePaths(images) {
    const form = new FormData();
    images.forEach(img => form.append("files", img.file));

    const res = await fetch("http://localhost:8081/images/upload", {
      method: "POST",
      body: form
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "Image upload failed");
    }

    return data.paths;
  }

  exportBtn.addEventListener("click", async () => {
    if (uploadedImages.length === 0) {
      showToast("No images to export.", 'error');
      return;
    }

    // Check if images have been analyzed
    const hasAnalysis = uploadedImages.some(img => img.issues !== undefined);
    
    if (!hasAnalysis) {
      showToast("Please analyze images first before exporting. Click the 'Analyze' button to run image analysis.", 'error', 5000);
      return;
    }

    // Check if a specific issue filter is selected (not 'all', 'perfect', or 'issues')
    if (currentFilter === 'all' || currentFilter === 'perfect' || currentFilter === 'issues') {
      const filterName = currentFilter === 'all' ? 'All Images' : 
                        currentFilter === 'perfect' ? 'Perfect Images' : 
                        'Images with Issues';
      showToast(
        `No Specific Filter Selected. Please select a specific issue filter first. Export is only available when filtering by a specific issue type. Current filter: ${filterName}`,
        'error',
        5000
      );
      return;
    }
    
    // Filter images based on current filter
    const imagesToExport = uploadedImages.filter(img => 
      img.issues && img.issues.includes(currentFilter)
    );
    
    if (imagesToExport.length === 0) {
      showToast(`No images found with filter: ${formatIssueName(currentFilter)}`, 'error');
      return;
    }
    
    if (!exportAppPath) {
      showToast("No export application configured. Go to Settings → Export Application to choose one.", 'error', 5000);
      return;
    }
    
    // Confirm export
    const confirmed = confirm(
      `Export ${imagesToExport.length} image${imagesToExport.length !== 1 ? 's' : ''} to editing application?\n\n` +
      `Filter: ${formatIssueName(currentFilter)}\n` +
      `Application: ${exportAppName || exportAppPath}`
    );
    
    if (!confirmed) return;

    // Use ButtonLoader to manage loading state
    await ButtonLoader.wrap(exportBtn, 'Exporting...', async () => {
      try {
        console.log(`Exporting ${imagesToExport.length} images (filter: ${currentFilter})...`);
        const imagePaths = await fetchImagePaths(imagesToExport);

        console.log("Launching export application...");
        const result = await window.api.launchApp(exportAppPath, imagePaths);

        console.log("Export success:", result);
        showToast(
          `Export Successful! ${imagesToExport.length} image${imagesToExport.length !== 1 ? 's' : ''} exported. Filter: ${formatIssueName(currentFilter)}`,
          'success',
          4000
        );
      } catch (err) {
        console.error("Export error:", err);
        showToast("Export failed: " + err.message, 'error');
        throw err;
      }
    });
  });

  // Open help window using secure IPC communication with loading indicator and offline check
  helpBtn.addEventListener('click', async () => {
    // Use ButtonLoader for visual feedback
    await ButtonLoader.wrap(helpBtn, 'Opening...', async () => {
      await window.help.openWindow();
      // Small delay to ensure window is visible before resetting button
      await new Promise(resolve => setTimeout(resolve, 300));
    });
  });

  // Settings subpage theme
  darkModeBtn.addEventListener('click', async () => {
    const isDarkMode = await window.darkmode.toggle()
    document.getElementById('theme-source').innerHTML = isDarkMode ? 'Dark' : 'Light';});

  systemModeBtn.addEventListener('click', async () => {
    await window.darkmode.system()
    document.getElementById('theme-source').innerHTML = 'System'
  });

  // Settings export button functions
  function loadExportSettings() {
    try {
      const raw = localStorage.getItem(EXPORT_SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      exportAppName = parsed.name || exportAppName;
      exportAppPath = parsed.path || '';
      exportUseAdmin = !!parsed.useAdmin;
    } catch (e) {
      console.error('Failed to load export settings:', e);
    }
  }

  function saveExportSettings() {
    const data = {
      name: exportAppName,
      path: exportAppPath,
      useAdmin: exportUseAdmin
    };
    localStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify(data));
  }

  exportUseAdminCheckbox.addEventListener('change', () => {
    exportUseAdmin = exportUseAdminCheckbox.checked;
    saveExportSettings();
  });

  exportAppNameInput.addEventListener('change', () => {
    exportAppName = exportAppNameInput.value.trim() || 'krita.exe';
    saveExportSettings();
  });

  exportSearchBtn.addEventListener('click', async () => {
    exportAppName = exportAppNameInput.value.trim() || 'krita.exe';

    // Disable input during search to prevent focus issues
    exportAppNameInput.disabled = true;
    exportAppNameInput.blur();

    // Use loading indicator for search operation
    try {
      await ButtonLoader.wrap(exportSearchBtn, 'Searching...', async () => {
        try {
          let foundPath;
          if (exportUseAdmin) {
            // May show admin prompt; if user cancels, this throws
            foundPath = await window.api.searchExecutableAdmin(exportAppName);
          } else {
            // Quick non-admin search (PATH only)
            foundPath = await window.api.searchExecutable(exportAppName);
          }

          exportAppPath = foundPath;
          exportAppPathInput.value = exportAppPath;
          saveExportSettings();
          showToast(`Executable found and saved: ${exportAppPath}`, 'success');
        } catch (err) {
          console.error('Executable search error:', err);
          showToast(`Could not find executable: ${err.message || err}`, 'error');
          // "Skip the search if permission is not granted" → we simply don't update path
          throw err; // Re-throw to ensure proper error handling
        }
      });
    } finally {
      // Re-enable input and restore focus
      exportAppNameInput.disabled = false;
      exportAppNameInput.focus();
    }
  });

  // Accent color functions
  function loadAccentColor() {
    try {
      const saved = localStorage.getItem(ACCENT_COLOR_KEY);
      if (!saved) {
        // Set default to blue
        setActiveAccentButton('blue');
        return;
      }
      const parsed = JSON.parse(saved);
      applyAccentColor(parsed.rgb, parsed.name);
      setActiveAccentButton(parsed.name);
    } catch (e) {
      console.error('Failed to load accent color:', e);
      setActiveAccentButton('blue');
    }
  }

  function saveAccentColor(colorName, rgb) {
    const data = {
      name: colorName,
      rgb: rgb
    };
    localStorage.setItem(ACCENT_COLOR_KEY, JSON.stringify(data));
  }

  function applyAccentColor(rgb, colorName) {
    const root = document.documentElement;
    const [r, g, b] = rgb.split(',').map(n => parseInt(n.trim()));
    
    // Apply accent color (works for both light and dark mode via CSS)
    root.style.setProperty('--accent-color', `rgba(${r}, ${g}, ${b}, 1)`);
    root.style.setProperty('--accent-color-rgb', rgb);
    root.style.setProperty('--accent-subtle', `rgba(${r}, ${g}, ${b}, 0.08)`);
    root.style.setProperty('--accent-border', `rgba(${r}, ${g}, ${b}, 0.2)`);
    root.style.setProperty('--accent-shadow', `rgba(${r}, ${g}, ${b}, 0.15)`);
    
    // Set fullscreen background with accent tint for light mode
    const h = rgbToHue(r, g, b);
    const lightBg = `hsla(${h}, 70%, 95%, 0.95)`;
    root.style.setProperty('--fullscreen-bg', lightBg);
  }

  function rgbToHue(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    
    if (delta === 0) return 0;
    
    let h;
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    return h;
  }

  function setActiveAccentButton(colorName) {
    accentColorBtns.forEach(btn => {
      if (btn.dataset.color === colorName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Accent color button handlers
  accentColorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const colorName = btn.dataset.color;
      const rgb = btn.dataset.rgb;
      
      applyAccentColor(rgb, colorName);
      saveAccentColor(colorName, rgb);
      setActiveAccentButton(colorName);
    });
  });

  // ============================
  // Multi-Image Selection
  // ============================
  let selectedLibraryImages = []; // Array of selected image IDs for batch operations

  // ============================
  // Virtual Library Scroller
  // ============================
  
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
    
    /**
     * Initialize virtual scrolling system
     */
    async initialize(forceRecalculate = false) {
      // Get DOM references
      this.scrollContainer = document.getElementById('libraryScrollContainer');
      this.scrollSpacer = document.getElementById('libraryScrollSpacer');
      this.grid = document.getElementById('libraryGrid');
      this.skeleton = document.getElementById('libraryLoadingSkeleton');
      
      if (!this.scrollContainer || !this.grid) {
        console.error('Virtual scroll containers not found');
        return;
      }
      
      // Check if library is empty
      if (libraryImages.length === 0) {
        this.disable();
        return;
      }
      
      this.isEnabled = true;
      
      // Calculate aspect ratios if missing
      const needsAspectCalculation = forceRecalculate || libraryImages.some(img => !img.aspectRatio);
      
      if (needsAspectCalculation) {
        await this.calculateMissingAspectRatios();
      }
      
      // Calculate dimensions
      this.calculateDimensions();
      
      // Attach scroll listener
      if (!this.isInitialized) {
        this.scrollContainer.addEventListener('scroll', () => this.handleScroll());
      }
      
      this.isInitialized = true;
      
      // Initial render
      this.renderVisibleCards();
    },
    
    /**
     * Calculate aspect ratios for images that don't have them cached
     */
    async calculateMissingAspectRatios() {
      const imagesToCalculate = libraryImages.filter(img => !img.aspectRatio);
      
      if (imagesToCalculate.length === 0) return;
      
      // Show skeleton loading
      if (this.skeleton) {
        this.skeleton.style.display = 'flex';
      }
      
      console.log(`Calculating aspect ratios for ${imagesToCalculate.length} images...`);
      
      const promises = imagesToCalculate.map(img => {
        return new Promise((resolve) => {
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
        });
      });
      
      await Promise.all(promises);
      
      // Hide skeleton
      if (this.skeleton) {
        this.skeleton.style.display = 'none';
      }
      
      // Save updated aspect ratios
      saveLibrary();
      
      console.log('Aspect ratio calculation complete');
    },
    
    /**
     * Calculate average aspect ratio from all library images
     */
    calculateAverageAspectRatio() {
      const validRatios = libraryImages
        .map(img => img.aspectRatio)
        .filter(ratio => ratio && ratio > 0);
      
      if (validRatios.length === 0) return this.DEFAULT_ASPECT_RATIO;
      
      const sum = validRatios.reduce((acc, val) => acc + val, 0);
      return sum / validRatios.length;
    },
    
    /**
     * Calculate grid dimensions and layout parameters
     * For masonry, most calculations are just for informational purposes
     */
    calculateDimensions() {
      if (!this.scrollContainer) return;
      
      // Get container width
      this.containerWidth = this.scrollContainer.clientWidth;
      
      // Column count is controlled by CSS columns property
      // We estimate it for logging purposes
      this.columnCount = Math.floor((this.containerWidth + this.CARD_GAP) / (this.MIN_COLUMN_WIDTH + this.CARD_GAP));
      this.columnCount = Math.max(1, Math.min(this.columnCount, this.MAX_COLUMNS));
      
      // Masonry handles layout automatically, no need for height calculations
      // Clear any spacer height since columns doesn't need it
      if (this.scrollSpacer) {
        this.scrollSpacer.style.height = 'auto';
      }
      
      console.log(`Masonry layout configured: ~${this.columnCount} columns`);
    },

    /**
     * Calculate visible range based on scroll position
     * For masonry layout, this is an approximation since column heights vary
     */
    getVisibleRange(scrollTop) {
      const viewportHeight = this.scrollContainer.clientHeight;
      
      // Estimate which cards might be visible
      // For masonry, we render more liberally since exact positioning varies
      const estimatedStartRow = Math.max(0, Math.floor(scrollTop / this.rowHeight) - this.bufferRows * 2);
      const estimatedEndRow = Math.ceil((scrollTop + viewportHeight) / this.rowHeight) + this.bufferRows * 2;
      
      const startIndex = Math.max(0, estimatedStartRow * this.columnCount);
      const endIndex = Math.min(libraryImages.length, estimatedEndRow * this.columnCount);
      
      return {
        startIndex,
        endIndex
      };
    },
    
    /**
     * Render only visible cards
     * For masonry layout, we render all cards since CSS columns handles layout efficiently
     */
    renderVisibleCards() {
      if (!this.isEnabled || !this.grid) return;
      
      // Clear grid
      this.grid.innerHTML = '';
      
      // Render all cards (masonry layout handles positioning)
      libraryImages.forEach(img => {
        const card = document.createElement('div');
        card.className = 'library-card';
        card.dataset.imageId = img.id;
        
        // Add selected class if image is selected
        if (selectedLibraryImages.includes(img.id)) {
          card.classList.add('library-card--selected');
        }
        
        // Create checkbox
        const checkbox = document.createElement('div');
        checkbox.className = `library-checkbox ${isLibrarySelectionMode ? '' : 'hidden'}`;
        checkbox.dataset.imageId = img.id;
        
        const checkIcon = document.createElement('i');
        checkIcon.className = `bi ${selectedLibraryImages.includes(img.id) ? 'bi-check-circle-fill' : 'bi-circle'}`;
        checkbox.appendChild(checkIcon);
        
        // Create image
        const image = document.createElement('img');
        image.src = img.url;
        image.alt = img.name;
        image.title = img.name;
        image.className = 'library-image';
        image.dataset.imageId = img.id;
        
        // Create issue badge if needed
        if (!isLibrarySelectionMode && img.issues && img.issues.length > 0) {
          const badge = document.createElement('div');
          badge.className = 'glass-issue-badge';
          badge.textContent = img.issues.length;
          card.appendChild(badge);
        }
        
        card.appendChild(checkbox);
        card.appendChild(image);
        
        this.grid.appendChild(card);
      });
    },
    
    /**
     * Handle scroll events (throttled)
     */
    handleScroll() {
      if (!this.isEnabled) return;
      
      // For masonry layout, we're rendering all cards
      // so no need to re-render on scroll, just save position
      
      // Cancel previous RAF
      if (this.scrollRAF) {
        cancelAnimationFrame(this.scrollRAF);
      }
      
      this.scrollRAF = requestAnimationFrame(() => {
        // Save scroll position (throttled)
        this.saveScrollPosition();
      });
    },
    
    /**
     * Save scroll position to localStorage (throttled)
     */
    saveScrollPosition() {
      const now = Date.now();
      if (now - this.lastScrollSave < 250) return;
      
      this.lastScrollSave = now;
      localStorage.setItem(LIBRARY_SCROLL_KEY, this.scrollContainer.scrollTop.toString());
    },
    
    /**
     * Restore scroll position from localStorage
     */
    restoreScrollPosition() {
      if (!this.scrollContainer) return;
      
      const savedScroll = localStorage.getItem(LIBRARY_SCROLL_KEY);
      if (savedScroll) {
        this.scrollContainer.scrollTop = parseInt(savedScroll, 10);
      }
    },
    
    /**
     * Clear saved scroll position
     */
    clearScrollPosition() {
      localStorage.removeItem(LIBRARY_SCROLL_KEY);
    },
    
    /**
     * Recalculate dimensions when library changes
     */
    recalculate() {
      if (!this.isEnabled) return;
      
      console.log('Recalculating virtual scroll...');
      this.calculateDimensions();
      this.renderVisibleCards();
    },
    
    /**
     * Disable virtual scrolling (for empty library)
     */
    disable() {
      this.isEnabled = false;
      if (this.grid) {
        this.grid.innerHTML = '';
      }
      if (this.scrollSpacer) {
        this.scrollSpacer.style.height = '0';
      }
    },
    
    /**
     * Update selection visuals without full re-render
     */
    updateSelectionVisuals() {
      if (!this.grid) return;
      
      // Update all visible cards
      const cards = this.grid.querySelectorAll('.library-card');
      cards.forEach(card => {
        const imageId = card.dataset.imageId;
        const isSelected = selectedLibraryImages.includes(imageId);
        
        // Update card class
        if (isSelected) {
          card.classList.add('library-card--selected');
        } else {
          card.classList.remove('library-card--selected');
        }
        
        // Update checkbox icon
        const checkbox = card.querySelector('.library-checkbox');
        if (checkbox) {
          const icon = checkbox.querySelector('i');
          if (icon) {
            icon.className = `bi ${isSelected ? 'bi-check-circle-fill' : 'bi-circle'}`;
          }
          
          // Show/hide checkbox based on selection mode
          if (isLibrarySelectionMode) {
            checkbox.classList.remove('hidden');
          } else {
            checkbox.classList.add('hidden');
          }
        }
      });
    }
  };

  // ============================
  // Color Correction Lab
  // ============================

  const CC_PRESETS_KEY = 'colorCorrectionPresets';
  let ccCurrentMethod = null; // Changed from 'gray_world' to null for fresh start
  let ccCurrentImage = null;
  let ccCurrentImagePath = null;
  let ccCurrentParameters = {};
  let ccMethods = [];
  let ccShowBefore = false;
  let ccDebounceTimer = null;
  
  // Category-to-method mapping (workflow-ordered)
  const methodCategories = {
    white_balance: ['gray_world', 'white_patch', 'shades_of_gray'],
    exposure: ['exposure'],
    saturation: ['saturation'],
    advanced: ['color_matrix', 'color_distribution_alignment']
  };
  let ccCurrentCategory = null;
  
  // Multi-image session management
  let ccSessionImages = []; // Images currently in Color Correction Lab
  let ccCurrentImageIndex = 0; // Index of currently displayed image
  let ccCorrectionResults = {}; // Store correction results: {imagePath: {method, parameters, applied, base64}}

  // Load available methods from backend
  async function loadColorCorrectionMethods() {
    try {
      const response = await fetch('http://localhost:8081/color-correct/methods');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      ccMethods = await response.json();
      console.log('Loaded color correction methods:', ccMethods.length);
    } catch (err) {
      console.error('Failed to load color correction methods:', err);
      showToast('Failed to connect to color correction service', 'error');
    }
  }

  // Helper functions for switching between library grid and color correction views
  const librarySelectionControls = document.getElementById('librarySelectionControls');
  
  function showLibraryGrid() {
    console.log('Switching to Library Grid view');
    const libraryScrollContainer = document.getElementById('libraryScrollContainer');
    
    libraryGrid.style.display = 'block';
    colorCorrectionView.style.display = 'none';
    
    // Show library scroll container
    if (libraryScrollContainer) {
      libraryScrollContainer.style.display = 'block';
    }
    
    // Show selection controls in Library view
    if (librarySelectionControls) {
      librarySelectionControls.style.display = 'flex';
    }
  }
  
  function showColorCorrectionView() {
    console.log('Switching to Color Correction view');
    const libraryScrollContainer = document.getElementById('libraryScrollContainer');
    
    libraryGrid.style.display = 'none';
    colorCorrectionView.style.display = 'grid';
    
    // Hide library scroll container to prevent interference
    if (libraryScrollContainer) {
      libraryScrollContainer.style.display = 'none';
    }
    
    // Hide selection controls and empty state in Color Correction Lab
    if (librarySelectionControls) {
      librarySelectionControls.style.display = 'none';
    }

    if (emptyState) {
      emptyState.style.display = 'none';
    }
    
    // Load methods if not already loaded
    if (ccMethods.length === 0) {
      loadColorCorrectionMethods();
    }
  }

  // Category selection
  const ccCategoryBtns = document.querySelectorAll('.cc-method-btn[data-category]');
  const ccMethodDropdown = document.getElementById('ccMethodDropdown');
  console.log('Setting up color correction category buttons, found:', ccCategoryBtns.length);
  
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
  
  // Algorithm dropdown selection
  ccMethodDropdown.addEventListener('change', (e) => {
    const method = e.target.value;
    if (method) {
      console.log('Method selected from dropdown:', method);
      ccCurrentMethod = method;
      updateMethodControls(method);
      updateTheoryContent(method);
      
      // Re-apply correction if image is loaded AND method doesn't require unfilled parameters
      if (ccCurrentImagePath) {
        const methodInfo = ccMethods.find(m => m.id === method);
        const requiresReference = methodInfo?.parameters.some(p => p.name === 'referenceImagePath');
        
        // Only auto-apply if method doesn't need a reference, or if reference is already set
        if (!requiresReference || ccCurrentParameters.referenceImagePath) {
          applyColorCorrection();
        }
      }
    }
  });
  
  // Populate method dropdown based on selected category
  function populateMethodDropdown(category) {
    const methods = methodCategories[category];
    if (!methods) {
      console.warn('No methods found for category:', category);
      return;
    }
    
    // Clear dropdown and add placeholder
    ccMethodDropdown.innerHTML = '<option value="" selected disabled>Select an algorithm...</option>';
    
    // Populate with methods from this category
    methods.forEach(methodId => {
      const methodInfo = ccMethods.find(m => m.id === methodId);
      if (methodInfo) {
        const option = document.createElement('option');
        option.value = methodId;
        option.textContent = methodInfo.name;
        ccMethodDropdown.appendChild(option);
      }
    });
    
    // Reset selection
    ccMethodDropdown.value = '';
    
    // Display placeholder text in controls and theory panels
    ccMethodControls.innerHTML = '<p style="color: var(--color-text-secondary);">Select an algorithm from the dropdown above.</p>';
    ccTheoryContent.innerHTML = '<p style="color: var(--color-text-secondary);">Select an algorithm to view its theory and research background.</p>';
  }

  // Update controls panel based on selected method
  function updateMethodControls(method) {
    const methodInfo = ccMethods.find(m => m.id === method);
    if (!methodInfo) {
      ccMethodControls.innerHTML = '<p style="color: var(--color-text-secondary);">No parameters for this method</p>';
      return;
    }

    if (methodInfo.parameters.length === 0) {
      ccMethodControls.innerHTML = '<p style="color: var(--color-text-secondary);">This method has no adjustable parameters. It applies automatically.</p>';
      ccCurrentParameters = {};
      return;
    }

    let html = '';
    methodInfo.parameters.forEach(param => {
      // Special handling for reference image path parameter
      if (param.name === 'referenceImagePath') {
        const value = ccCurrentParameters[param.name] || '';
        ccCurrentParameters[param.name] = value;
        
        html += `
          <div class="form-group">
            <label class="form-label">${param.label}</label>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <input 
                type="text" 
                class="form-control cc-ref-path-input" 
                data-param="${param.name}"
                placeholder="Select reference image..."
                value="${value}"
                readonly
                style="flex: 1; cursor: pointer; font-size: 12px;">
              <button class="btn btn--secondary btn--sm cc-select-ref-btn" style="white-space: nowrap;">
                <i class="bi bi-folder-open"></i> Browse
              </button>
            </div>
            ${value ? `<div class="cc-ref-preview" style="margin-top: 8px;">
              <img src="file://${value}" style="max-width: 100%; height: auto; border-radius: var(--radius-base); border: 1px solid var(--color-border);">
            </div>` : ''}
            <p style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">${param.description}</p>
          </div>
        `;
        return;
      }
      
      // Standard numeric parameter slider
      const value = ccCurrentParameters[param.name] !== undefined 
        ? ccCurrentParameters[param.name] 
        : param.defaultValue;
      ccCurrentParameters[param.name] = value;

      html += `
        <div class="form-group">
          <label class="form-label">
            ${param.label}
            <span style="color: var(--color-text-secondary); font-weight: normal; margin-left: 8px;">${value.toFixed(2)}</span>
          </label>
          <input 
            type="range" 
            class="cc-slider" 
            data-param="${param.name}"
            min="${param.min}" 
            max="${param.max}" 
            step="${param.step}" 
            value="${value}">
          <p style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">${param.description}</p>
        </div>
      `;
    });

    ccMethodControls.innerHTML = html;

    // Attach slider event listeners
    const sliders = ccMethodControls.querySelectorAll('.cc-slider');
    sliders.forEach(slider => {
      slider.addEventListener('input', (e) => {
        const param = e.target.dataset.param;
        const value = parseFloat(e.target.value);
        ccCurrentParameters[param] = value;

        // Update label
        const label = e.target.previousElementSibling;
        const span = label.querySelector('span');
        if (span) span.textContent = value.toFixed(2);

        // Debounced preview update
        clearTimeout(ccDebounceTimer);
        ccDebounceTimer = setTimeout(() => {
          if (ccCurrentImagePath) {
            applyColorCorrection();
          }
        }, 300);
      });
    });
    
    // Attach reference image selection button listener
    const selectRefBtn = ccMethodControls.querySelector('.cc-select-ref-btn');
    if (selectRefBtn) {
      selectRefBtn.addEventListener('click', async () => {
        // Open file dialog to select reference image from workspace
        const result = await window.api.selectReferenceImage();
        if (result && result.filePath) {
          ccCurrentParameters.referenceImagePath = result.filePath;
          // Refresh controls to show preview
          updateMethodControls(ccCurrentMethod);
          // Trigger preview with new reference
          if (ccCurrentImagePath) {
            applyColorCorrection();
          }
        }
      });
    }
  }

  // Update theory content based on selected method
  function updateTheoryContent(method) {
    const methodInfo = ccMethods.find(m => m.id === method);
    if (!methodInfo) {
      ccTheoryContent.innerHTML = '<p>Loading theory content...</p>';
      return;
    }

    // Determine the citation based on the method
    let citation = 'Bianco, S. (2010). "Color Correction Algorithms for Digital Cameras." PhD Thesis.';
    if (method === 'color_distribution_alignment') {
      citation = 'Dal\'Col, L.; Coelho, D.; Madeira, T.; Dias, P.; Oliveira, M. (2023). "A Sequential Color Correction Approach for Texture Mapping of 3D Meshes." <i>Sensors</i> 23, 607.';
    }

    const theoryHtml = `
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

    ccTheoryContent.innerHTML = theoryHtml;
  }

  // Load image into Color Correction Lab
  function loadImageIntoLab(libraryImage) {
    ccCurrentImage = libraryImage;
    ccCurrentImagePath = libraryImage.path || null;
    
    if (!ccCurrentImagePath && libraryImage.url) {
      // For images without backend path, show warning
      showToast('This image needs to be re-uploaded to use Color Correction Lab', 'warning');
      return;
    }

    ccNoImage.style.display = 'none';
    ccImageContainer.style.display = 'grid';
    ccOriginalImage.src = libraryImage.url;
    ccCorrectedImage.src = libraryImage.url;
    updateSaveButtonStates();

    // Apply correction only if method is selected and doesn't require unfilled parameters
    if (ccCurrentMethod) {
      const methodInfo = ccMethods.find(m => m.id === ccCurrentMethod);
      const requiresReference = methodInfo?.parameters.some(p => p.name === 'referenceImagePath');
      
      if (!requiresReference || ccCurrentParameters.referenceImagePath) {
        applyColorCorrection();
      }
    }
  }

  // Apply color correction via backend
  async function applyColorCorrection() {
    if (!ccCurrentImagePath) return;

    ccLoading.style.display = 'flex';
    ccCorrectedImage.style.display = 'none';

    try {
      const response = await fetch('http://localhost:8081/color-correct/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: ccCurrentMethod,
          parameters: ccCurrentParameters,
          imagePath: ccCurrentImagePath
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // Backend already returns full data URL with prefix
        ccCorrectedImage.src = result.base64Image;
        ccCorrectedImage.style.display = 'block';
        
        // Store correction result for multi-image session tracking
        if (ccCurrentImagePath) {
          ccCorrectionResults[ccCurrentImagePath] = {
            method: ccCurrentMethod,
            parameters: { ...ccCurrentParameters },
            base64: result.base64Image,
            applied: true,
            saved: false
          };
          updateSaveButtonStates();
        }
      } else {
        throw new Error(result.message);
      }

    } catch (err) {
      console.error('Color correction error:', err);
      showToast(`Correction failed: ${err.message}`, 'error');
    } finally {
      ccLoading.style.display = 'none';
    }
  }

  // Before/After toggle
  ccBeforeAfterToggle.addEventListener('click', () => {
    ccShowBefore = !ccShowBefore;
    
    if (ccShowBefore) {
      // Show original (before), hide corrected
      ccOriginalImage.style.display = 'block';
      ccCorrectedImage.style.display = 'none';
      ccBeforeAfterToggle.innerHTML = '<i class="bi bi-eye-slash"></i> Showing Before';
    } else {
      // Show corrected (after), hide original
      ccOriginalImage.style.display = 'none';
      ccCorrectedImage.style.display = 'block';
      ccBeforeAfterToggle.innerHTML = '<i class="bi bi-eye"></i> Before/After';
    }
  });

  // Reset parameters
  ccResetBtn.addEventListener('click', () => {
    const methodInfo = ccMethods.find(m => m.id === ccCurrentMethod);
    if (methodInfo) {
      ccCurrentParameters = {};
      methodInfo.parameters.forEach(param => {
        ccCurrentParameters[param.name] = param.defaultValue;
      });
      updateMethodControls(ccCurrentMethod);
      
      // Only auto-apply if image is loaded AND method doesn't require unfilled parameters
      if (ccCurrentImagePath) {
        const requiresReference = methodInfo.parameters.some(p => p.name === 'referenceImagePath');
        
        // Only auto-apply if method doesn't need a reference, or if reference is already set
        if (!requiresReference || ccCurrentParameters.referenceImagePath) {
          applyColorCorrection();
        }
      }
    }
  });

  // Note: ccApplySaveBtn listener removed - replaced by ccSaveCurrentBtn in multi-image implementation

  // Preset management
  function loadPresets() {
    const raw = localStorage.getItem(CC_PRESETS_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  function savePresets(presets) {
    localStorage.setItem(CC_PRESETS_KEY, JSON.stringify(presets));
  }

  function renderPresetList() {
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
        </div>
      `;
    });
    html += '</div>';
    
    ccPresetList.innerHTML = html;

    // Attach event listeners
    ccPresetList.querySelectorAll('.cc-load-preset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        const preset = presets[index];
        
        // Set method
        ccCurrentMethod = preset.method;
        ccMethodBtns.forEach(b => {
          if (b.dataset.method === preset.method) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });

        // Set parameters
        ccCurrentParameters = { ...preset.parameters };
        updateMethodControls(preset.method);
        updateTheoryContent(preset.method);

        // Apply if image loaded
        if (ccCurrentImagePath) {
          applyColorCorrection();
        }

        showToast(`Loaded preset: ${preset.name}`, 'success');
      });
    });

    ccPresetList.querySelectorAll('.cc-delete-preset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
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

  ccSavePresetBtn.addEventListener('click', () => {
    const name = ccPresetName.value.trim();
    if (!name) {
      showToast('Please enter a preset name', 'warning');
      return;
    }

    const presets = loadPresets();
    presets.push({
      name: name,
      method: ccCurrentMethod,
      parameters: { ...ccCurrentParameters }
    });

    savePresets(presets);
    renderPresetList();
    ccPresetName.value = '';
    showToast(`Preset "${name}" saved`, 'success');
  });

  // Initialize preset list
  renderPresetList();

  // ============================
  // Multi-Image Selection & Batch Correction
  // ============================
  
  const selectAllBtn = document.getElementById('selectAllBtn');
  const deselectAllBtn = document.getElementById('deselectAllBtn');
  const addToCorrectionBtn = document.getElementById('addToCorrectionBtn');
  const ccNavigationBar = document.getElementById('ccNavigationBar');
  const ccPrevImageBtn = document.getElementById('ccPrevImageBtn');
  const ccNextImageBtn = document.getElementById('ccNextImageBtn');
  const ccCurrentImageNum = document.getElementById('ccCurrentImageNum');
  const ccTotalImages = document.getElementById('ccTotalImages');
  const ccRemoveFromLabBtn = document.getElementById('ccRemoveFromLabBtn');
  const ccSaveCurrentBtn = document.getElementById('ccSaveCurrentBtn');
  const ccApplyToAllBtn = document.getElementById('ccApplyToAllBtn');
  const ccSaveAllBtn = document.getElementById('ccSaveAllBtn');
  
  // Helper function definitions (must be defined before use)
  
  // Update save button states based on correction status
  function updateSaveButtonStates() {
    const hasCorrectedImage = ccCorrectedImage && ccCorrectedImage.style.display !== 'none';
    const hasMultipleImages = ccSessionImages.length > 1;
    const hasUnsavedCorrections = Object.values(ccCorrectionResults).some(r => r.applied && !r.saved);
    
    // Individual save button
    if (ccSaveCurrentBtn) {
      ccSaveCurrentBtn.disabled = !hasCorrectedImage;
    }
    
    // Apply to all button (show only when multiple images)
    if (ccApplyToAllBtn) {
      if (hasMultipleImages) {
        ccApplyToAllBtn.style.display = 'inline-flex';
        ccApplyToAllBtn.disabled = !hasCorrectedImage;
      } else {
        ccApplyToAllBtn.style.display = 'none';
      }
    }
    
    // Save all button (show only when there are unsaved corrections)
    if (ccSaveAllBtn) {
      if (hasMultipleImages && hasUnsavedCorrections) {
        ccSaveAllBtn.style.display = 'inline-flex';
        ccSaveAllBtn.disabled = false;
      } else {
        ccSaveAllBtn.style.display = 'none';
      }
    }
  }
  
  // Update navigation button states and counter
  function updateNavigationState() {
    if (ccSessionImages.length <= 1) {
      ccNavigationBar.style.display = 'none';
      return;
    }
    
    ccNavigationBar.style.display = 'flex';
    ccCurrentImageNum.textContent = ccCurrentImageIndex + 1;
    ccTotalImages.textContent = ccSessionImages.length;
    
    ccPrevImageBtn.disabled = ccCurrentImageIndex === 0;
    ccNextImageBtn.disabled = ccCurrentImageIndex === ccSessionImages.length - 1;
  }
  
  // Helper function to load image at specific index in session
  function loadImageAtIndex(index) {
    if (index < 0 || index >= ccSessionImages.length) return;
    
    const img = ccSessionImages[index];
    ccCurrentImageIndex = index;
    ccCurrentImagePath = img.path;
    ccCurrentImage = img;
    
    // Safety check: ensure image has backend path
    if (!ccCurrentImagePath) {
      showToast('This image needs to be analyzed first before color correction can be applied', 'warning');
      ccNoImage.style.display = 'flex';
      ccImageContainer.style.display = 'none';
      return;
    }
    
    // Load original image
    ccOriginalImage.src = img.url || img.base64;
    ccImageContainer.style.display = 'grid';
    ccNoImage.style.display = 'none';
    
    // Check if we have a correction result for this image
    if (ccCorrectionResults[img.path] && ccCorrectionResults[img.path].base64) {
      ccCorrectedImage.src = ccCorrectionResults[img.path].base64;
      ccCorrectedImage.style.display = 'block';
      ccCurrentMethod = ccCorrectionResults[img.path].method;
      ccCurrentParameters = { ...ccCorrectionResults[img.path].parameters };
      
      // Update method selection
      ccMethodBtns.forEach(btn => {
        if (btn.dataset.method === ccCurrentMethod) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      
      updateMethodControls(ccCurrentMethod);
      updateTheoryContent(ccCurrentMethod);
    } else {
      // No correction yet, apply default correction only if method is selected
      ccCorrectedImage.style.display = 'none';
      
      if (ccCurrentMethod) {
        const methodInfo = ccMethods.find(m => m.id === ccCurrentMethod);
        const requiresReference = methodInfo?.parameters.some(p => p.name === 'referenceImagePath');
        
        if (!requiresReference || ccCurrentParameters.referenceImagePath) {
          applyColorCorrection();
        }
      }
    }
    
    updateNavigationState();
    updateSaveButtonStates();
  }
  
  // Clear Color Correction Lab
  function clearColorCorrectionLab() {
    ccSessionImages = [];
    ccCurrentImageIndex = 0;
    ccCurrentImagePath = null;
    ccCurrentImage = null;
    ccCorrectionResults = {};
    
    ccImageContainer.style.display = 'none';
    ccNoImage.style.display = 'flex';
    ccNavigationBar.style.display = 'none';
    
    // Reset to grid view
    switchToGridView();
    updateSaveButtonStates();
  }
  
  // ============================
  // Grid/Preview View Switching
  // ============================
  
  /**
   * Switch to Grid View (show all images in session as thumbnails)
   */
  function switchToGridView() {
    if (ccGridView) ccGridView.style.display = 'block';
    if (ccPreviewView) ccPreviewView.style.display = 'none';
    
    // Update toolbar buttons
    if (ccToolGridView) ccToolGridView.classList.add('active');
    if (ccToolPreviewView) ccToolPreviewView.classList.remove('active');
    
    // Populate the grid with current session images
    renderColorLabGrid();
  }
  
  /**
   * Switch to Preview View (show single image for editing)
   */
  function switchToPreviewView() {
    if (ccGridView) ccGridView.style.display = 'none';
    if (ccPreviewView) ccPreviewView.style.display = 'grid';
    
    // Update toolbar buttons
    if (ccToolGridView) ccToolGridView.classList.remove('active');
    if (ccToolPreviewView) ccToolPreviewView.classList.add('active');
  }
  
  /**
   * Render the image grid in Color Lab
   */
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
      const hasCorrection = ccCorrectionResults[img.path] && ccCorrectionResults[img.path].applied;
      const isSaved = ccCorrectionResults[img.path] && ccCorrectionResults[img.path].saved;
      const isSelected = index === ccCurrentImageIndex;
      
      let statusIcon = '';
      let statusClass = '';
      if (isSaved) {
        statusIcon = '<i class="bi bi-check-circle-fill"></i>';
        statusClass = 'corrected';
      } else if (hasCorrection) {
        statusIcon = '<i class="bi bi-pencil-fill"></i>';
        statusClass = 'pending';
      }
      
      return `
        <div class="cc-grid-item ${isSelected ? 'selected' : ''}" data-index="${index}" data-path="${img.path || ''}">
          <img src="${img.url || img.base64}" alt="${img.name}" loading="lazy">
          ${statusIcon ? `<div class="cc-grid-item-status ${statusClass}">${statusIcon}</div>` : ''}
          <div class="cc-grid-item-overlay">
            <span>${img.name}</span>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers to grid items
    const gridItems = ccImagesGrid.querySelectorAll('.cc-grid-item');
    gridItems.forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index, 10);
        openImageInPreview(index);
      });
    });
  }
  
  /**
   * Open a specific image from the grid in preview mode
   */
  function openImageInPreview(index) {
    if (index < 0 || index >= ccSessionImages.length) return;
    
    const img = ccSessionImages[index];
    ccCurrentImageIndex = index;
    
    // Update preview image name
    if (ccPreviewImageName) {
      ccPreviewImageName.textContent = img.name || `Image ${index + 1}`;
    }
    
    // Load the image
    loadImageAtIndex(index);
    
    // Switch to preview view
    switchToPreviewView();
  }
  
  // Toolbar view toggle button handlers
  if (ccToolGridView) {
    ccToolGridView.addEventListener('click', () => {
      switchToGridView();
    });
  }
  
  if (ccToolPreviewView) {
    ccToolPreviewView.addEventListener('click', () => {
      if (ccSessionImages.length > 0) {
        switchToPreviewView();
      } else {
        showToast('Add images from Your Library first', 'info');
      }
    });
  }
  
  // Back to grid button handler
  if (ccBackToGridBtn) {
    ccBackToGridBtn.addEventListener('click', () => {
      switchToGridView();
    });
  }
  
  // Selection control button handlers
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', selectAllImages);
  }
  
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', deselectAllImages);
  }
  
  if (addToCorrectionBtn) {
    addToCorrectionBtn.addEventListener('click', () => {
      // Exit manual selection mode after adding to correction lab
      if (isLibrarySelectionMode) {
        disableManualSelectionMode();
      }
      
      const selectedImages = libraryImages.filter(img => selectedLibraryImages.includes(img.id));
      if (selectedImages.length === 0) return;
      
      // Check if images have been analyzed (have backend path)
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
      
      // Initialize Color Correction Lab session with selected images (preserve all data)
      ccSessionImages = selectedImages.map(img => ({
        id: img.id,
        name: img.name,
        path: img.path,
        url: img.url,
        base64: img.base64,
        issues: img.issues || [],           // Preserve analysis results
        features: img.features || null,     // Preserve ML features
        aspectRatio: img.aspectRatio || 1.5, // Preserve aspect ratio
        isRaw: img.isRaw || false           // Preserve RAW flag
      }));
      ccCurrentImageIndex = 0;
      ccCorrectionResults = {};
      
      // Render the grid with new images
      renderColorLabGrid();
      
      // Switch to Color Correction view (will show grid view)
      showColorCorrectionView();
      
      // Ensure we're showing grid view with the new images
      switchToGridView();
      
      showToast(`${selectedImages.length} image${selectedImages.length !== 1 ? 's' : ''} added to Color Correction Lab`, 'success');
    });
  }
  
  // Navigation button handlers
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
  
  if (ccRemoveFromLabBtn) {
    ccRemoveFromLabBtn.addEventListener('click', () => {
      if (ccSessionImages.length === 0) return;
      
      const confirmed = confirm(`Remove \"${ccSessionImages[ccCurrentImageIndex].name}\" from Color Correction Lab?`);
      if (!confirmed) return;
      
      // Remove current image from session
      ccSessionImages.splice(ccCurrentImageIndex, 1);
      
      // Clear correction result for this image
      const removedPath = ccCurrentImagePath;
      delete ccCorrectionResults[removedPath];
      
      if (ccSessionImages.length === 0) {
        // No more images, clear the lab
        clearColorCorrectionLab();
        showToast('All images removed from lab', 'info');
      } else {
        // Load adjacent image
        if (ccCurrentImageIndex >= ccSessionImages.length) {
          ccCurrentImageIndex = ccSessionImages.length - 1;
        }
        loadImageAtIndex(ccCurrentImageIndex);
        // Also update the grid
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
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: ccCurrentMethod,
              parameters: ccCurrentParameters,
              imagePath: ccCurrentImagePath
            })
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const result = await response.json();
          
          if (result.success) {
            // Mark as saved in correction results
            if (ccCorrectionResults[ccCurrentImagePath]) {
              ccCorrectionResults[ccCurrentImagePath].saved = true;
            }
            
            showToast(`Image saved: ${ccSessionImages[ccCurrentImageIndex].name}`, 'success');
            updateSaveButtonStates();
          } else {
            throw new Error(result.message);
          }
        } catch (err) {
          console.error('Save error:', err);
          showToast(`Save failed: ${err.message}`, 'error');
          throw err;
        }
      });
    });
  }
  
  // Apply correction to all images in session
  if (ccApplyToAllBtn) {
    ccApplyToAllBtn.addEventListener('click', async () => {
      if (ccSessionImages.length === 0) return;
      
      const confirmed = confirm(
        `Apply current correction settings to all ${ccSessionImages.length} images?\\n\\n` +
        `Method: ${ccCurrentMethod}\\n` +
        `This will process all images but NOT save them automatically.`
      );
      
      if (!confirmed) return;
      
      // Show progress container
      const progressContainer = document.getElementById('progressContainer');
      const progressBar = document.getElementById('progressBar');
      const progressText = document.getElementById('progressText');
      const progressPercent = document.getElementById('progressPercent');
      
      progressContainer.style.display = 'block';
      
      await ButtonLoader.wrap(ccApplyToAllBtn, 'Processing...', async () => {
        try {
          const total = ccSessionImages.length;
          let completed = 0;
          
          // Process images sequentially with progress tracking
          for (const img of ccSessionImages) {
            progressText.textContent = `Processing ${completed + 1} of ${total}: ${img.name}`;
            progressPercent.textContent = `${Math.round((completed / total) * 100)}%`;
            progressBar.style.width = `${(completed / total) * 100}%`;
            
            try {
              const response = await fetch('http://localhost:8081/color-correct/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  method: ccCurrentMethod,
                  parameters: ccCurrentParameters,
                  imagePath: img.path
                })
              });
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }
              
              const result = await response.json();
              
              if (result.success) {
                // Store correction result
                ccCorrectionResults[img.path] = {
                  method: ccCurrentMethod,
                  parameters: { ...ccCurrentParameters },
                  base64: result.base64Image,
                  applied: true,
                  saved: false
                };
              }
            } catch (err) {
              console.error(`Error processing ${img.name}:`, err);
              // Continue with next image
            }
            
            completed++;
          }
          
          progressBar.style.width = '100%';
          progressPercent.textContent = '100%';
          progressText.textContent = 'Batch processing complete!';
          
          setTimeout(() => {
            progressContainer.style.display = 'none';
          }, 1000);
          
          showToast(`Corrections applied to ${completed} images. Use "Save All Corrected" to save.`, 'success', 5000);
          updateSaveButtonStates();
          
          // Refresh current image display to show corrected version
          if (ccCorrectionResults[ccCurrentImagePath] && ccCorrectionResults[ccCurrentImagePath].base64) {
            ccCorrectedImage.src = ccCorrectionResults[ccCurrentImagePath].base64;
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
  
  // Save all corrected images
  if (ccSaveAllBtn) {
    ccSaveAllBtn.addEventListener('click', async () => {
      // Get all images with applied corrections that haven't been saved
      const toSave = Object.entries(ccCorrectionResults).filter(([path, result]) => 
        result.applied && !result.saved
      );
      
      if (toSave.length === 0) {
        showToast('No unsaved corrections to save', 'info');
        return;
      }
      
      const confirmed = confirm(
        `Save ${toSave.length} corrected image${toSave.length !== 1 ? 's' : ''} to workspace?\\n\\n` +
        `This will permanently save the corrections.`
      );
      
      if (!confirmed) return;
      
      // Show progress
      const progressContainer = document.getElementById('progressContainer');
      const progressBar = document.getElementById('progressBar');
      const progressText = document.getElementById('progressText');
      const progressPercent = document.getElementById('progressPercent');
      
      progressContainer.style.display = 'block';
      
      await ButtonLoader.wrap(ccSaveAllBtn, 'Saving...', async () => {
        try {
          const total = toSave.length;
          let completed = 0;
          let failed = 0;
          
          for (const [path, result] of toSave) {
            progressText.textContent = `Saving ${completed + 1} of ${total}...`;
            progressPercent.textContent = `${Math.round((completed / total) * 100)}%`;
            progressBar.style.width = `${(completed / total) * 100}%`;
            
            try {
              const response = await fetch('http://localhost:8081/color-correct/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  method: result.method,
                  parameters: result.parameters,
                  imagePath: path
                })
              });
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }
              
              const saveResult = await response.json();
              
              if (saveResult.success) {
                result.saved = true;
                completed++;
              } else {
                failed++;
              }
            } catch (err) {
              console.error(`Error saving ${path}:`, err);
              failed++;
            }
          }
          
          progressBar.style.width = '100%';
          progressPercent.textContent = '100%';
          progressText.textContent = 'Save complete!';
          
          setTimeout(() => {
            progressContainer.style.display = 'none';
          }, 1000);
          
          if (failed === 0) {
            showToast(`Successfully saved ${completed} image${completed !== 1 ? 's' : ''}`, 'success');
          } else {
            showToast(`Saved ${completed} image${completed !== 1 ? 's' : ''}, ${failed} failed`, 'warning', 5000);
          }
          
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
  
  // Navigation button handlers
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
  
  if (ccRemoveFromLabBtn) {

    ccRemoveFromLabBtn.addEventListener('click', () => {
      if (ccSessionImages.length === 0) return;
      
      const confirmRemove = confirm('Remove this image from Color Correction Lab?');
      if (!confirmRemove) return;
      
      ccSessionImages.splice(ccCurrentImageIndex, 1);
      
      if (ccSessionImages.length === 0) {
        clearColorCorrectionLab();
        showLibraryGrid();
        showToast('Color Correction Lab cleared', 'info');
      } else {
        if (ccCurrentImageIndex >= ccSessionImages.length) {
          ccCurrentImageIndex = ccSessionImages.length - 1;
        }
        loadImageAtIndex(ccCurrentImageIndex);
        updateNavigationState();
        updateSaveButtonStates();
      }
    });
  }

}); // End of DOMContentLoaded
