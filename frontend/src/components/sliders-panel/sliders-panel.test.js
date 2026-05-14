import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Part 1 — GROUPS config regression (no side effects, pure import)
// Tests that every backend algorithm ID is mapped to a UI tab.
// If someone adds or removes an algorithm from the backend without updating
// groups.js this test will catch it.
// ---------------------------------------------------------------------------

import { GROUPS } from './groups.js';

const ALL_BACKEND_IDS = [
  // white balance
  'temperature_tint', 'gray_world', 'white_patch', 'shades_of_gray', 'ffcc',
  // tone
  'exposure', 'clahe_lab', 'local_laplacian', 'highlight_recovery',
  // color
  'color_matrix', 'color_distribution_alignment', 'harmonization', 'memory_color_skin',
  // saturation
  'saturation', 'vibrance', 'hsl_targeted', 'gamut_compress',
  // enhance / auto
  'ace', 'msrcr_retinex', 'dark_channel_dehaze', 'bm3d',
  // hdr / tone-map
  'exposure_fusion', 'reinhard_tonemap', 'mantiuk_tonemap',
];

describe('GROUPS — algorithm coverage', () => {
  const allMapped = GROUPS.flatMap((g) => g.methods);

  it('covers every backend algorithm ID', () => {
    for (const id of ALL_BACKEND_IDS) {
      expect(allMapped, `Missing algorithm: ${id}`).toContain(id);
    }
  });

  it('has no duplicate method IDs across tabs', () => {
    const seen = new Set();
    for (const id of allMapped) {
      expect(seen.has(id), `Duplicate method ID: ${id}`).toBe(false);
      seen.add(id);
    }
  });

  it('contains exactly 6 tabs', () => {
    expect(GROUPS).toHaveLength(6);
  });

  it('every tab has a non-empty id, label, icon and methods array', () => {
    for (const g of GROUPS) {
      expect(typeof g.id).toBe('string');
      expect(g.id.length).toBeGreaterThan(0);
      expect(typeof g.label).toBe('string');
      expect(typeof g.icon).toBe('string');
      expect(Array.isArray(g.methods)).toBe(true);
      expect(g.methods.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Part 2 — Sliders-panel Compare button behaviour (integration)
// Tests the compare contract through the live openSlidersPanel() API,
// mocking all I/O dependencies so no network or Electron calls are made.
// ---------------------------------------------------------------------------

vi.mock('../../api/endpoints/correction.js', () => ({
  listMethods: vi.fn(),
  preview: vi.fn(),
  commit: vi.fn(),
}));

vi.mock('../../state.js', () => ({
  get: vi.fn(),
  on: vi.fn(),
  renameActiveImage: vi.fn(),
  getSelectedPaths: vi.fn().mockReturnValue([]),
}));

vi.mock('../../bus.js', () => ({
  emit: vi.fn(),
  EVENTS: {
    STAGE_SET_IMAGE: 'kuonix:stage:set-image',
    STAGE_RIPPLE: 'kuonix:stage:ripple',
  },
}));

vi.mock('../toast/index.js', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

// createPanel must return a body div so the panel template renders into it.
let panelBody;
vi.mock('../panel/index.js', () => ({
  createPanel: vi.fn(),
}));

const BASELINE_URL  = 'data:image/jpeg;base64,BASELINE';
const PREVIEW_URL   = 'data:image/jpeg;base64,PREVIEW';
const TEMPERATURE_METHOD = {
  id: 'temperature_tint',
  name: 'Temperature & Tint',
  description: 'Adjust colour temperature',
  parameters: [
    { name: 'temperature', label: 'Temperature', min: -100, max: 100, step: 1, defaultValue: 0 },
    { name: 'tint',        label: 'Tint',        min: -100, max: 100, step: 1, defaultValue: 0 },
  ],
};

async function flushAll() {
  // Fire any pending fake timers synchronously (including the 110ms debounce).
  vi.advanceTimersByTime(200);
  // runPreview() is fire-and-forget inside the timer callback, so we flush
  // the microtask chain manually: preview() mock resolves → runPreview
  // continues → setFooterEnabled() runs.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('sliders-panel — Compare button behaviour', () => {
  let openSlidersPanel;
  let stateModule;
  let correctionModule;
  let busModule;
  let createPanel;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    // Re-import after resetModules so each test gets fresh module state.
    stateModule     = await import('../../state.js');
    correctionModule = await import('../../api/endpoints/correction.js');
    busModule       = await import('../../bus.js');
    const panelModule = await import('../panel/index.js');
    createPanel     = panelModule.createPanel;

    // Fresh DOM body for each test.
    panelBody = document.createElement('div');

    stateModule.get.mockImplementation((key) => {
      if (key === 'currentImagePath') return '/img/test.raw';
      if (key === 'currentImageUrl')  return BASELINE_URL;
      if (key === 'images')           return [];
      return null;
    });

    createPanel.mockImplementation(({ onClose }) => ({
      body: panelBody,
      open: vi.fn(),
      close: vi.fn().mockImplementation(() => onClose?.()),
      _closeCb: onClose,
    }));

    correctionModule.listMethods.mockResolvedValue([TEMPERATURE_METHOD]);
    correctionModule.preview.mockResolvedValue({
      success: true,
      base64Image: PREVIEW_URL,
    });
    correctionModule.commit.mockResolvedValue({ success: true });

    const mod = await import('./index.js');
    openSlidersPanel = mod.openSlidersPanel;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Compare button exists in footer', async () => {
    await openSlidersPanel();
    await flushAll();
    const btn = panelBody.querySelector("[data-action='compare']");
    expect(btn).not.toBeNull();
  });

  it('Compare button is disabled before any preview resolves', async () => {
    // Make preview hang so lastPreviewUrl is never set.
    correctionModule.preview.mockImplementation(() => new Promise(() => {}));
    await openSlidersPanel();
    // Advance past the debounce so runPreview fires, but don't resolve it.
    await vi.advanceTimersByTimeAsync(200);
    const btn = panelBody.querySelector("[data-action='compare']");
    expect(btn.disabled).toBe(true);
  });

  it('Compare button is enabled after auto-preview resolves on method select', async () => {
    await openSlidersPanel();
    await flushAll();
    const btn = panelBody.querySelector("[data-action='compare']");
    expect(btn.disabled).toBe(false);
  });

  it('Compare pointerdown emits STAGE_SET_IMAGE with the baseline URL', async () => {
    await openSlidersPanel();
    await flushAll();
    busModule.emit.mockClear();

    const btn = panelBody.querySelector("[data-action='compare']");
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(busModule.emit).toHaveBeenCalledWith(
      busModule.EVENTS.STAGE_SET_IMAGE,
      { src: BASELINE_URL },
    );
  });

  it('Compare pointerup restores the preview URL', async () => {
    await openSlidersPanel();
    await flushAll();
    busModule.emit.mockClear();

    const btn = panelBody.querySelector("[data-action='compare']");
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    busModule.emit.mockClear();

    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

    expect(busModule.emit).toHaveBeenCalledWith(
      busModule.EVENTS.STAGE_SET_IMAGE,
      { src: PREVIEW_URL },
    );
  });

  it('Compare is re-disabled after reset', async () => {
    await openSlidersPanel();
    await flushAll();

    // Move a slider to enable the reset button (dirty = true).
    const slider = panelBody.querySelector('.slider__input');
    slider.value = '50';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAll();

    const resetBtn = panelBody.querySelector("[data-action='reset']");
    resetBtn.click();

    const compareBtn = panelBody.querySelector("[data-action='compare']");
    expect(compareBtn.disabled).toBe(true);
  });

  it('reset emits STAGE_SET_IMAGE with baseline URL', async () => {
    await openSlidersPanel();
    await flushAll();

    // Move a slider to enable the reset button (dirty = true).
    const slider = panelBody.querySelector('.slider__input');
    slider.value = '50';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAll();
    busModule.emit.mockClear();

    panelBody.querySelector("[data-action='reset']").click();

    expect(busModule.emit).toHaveBeenCalledWith(
      busModule.EVENTS.STAGE_SET_IMAGE,
      { src: BASELINE_URL },
    );
  });
});
