import { showToast }       from './toast.js';
import { ButtonLoader }    from './uiState.js';
import { formatIssueName } from './utils.js';
import { getCurrentFilter } from './analysis.js';

const EXPORT_SETTINGS_KEY = 'exportAppSettings';
let exportAppName  = 'krita.exe';
let exportAppPath  = '';
let exportUseAdmin = false;

let _uploadedImages, _exportBtn;

export function initExportPanel({ uploadedImages, exportBtn }) {
  _uploadedImages = uploadedImages;
  _exportBtn      = exportBtn;

  // DOM refs — queried once during init
  const exportAppNameInput      = document.getElementById('exportAppName');
  const exportAppPathInput      = document.getElementById('exportAppPath');
  const exportUseAdminCheckbox  = document.getElementById('exportUseAdmin');
  const exportSearchBtn         = document.getElementById('exportSearchBtn');

  // Load persisted settings and populate inputs
  loadExportSettings();
  if (exportAppNameInput)     exportAppNameInput.value    = exportAppName;
  if (exportAppPathInput)     exportAppPathInput.value    = exportAppPath;
  if (exportUseAdminCheckbox) exportUseAdminCheckbox.checked = exportUseAdmin;

  // ── organizeBtn handler ───────────────────────────────────────────────────
  const organizeBtn = document.getElementById('organizeBtn');
  if (organizeBtn) {
    organizeBtn.addEventListener('click', async () => {
      if (getCurrentFilter() === 'all' || getCurrentFilter() === 'perfect' || getCurrentFilter() === 'issues') {
        const filterName = getCurrentFilter() === 'all' ? 'All Images' :
                           getCurrentFilter() === 'perfect' ? 'Perfect Images' :
                           'Images with Issues';
        showToast(
          `No Specific Filter Selected. Please select a specific issue filter first. Organize & Export creates a folder for the selected issue type. Current filter: ${filterName}`,
          'error',
          5000
        );
        return;
      }

      const filteredImages = _uploadedImages.filter(img =>
        img.issues && img.issues.includes(getCurrentFilter())
      );
      const paths = filteredImages.map(u => u.serverPath).filter(Boolean);

      if (paths.length === 0) {
        showToast(`No images found with filter: ${formatIssueName(getCurrentFilter())}`, 'error');
        return;
      }

      try {
        const outputRoot = await window.dialog.selectFolder();
        if (!outputRoot) return;

        const confirm = window.confirm(
          `📁 Organize & Export\n\n` +
          `Filter: ${formatIssueName(getCurrentFilter())}\n` +
          `Output Location: ${outputRoot}\n\n` +
          `This will create 1 folder and copy ${filteredImages.length} image${filteredImages.length !== 1 ? 's' : ''}.\n` +
          `Original files will be COPIED (not moved).\n` +
          `A CSV report will be generated.\n\n` +
          `Continue?`
        );
        if (!confirm) return;

        await ButtonLoader.wrap(organizeBtn, 'Organizing...', async () => {
          const res = await fetch('http://localhost:8081/images/group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paths,
              outputRoot,
              copy: true,
              enableSkin: false,
              filterIssue: getCurrentFilter()
            })
          });

          if (!res.ok) throw new Error(`Server error: ${res.status}`);

          const data = await res.json();
          if (!data.success) throw new Error(data.message || 'Organization failed');

          const openNow = window.confirm(
            `✅ Organization Complete!\n\n` +
            `📁 Location: ${data.outputRoot}\n` +
            `📊 CSV Report: ${data.csvPath}\n` +
            `Filter: ${formatIssueName(getCurrentFilter())}\n\n` +
            `${Object.entries(data.counts || {}).map(([issue, count]) =>
              `   • ${formatIssueName(issue)}: ${count} image${count !== 1 ? 's' : ''}`
            ).join('\n')}\n\n` +
            `Open folder now?`
          );

          if (openNow) window.dialog.openFolder(data.outputRoot);
        });

      } catch (err) {
        console.error('Organize error:', err);
        showToast(`Organization Failed: ${err.message}`, 'error', 5000);
      }
    });
  }

  // ── exportBtn handler ─────────────────────────────────────────────────────
  _exportBtn.addEventListener('click', async () => {
    if (_uploadedImages.length === 0) {
      showToast('No images to export.', 'error');
      return;
    }

    const hasAnalysis = _uploadedImages.some(img => img.issues !== undefined);
    if (!hasAnalysis) {
      showToast("Please analyze images first before exporting. Click the 'Analyze' button to run image analysis.", 'error', 5000);
      return;
    }

    if (getCurrentFilter() === 'all' || getCurrentFilter() === 'perfect' || getCurrentFilter() === 'issues') {
      const filterName = getCurrentFilter() === 'all' ? 'All Images' :
                         getCurrentFilter() === 'perfect' ? 'Perfect Images' :
                         'Images with Issues';
      showToast(
        `No Specific Filter Selected. Please select a specific issue filter first. Export is only available when filtering by a specific issue type. Current filter: ${filterName}`,
        'error',
        5000
      );
      return;
    }

    const imagesToExport = _uploadedImages.filter(img =>
      img.issues && img.issues.includes(getCurrentFilter())
    );

    if (imagesToExport.length === 0) {
      showToast(`No images found with filter: ${formatIssueName(getCurrentFilter())}`, 'error');
      return;
    }

    if (!exportAppPath) {
      showToast('No export application configured. Go to Settings → Export Application to choose one.', 'error', 5000);
      return;
    }

    const confirmed = confirm(
      `Export ${imagesToExport.length} image${imagesToExport.length !== 1 ? 's' : ''} to editing application?\n\n` +
      `Filter: ${formatIssueName(getCurrentFilter())}\n` +
      `Application: ${exportAppName || exportAppPath}`
    );
    if (!confirmed) return;

    await ButtonLoader.wrap(_exportBtn, 'Exporting...', async () => {
      try {
        console.log(`Exporting ${imagesToExport.length} images (filter: ${getCurrentFilter()})...`);
        const imagePaths = await fetchImagePaths(imagesToExport);

        console.log('Launching export application...');
        const result = await window.api.launchApp(exportAppPath, imagePaths, exportUseAdmin);

        console.log('Export success:', result);
        showToast(
          `Export Successful! ${imagesToExport.length} image${imagesToExport.length !== 1 ? 's' : ''} exported. Filter: ${formatIssueName(getCurrentFilter())}`,
          'success',
          4000
        );
      } catch (err) {
        console.error('Export error:', err);
        showToast('Export failed: ' + err.message, 'error');
        throw err;
      }
    });
  });

  // ── Settings inputs ───────────────────────────────────────────────────────
  if (exportUseAdminCheckbox) {
    exportUseAdminCheckbox.addEventListener('change', () => {
      exportUseAdmin = exportUseAdminCheckbox.checked;
      saveExportSettings();
    });
  }

  if (exportAppNameInput) {
    exportAppNameInput.addEventListener('change', () => {
      exportAppName = exportAppNameInput.value.trim() || 'krita.exe';
      saveExportSettings();
    });
  }

  if (exportSearchBtn) {
    exportSearchBtn.addEventListener('click', async () => {
      exportAppName = exportAppNameInput.value.trim() || 'krita.exe';

      exportAppNameInput.disabled = true;
      exportAppNameInput.blur();

      try {
        await ButtonLoader.wrap(exportSearchBtn, 'Searching...', async () => {
          try {
            let foundPath;
            if (exportUseAdmin) {
              foundPath = await window.api.searchExecutableAdmin(exportAppName);
            } else {
              foundPath = await window.api.searchExecutable(exportAppName);
            }

            exportAppPath = foundPath;
            exportAppPathInput.value = exportAppPath;
            saveExportSettings();
            showToast(`Executable found and saved: ${exportAppPath}`, 'success');
          } catch (err) {
            console.error('Executable search error:', err);
            showToast(`Could not find executable: ${err.message || err}`, 'error');
            throw err;
          }
        });
      } finally {
        exportAppNameInput.disabled = false;
        exportAppNameInput.focus();
      }
    });
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────

function loadExportSettings() {
  try {
    const raw = localStorage.getItem(EXPORT_SETTINGS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    exportAppName  = parsed.name || exportAppName;
    exportAppPath  = parsed.path || '';
    exportUseAdmin = !!parsed.useAdmin;
  } catch (e) {
    console.error('Failed to load export settings:', e);
  }
}

function saveExportSettings() {
  localStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify({
    name:     exportAppName,
    path:     exportAppPath,
    useAdmin: exportUseAdmin,
  }));
}

async function fetchImagePaths(images) {
  const paths = images.map(img => img.serverPath).filter(Boolean);
  if (paths.length < images.length) {
    throw new Error('Some images have no server path. Please re-analyze before exporting.');
  }
  return paths;
}
