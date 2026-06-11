// ── File Ingestion — Drop, Select, RAW & Standard processing ─────────────────
import { showToast }   from './toast.js';
import { saveLibrary } from './library.js';

// Module-private context — injected via initFileIngestion()
let _uploadedImages;
let _libraryImages;
let _displayImageGrid;
let _onNewLibraryImage;  // () => void  — called when a new library entry is pushed

/**
 * Inject shared state + callbacks.  Must be called once inside DOMContentLoaded
 * before the first file drop or file-input change event fires.
 */
export function initFileIngestion({ uploadedImages, libraryImages,
                                    displayImageGrid, onNewLibraryImage }) {
  _uploadedImages    = uploadedImages;
  _libraryImages     = libraryImages;
  _displayImageGrid  = displayImageGrid;
  _onNewLibraryImage = onNewLibraryImage;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns true if the filename has a recognised RAW extension. */
export function isRawFile(filename) {
  const rawExts = ['.cr2', '.cr3', '.nef', '.nrw', '.arw', '.dng', '.orf',
                   '.raf', '.rw2', '.rwl', '.srw', '.pef', '.raw', '.rwz'];
  return rawExts.some(ext => filename.toLowerCase().endsWith(ext));
}

/** Process and display a FileList or File[]. */
export async function handleFiles(files) {
  if (files.length === 0) return;

  const fileArray    = Array.from(files);
  const rawFiles     = fileArray.filter(f => isRawFile(f.name));
  const standardFiles = fileArray.filter(f => !isRawFile(f.name) && f.type.startsWith('image/'));

  if (rawFiles.length === 0 && standardFiles.length === 0) {
    showToast('No image files found. Please select image files.', 'error');
    return;
  }

  if (rawFiles.length > 0) await processRawFiles(rawFiles);
  processStandardFiles(standardFiles);
  _displayImageGrid();
}

/** Handler for the dragover/drop event on the drop-zone element. */
export async function handleDrop(e) {
  const dt = e.dataTransfer;

  if (dt.items) {
    const allFiles = await collectFilesFromItems(Array.from(dt.items));
    if (allFiles.length > 0) {
      showToast(`Found ${allFiles.length} image(s). Processing...`, 'info', 2000);
      handleFiles(allFiles);
    } else {
      showToast('No image files found', 'error');
    }
  } else {
    handleFiles(dt.files);
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function collectFilesFromItems(items) {
  const allFiles = [];

  async function traverseEntry(entry) {
    if (entry.isFile) {
      return new Promise(resolve => {
        entry.file(file => {
          if (isRawFile(file.name) || file.type.startsWith('image/')) {
            allFiles.push(file);
          }
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      return new Promise(resolve => {
        async function readBatch() {
          dirReader.readEntries(async entries => {
            if (entries.length === 0) { resolve(); return; }
            for (const child of entries) await traverseEntry(child);
            readBatch();
          });
        }
        readBatch();
      });
    }
  }

  const promises = [];
  for (const item of items) {
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry();
      if (entry) promises.push(traverseEntry(entry));
    }
  }

  await Promise.all(promises);
  return allFiles;
}

async function uploadRawImages(rawFiles) {
  const formData = new FormData();
  rawFiles.forEach(f => formData.append('files', f));

  try {
    const response = await fetch('http://localhost:8081/images/upload-raw', {
      method: 'POST',
      body:   formData,
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || 'RAW upload failed');
    return data.images; // RawImageInfo[]
  } catch (error) {
    console.error('RAW upload error:', error);
    throw error;
  }
}

function startBatchedDecodeListener(taskIds, imageMap) {
  if (taskIds.length === 0) return;

  const url = `http://localhost:8081/images/decode-stream?${taskIds.map(id => 'taskIds=' + encodeURIComponent(id)).join('&')}`;

  fetch(url).then(response => {
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';

    function readStream() {
      reader.read().then(({ done, value }) => {
        if (done) { console.log('RAW decode stream completed'); return; }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        lines.forEach(message => {
          const eventLines = message.split('\n');
          let eventType = 'message';
          let eventData = '';

          eventLines.forEach(line => {
            if (line.startsWith('event:'))      eventType = line.substring(6).trim();
            else if (line.startsWith('data:'))  eventData += line.substring(5).trim();
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
      }).catch(error => { console.error('SSE stream error:', error); });
    }

    readStream();
  }).catch(error => {
    console.error('Failed to start decode stream:', error);
    showToast('Failed to monitor RAW decoding', 'error');
  });
}

function updateImageDecodeProgress(taskId, progress, imageMap) {
  const imageData = imageMap.get(taskId);
  if (!imageData) return;

  imageData.decodeProgress = progress;

  const card = document.querySelector(`[data-image-id="${imageData.id}"]`);
  if (card) {
    let badge = card.querySelector('.decode-progress-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className  = 'decode-progress-badge';
      badge.style.cssText = `
        position: absolute; top: 8px; right: 8px;
        background: rgba(0, 123, 255, 0.9); color: white;
        padding: 4px 8px; border-radius: 4px;
        font-size: 11px; font-weight: 600; z-index: 10;
      `;
      card.appendChild(badge);
    }
    badge.textContent = `Decoding ${progress}%`;
  }
}

function updateImageToFullDecode(taskId, fullPath, imageMap) {
  const imageData = imageMap.get(taskId);
  if (!imageData) return;

  imageData.serverPath       = fullPath;
  imageData.decodeProgress   = 100;
  imageData.isFullyDecoded   = true;

  const fullUrl = 'file:///' + fullPath.replace(/\\/g, '/');
  fetch(fullUrl)
    .then(res => res.blob())
    .then(blob => {
      if (imageData.url) URL.revokeObjectURL(imageData.url);
      imageData.url = URL.createObjectURL(blob);

      const libraryImg = _libraryImages.find(lib => lib.id === imageData.id);
      if (libraryImg) {
        if (libraryImg.url) URL.revokeObjectURL(libraryImg.url);
        libraryImg.url  = imageData.url;
        libraryImg.path = fullPath;
        saveLibrary();
      }

      const card = document.querySelector(`[data-image-id="${imageData.id}"]`);
      if (card) {
        const img = card.querySelector('.image-thumbnail');
        if (img) img.src = imageData.url;

        const badge = card.querySelector('.decode-progress-badge');
        if (badge) badge.remove();

        const rawBadge = card.querySelector('.raw-badge');
        if (rawBadge) {
          rawBadge.textContent = 'RAW ✓';
          rawBadge.style.background = 'rgba(40, 167, 69, 0.9)';
        }
      }
    })
    .catch(err => console.error('Failed to load full decode image:', fullPath, err));
}

function scheduleRawLibraryEntry(imageData) {
  const alreadyInLibrary = _libraryImages.some(
    img => img.name === imageData.name && img.size === imageData.size
  );
  if (alreadyInLibrary) return;

  const pushEntry = aspectRatio => {
    _libraryImages.push({
      file: imageData.file, id: imageData.id, name: imageData.name,
      size: imageData.size, url: imageData.url, path: imageData.serverPath,
      issues: [], isRaw: true, taskId: imageData.taskId,
      aspectRatio: aspectRatio || 1.5,
    });
    saveLibrary();
    _onNewLibraryImage();
  };

  const tmpImg = new Image();
  tmpImg.onload  = () => pushEntry(tmpImg.naturalWidth / tmpImg.naturalHeight);
  tmpImg.onerror = () => pushEntry(1.5);
  tmpImg.src = imageData.url;
}

function scheduleStandardLibraryEntry(file, id, base64, imageData) {
  const alreadyInLibrary = _libraryImages.some(
    img => img.name === file.name && img.size === file.size
  );
  if (alreadyInLibrary) {
    console.log(`Image "${file.name}" (${file.size} bytes) already exists in library. Skipping.`);
    return;
  }

  const libraryUrl = URL.createObjectURL(file);

  const pushEntry = aspectRatio => {
    _libraryImages.push({
      file, id, name: file.name, size: file.size,
      base64, url: libraryUrl, issues: imageData.issues ?? [],
      aspectRatio: aspectRatio || 1.5,
    });
    saveLibrary();
    _onNewLibraryImage();
  };

  const tmpImg = new Image();
  tmpImg.onload  = () => pushEntry(tmpImg.naturalWidth / tmpImg.naturalHeight);
  tmpImg.onerror = () => pushEntry(1.5);
  tmpImg.src = libraryUrl;
}

function showDuplicateToast(count) {
  const message = count === 1
    ? '1 duplicate image was skipped.'
    : `${count} duplicate images were skipped.`;
  showToast(message, 'warning');
}

async function processRawFiles(rawFiles) {
  try {
    showToast(`Uploading ${rawFiles.length} RAW image${rawFiles.length !== 1 ? 's' : ''}...`, 'info', 3000);
    const rawImageInfos = await uploadRawImages(rawFiles);
    const taskIdMap = new Map();
    const taskIds   = [];

    rawImageInfos.forEach(rawInfo => {
      const filename  = rawInfo.rawPath.split(/[\\/]/).pop();
      const fileObj   = rawFiles.find(f => f.name === filename);
      const id        = crypto.randomUUID();

      const imageData = {
        file: fileObj, id, name: filename, size: fileObj?.size || 0,
        url: null, serverPath: rawInfo.previewPath, rawPath: rawInfo.rawPath,
        taskId: rawInfo.taskId, isRaw: true, isPreview: true,
        isFullyDecoded: false, decodeProgress: 0,
      };

      const previewUrl = 'file:///' + rawInfo.previewPath.replace(/\\/g, '/');
      fetch(previewUrl)
        .then(res => res.blob())
        .catch(err => { console.error('Failed to load preview:', rawInfo.previewPath, err); return new Blob(); })
        .then(blob => {
          imageData.url = URL.createObjectURL(blob);
          const card = document.querySelector(`[data-image-id="${id}"]`);
          if (card) {
            const img = card.querySelector('.image-thumbnail');
            if (img) img.src = imageData.url;
          }
          scheduleRawLibraryEntry(imageData);
        });

      _uploadedImages.push(imageData);
      taskIdMap.set(rawInfo.taskId, imageData);
      taskIds.push(rawInfo.taskId);
    });

    showToast(`${rawFiles.length} RAW image${rawFiles.length !== 1 ? 's' : ''} uploaded. Full decoding in background...`, 'success', 4000);
    startBatchedDecodeListener(taskIds, taskIdMap);

  } catch (error) {
    console.error('RAW upload failed:', error);
    showToast(`RAW upload failed: ${error.message}`, 'error');
  }
}

function processStandardFiles(standardFiles) {
  let duplicateCount = 0;

  standardFiles.forEach(file => {
    const isDuplicate = _uploadedImages.some(
      img => img.name === file.name && img.size === file.size
    );

    if (isDuplicate) {
      duplicateCount++;
      console.log(`Skipping duplicate: "${file.name}" (${file.size} bytes)`);
      return;
    }

    const id       = crypto.randomUUID();
    const url      = URL.createObjectURL(file);
    const imageData = { file, id, name: file.name, size: file.size, url, issues: [] };
    _uploadedImages.push(imageData);

    const reader   = new FileReader();
    reader.onload  = e => scheduleStandardLibraryEntry(file, id, e.target.result, imageData);
    reader.readAsDataURL(file);
  });

  if (duplicateCount > 0) showDuplicateToast(duplicateCount);
}
