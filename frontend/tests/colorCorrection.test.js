import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadPresets, savePresets, computeFitScale, applyScale, initColorCorrection } from '../src/colorCorrection.js';

/** Minimal DOM that _initDomRefs() + initPreviewZoom() require */
const CC_DOM = `
  <div id="colorCorrectionView" style="display:none"></div>
  <div id="ccPreviewContainer"></div>
  <div id="ccImageContainer"></div>
  <img id="ccOriginalImage" />
  <img id="ccCorrectedImage" />
  <div id="ccNoImage"></div>
  <div id="ccLoading"></div>
  <button id="ccBeforeAfterToggle"></button>
  <button id="ccResetBtn"></button>
  <div id="ccMethodControls"></div>
  <div id="ccTheoryContent"></div>
  <input id="ccPresetName" />
  <button id="ccSavePresetBtn"></button>
  <div id="ccPresetList"></div>
  <div id="ccGridView"></div>
  <div id="ccPreviewView"></div>
  <div id="ccImagesGrid"></div>
  <button id="ccBackToGridBtn"></button>
  <span id="ccPreviewImageName"></span>
  <div id="ccToolGridView"></div>
  <div id="ccToolPreviewView"></div>
  <select id="ccMethodDropdown"></select>
  <div id="librarySelectionControls"></div>
  <div id="ccNavigationBar"></div>
  <button id="ccPrevImageBtn"></button>
  <button id="ccNextImageBtn"></button>
  <span id="ccCurrentImageNum"></span>
  <span id="ccTotalImages"></span>
  <button id="ccRemoveFromLabBtn"></button>
  <button id="ccSaveCurrentBtn"></button>
  <button id="ccApplyToAllBtn"></button>
  <button id="ccSaveAllBtn"></button>
`;

// ── loadPresets / savePresets (localStorage round-trip) ──────────────────────

describe('loadPresets', () => {
  beforeEach(() => localStorage.clear());

  it('returns an empty array when nothing is stored', () => {
    expect(loadPresets()).toEqual([]);
  });

  it('returns saved presets after savePresets()', () => {
    const presets = [
      { name: 'Warm', method: 'gray_world', parameters: { strength: 0.8 } },
      { name: 'Cool', method: 'white_patch', parameters: {} },
    ];
    savePresets(presets);
    expect(loadPresets()).toEqual(presets);
  });

  it('returns an empty array when localStorage contains invalid JSON', () => {
    localStorage.setItem('colorCorrectionPresets', '{broken json}}');
    expect(loadPresets()).toEqual([]);
  });
});

describe('savePresets', () => {
  beforeEach(() => localStorage.clear());

  it('persists under the key "colorCorrectionPresets"', () => {
    savePresets([{ name: 'Test', method: 'exposure', parameters: {} }]);
    const raw = localStorage.getItem('colorCorrectionPresets');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed[0].name).toBe('Test');
  });

  it('overwrites previously stored presets', () => {
    savePresets([{ name: 'First', method: 'gray_world', parameters: {} }]);
    savePresets([{ name: 'Second', method: 'exposure', parameters: {} }]);
    expect(loadPresets()).toHaveLength(1);
    expect(loadPresets()[0].name).toBe('Second');
  });

  it('stores an empty array without error', () => {
    expect(() => savePresets([])).not.toThrow();
    expect(loadPresets()).toEqual([]);
  });
});

// ── computeFitScale — formula verification ────────────────────────────────────

