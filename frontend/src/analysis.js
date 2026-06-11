import { showToast }    from './toast.js';
import { ButtonLoader } from './uiState.js';
import { saveLibrary }  from './library.js';
import { formatIssueName } from './utils.js';
import { displayImageGrid } from './imageGrid.js';

let _uploadedImages, _libraryImages, _analyzeBtn;
let _currentFilter = 'all';

export function getCurrentFilter() { return _currentFilter; }
export function setCurrentFilter(v) { _currentFilter = v; }

export function initAnalysis({ uploadedImages, libraryImages, analyzeBtn }) {
  _uploadedImages = uploadedImages;
  _libraryImages  = libraryImages;
  _analyzeBtn     = analyzeBtn;

  analyzeBtn.addEventListener('click', async () => {
    if (_uploadedImages.length === 0) {
      showToast('Please upload images first.', 'error');
      return;
    }

    const progressContainer = document.getElementById('progressContainer');
    const progressBar       = document.getElementById('progressBar');
    const progressText      = document.getElementById('progressText');
    const progressPercent   = document.getElementById('progressPercent');
    progressContainer.style.display = 'block';

    await ButtonLoader.wrap(_analyzeBtn, 'Analyzing...', async () => {
      try {
        // Step 1: Upload non-RAW images and collect all server paths (10 % → 20 %)
        progressText.textContent = 'Preparing images for analysis...';
        progressBar.style.width = '10%';
        progressPercent.textContent = '10%';

        const nonRawImages  = _uploadedImages.filter(img => !img.isRaw);
        const rawImages     = _uploadedImages.filter(img =>  img.isRaw);
        const uploadedPaths = await uploadNonRawImages(nonRawImages);
        // Build a per-ID lookup so paths are assembled in _uploadedImages insertion
        // order. processRawFiles runs before processStandardFiles, so RAW entries
        // are pushed first; the classify-stream must receive paths in the same order.
        const pathById = new Map();
        nonRawImages.forEach((img, i) => pathById.set(img.id, uploadedPaths[i]));
        rawImages.forEach(img => pathById.set(img.id, img.rawPath));
        const paths = _uploadedImages.map(img => pathById.get(img.id));

        progressBar.style.width = '20%';
        progressPercent.textContent = '20%';

        // Step 2: Classify via SSE stream (20 % → 95 %)
        progressText.textContent = `Analyzing 0/${_uploadedImages.length} images...`;
        const cls = await runClassifyStream(paths, progressBar, progressText, progressPercent);
        if (!cls.success) throw new Error(cls.message || 'Classification failed');

        // Step 3: Map results (95 % → 100 %)
        progressText.textContent = 'Processing results...';
        progressBar.style.width = '95%';
        progressPercent.textContent = '95%';
        mapAnalysisResults(paths, cls.results);

        progressBar.style.width = '100%';
        progressPercent.textContent = '100%';
        progressText.textContent = 'Complete!';

        // Step 4: Update UI
        displayImageGrid();
        showAnalysisSummary(cls.results);
        showOrganizeButton();
        setTimeout(() => { progressContainer.style.display = 'none'; }, 1000);

      } catch (err) {
        console.error('Analysis error:', err);
        progressContainer.style.display = 'none';
        showToast(formatAnalysisError(err), 'error', 6000);
        throw err;
      }
    });
  });
}

// ── Helpers: analysis workflow ────────────────────────────────────────────

// Uploads non-RAW images to the backend and returns their server-side paths.
async function uploadNonRawImages(images) {
  if (images.length === 0) return [];
  const form = new FormData();
  images.forEach(img => form.append('files', img.file));

  const res = await fetch('http://localhost:8081/images/upload', { method: 'POST', body: form });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ message: `HTTP ${res.status}: ${res.statusText}` }));
    throw new Error(errData.message || `Upload failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Upload failed');
  return data.paths;
}

// Opens a classify-stream SSE connection and drives the progress bar from 20 % → 95 %.
function runClassifyStream(paths, progressBar, progressText, progressPercent) {
  return new Promise((resolve, reject) => {
    fetch('http://localhost:8081/images/classify-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, enableSkin: false })
    }).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      function readChunk() {
        reader.read().then(({ done, value }) => {
          if (done) {
            reject(new Error('Stream closed unexpectedly before completion'));
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split('\n\n');
          buffer = messages.pop();

          messages.forEach(message => {
            let eventType = 'message';
            let eventData = '';
            message.split('\n').forEach(line => {
              if (line.startsWith('event:')) eventType = line.substring(6).trim();
              else if (line.startsWith('data:')) eventData += line.substring(5).trim();
            });
            if (!eventData) return;

            try {
              const parsed = JSON.parse(eventData);
              if (eventType === 'progress') {
                const pct = 20 + (parsed.percentage * 0.75);
                progressBar.style.width = `${pct}%`;
                progressPercent.textContent = `${Math.round(pct)}%`;
                progressText.textContent = `Analyzing ${parsed.current}/${parsed.total} images...`;
              } else if (eventType === 'complete') {
                resolve(parsed);
              } else if (eventType === 'error') {
                reject(new Error(parsed.message || 'Classification failed'));
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', eventData, e);
              if (eventType === 'error') {
                reject(new Error(`Stream error (unparseable payload): ${eventData}`));
              }
            }
          });

          readChunk();
        }).catch(reject);
      }

      readChunk();
    }).catch(reject);
  });
}

// Maps classify-stream results back to uploadedImages and libraryImages in place,
// then persists the updated library.
function mapAnalysisResults(paths, results) {
  for (let i = 0; i < paths.length && i < _uploadedImages.length; i++) {
    _uploadedImages[i].serverPath = paths[i];
    _uploadedImages[i].issues     = results[i]?.issues   || [];
    _uploadedImages[i].features   = results[i]?.features || null;

    const libraryImg = _libraryImages.find(lib => lib.id === _uploadedImages[i].id);
    if (libraryImg) {
      libraryImg.issues = _uploadedImages[i].issues;
      libraryImg.path   = paths[i];
    }
  }
  saveLibrary();
}

// Builds a user-friendly error title + message from a caught analysis error.
export function formatAnalysisError(err) {
  let title = '❌ Analysis Failed';
  let msg   = err.message || 'Unknown error';
  if (msg.includes('Failed to fetch')) {
    title = '🌐 Network Error';
    msg   = 'Cannot connect to backend server. Please check: Backend is running (port 8081), No firewall blocking connection';
  } else if (msg.includes('HTTP 400') || msg.includes('HTTP 500')) {
    title = '⚠️ Backend Error';
    msg   = `The backend encountered an error: ${msg}. Check console logs for details.`;
  }
  return `${title}: ${msg}`;
}

// ── Helpers: analysis summary ─────────────────────────────────────────────

// Tallies issue counts and image-level stats from a classify-stream result array.
export function countIssues(results) {
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

  const totalIssues   = Object.values(issueCounts).reduce((a, b) => a + b, 0);
  const perfectImages = results.length - imagesWithIssues;
  const allIssues     = Object.entries(issueCounts).sort((a, b) =>
    b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])
  );

  return { issueCounts, imagesWithIssues, perfectImages, totalIssues, allIssues };
}

// Builds the stats grid + issue list HTML for the summary panel.
function buildSummaryStatsHTML(total, perfectImages, imagesWithIssues, totalIssues, allIssues) {
  const issueListHTML = allIssues.length > 0 ? `
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
    </div>` : '';

  return `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 12px;">
      <div style="text-align: center;">
        <div style="font-size: 24px; font-weight: 600; color: var(--color-primary);">${total}</div>
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
    ${issueListHTML}
  `;
}

// Populates the filters toolbar and wires click handlers that update _currentFilter.
function buildFilterButtons(filtersContainer, total, perfectImages, imagesWithIssues, allIssues) {
  filtersContainer.innerHTML = `
    <button class="filter-btn active" data-filter="all">All (${total})</button>
    <button class="filter-btn" data-filter="perfect">✓ Perfect (${perfectImages})</button>
    <button class="filter-btn" data-filter="issues">⚠ Issues (${imagesWithIssues})</button>
  `;

  allIssues.forEach(([issue, count]) => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.filter = issue;
    btn.textContent = `${formatIssueName(issue)} (${count})`;
    filtersContainer.appendChild(btn);
  });

  filtersContainer.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filtersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _currentFilter = btn.dataset.filter;
      applyImageFilter(_currentFilter);
    });
  });
}

export function showAnalysisSummary(results) {
  const summaryDiv       = document.getElementById('analysisSummary');
  const summaryContent   = document.getElementById('summaryContent');
  const filtersContainer = document.getElementById('issueFilters');

  const { imagesWithIssues, perfectImages, totalIssues, allIssues } = countIssues(results);

  summaryContent.innerHTML = buildSummaryStatsHTML(
    results.length, perfectImages, imagesWithIssues, totalIssues, allIssues
  );
  buildFilterButtons(filtersContainer, results.length, perfectImages, imagesWithIssues, allIssues);

  summaryDiv.style.display = 'block';
}

export function applyImageFilter(filter) {
  const cards = document.querySelectorAll('.image-card');

  cards.forEach((card, index) => {
    const imageData = _uploadedImages[index];
    let show = true;

    if (filter === 'perfect') {
      show = !imageData.issues || imageData.issues.length === 0;
    } else if (filter === 'issues') {
      show = imageData.issues && imageData.issues.length > 0;
    } else if (filter !== 'all') {
      show = imageData.issues && imageData.issues.includes(filter);
    }

    card.style.display = show ? 'block' : 'none';
  });
}

export function showOrganizeButton() {
  const organizeBtn = document.getElementById('organizeBtn');
  if (organizeBtn) organizeBtn.style.display = 'inline-flex';
}