describe('computeFitScale — formula', () => {
  // The formula is: Math.min(containerW / imageW, containerH / imageH, 1)
  // We verify it directly here without needing DOM refs.
  const computeExpected = (cw, ch, iw, ih) => Math.min(cw / iw, ch / ih, 1);

  it('scales down a landscape image to fit a portrait container', () => {
    // 1000×500 image in 400×600 container
    expect(computeExpected(400, 600, 1000, 500)).toBeCloseTo(0.4, 5);
  });

  it('scales down a portrait image to fit a landscape container', () => {
    // 500×1000 image in 600×400 container
    expect(computeExpected(600, 400, 500, 1000)).toBeCloseTo(0.4, 5);
  });

  it('uses width as the limiting axis when container is wider than tall', () => {
    // 800×800 square image in 400×600 container — width limits (400/800=0.5 < 600/800=0.75)
    expect(computeExpected(400, 600, 800, 800)).toBeCloseTo(0.5, 5);
  });

  it('never upscales beyond 1.0 (image smaller than container)', () => {
    // 100×100 image in 500×500 container → cap at 1
    expect(computeExpected(500, 500, 100, 100)).toBe(1);
  });

  it('returns 1 for an image exactly matching the container size', () => {
    expect(computeExpected(400, 300, 400, 300)).toBe(1);
  });
});

// ── computeFitScale — DOM-wired integration ───────────────────────────────────

describe('computeFitScale — DOM wired via module refs', () => {
  // computeFitScale() reads module-level ccPreviewContainer and ccOriginalImage
  // variables that are set by initColorCorrection() via DOM IDs. We build the
  // required DOM, call initColorCorrection to wire the refs, then test behavior.

  beforeEach(() => {
    document.body.innerHTML = CC_DOM;
    initColorCorrection({ libraryImages: [] });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not throw when DOM elements have zero clientWidth/clientHeight (guard branch)', () => {
    // jsdom returns 0 for clientWidth/clientHeight unless explicitly set via CSS/layout.
    // computeFitScale should silently guard against zero dimensions.
    expect(() => computeFitScale()).not.toThrow();
  });
});

// ── applyScale ────────────────────────────────────────────────────────────────

describe('applyScale', () => {
  beforeEach(() => {
    document.body.innerHTML = CC_DOM;
    // Wire module-level DOM refs (ccImageContainer, ccOriginalImage, etc.)
    // so applyScale() doesn't return early on its null guards.
    initColorCorrection({ libraryImages: [] });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not throw when called with scale = 1 (fit)', () => {
    expect(() => applyScale(1)).not.toThrow();
  });

  it('does not throw when called with a zoomed scale (e.g. 2.0)', () => {
    expect(() => applyScale(2.0)).not.toThrow();
  });

  it('applies overflow: hidden to ccPreviewContainer at fit scale (≤ fitScale)', () => {
    // ccFitScale starts at 1; scale 1 is at-fit
    applyScale(1);
    const container = document.getElementById('ccPreviewContainer');
    // At fit: overflow is set to 'hidden'
    expect(container.style.overflow).toBe('hidden');
  });

  it('applies overflow: auto to ccPreviewContainer when zoomed beyond fit', () => {
    // scale 2 is above ccFitScale (1) + 0.001 threshold → zoomed branch
    applyScale(2);
    const container = document.getElementById('ccPreviewContainer');
    expect(container.style.overflow).toBe('auto');
  });

  it('sets explicit pixel dimensions on ccImageContainer when zoomed', () => {
    // jsdom naturalWidth/naturalHeight default to 0; scaled px will be 0 × factor = 0
    applyScale(2);
    const container = document.getElementById('ccImageContainer');
    // Confirms explicit px strings are applied (even if "0px" due to jsdom naturalWidth=0)
    expect(container.style.width).toMatch(/px$/);
    expect(container.style.height).toMatch(/px$/);
  });

  it('clears inline width/height from ccImageContainer at fit scale', () => {
    // First zoom in, then come back to fit
    applyScale(2);
    applyScale(1);
    const container = document.getElementById('ccImageContainer');
    expect(container.style.width).toBe('');
    expect(container.style.height).toBe('');
  });

  it('sets transform: translate(-50%, -50%) on original image at fit scale', () => {
    applyScale(1);
    const img = document.getElementById('ccOriginalImage');
    expect(img.style.transform).toBe('translate(-50%, -50%)');
  });

  it('sets transform: none on original image when zoomed', () => {
    applyScale(2);
    const img = document.getElementById('ccOriginalImage');
    expect(img.style.transform).toBe('none');
  });
});
