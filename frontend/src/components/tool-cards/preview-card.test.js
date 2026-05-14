import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the bus so we can assert STAGE_SET_IMAGE emissions without a real DOM
// event pipeline. The mock must be declared before any import that pulls in
// the bus transitively.
vi.mock('../../bus.js', () => ({
  emit: vi.fn(),
  EVENTS: { STAGE_SET_IMAGE: 'kuonix:stage:set-image' },
}));

// motion.js reads matchMedia at module load — already polyfilled in setup.js.
// GSAP is stubbed via the vitest alias in vitest.config.js.

import { renderPreviewCard, paramsToChips } from './preview-card.js';
import { emit, EVENTS } from '../../bus.js';

const BASE64  = 'data:image/jpeg;base64,AFTER';
const BEFORE  = 'data:image/jpeg;base64,BEFORE';
const METHOD  = 'temperature_tint';
const PARAMS  = { temperature: 50, tint: -10 };

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('renderPreviewCard — structure', () => {
  it('renders an article with tool-card--preview class', () => {
    const card = renderPreviewCard({ base64: BASE64, method: METHOD, params: {} });
    expect(card.tagName).toBe('ARTICLE');
    expect(card.classList.contains('tool-card--preview')).toBe(true);
  });

  it('sets aria-label to "Preview: <method>"', () => {
    const card = renderPreviewCard({ base64: BASE64, method: METHOD, params: {} });
    expect(card.getAttribute('aria-label')).toBe(`Preview: ${METHOD}`);
  });

  it('renders thumb with img when base64 is provided', () => {
    const card = renderPreviewCard({ base64: BASE64, method: METHOD, params: {} });
    const img = card.querySelector('.tool-card__thumb img');
    expect(img).not.toBeNull();
    expect(img.src).toContain('AFTER');
  });

  it('renders no img in thumb when base64 is absent', () => {
    const card = renderPreviewCard({ method: METHOD, params: {} });
    expect(card.querySelector('.tool-card__thumb img')).toBeNull();
  });

  it('renders param chips from params object', () => {
    const card = renderPreviewCard({ base64: BASE64, method: METHOD, params: PARAMS });
    const chips = card.querySelectorAll('.tool-card__param');
    expect(chips.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Compare button — presence
// ---------------------------------------------------------------------------

describe('renderPreviewCard — Compare button presence', () => {
  it('renders Compare button when both base64 and beforeSrc are provided', () => {
    const card = renderPreviewCard({ base64: BASE64, method: METHOD, params: {}, beforeSrc: BEFORE });
    expect(card.querySelector('.tool-card__compare')).not.toBeNull();
  });

  it('does NOT render Compare button when beforeSrc is absent', () => {
    const card = renderPreviewCard({ base64: BASE64, method: METHOD, params: {} });
    expect(card.querySelector('.tool-card__compare')).toBeNull();
  });

  it('does NOT render Compare button when base64 is absent (nothing to restore to)', () => {
    const card = renderPreviewCard({ method: METHOD, params: {}, beforeSrc: BEFORE });
    expect(card.querySelector('.tool-card__compare')).toBeNull();
  });

  it('Compare button has aria-pressed="false" initially', () => {
    const card = renderPreviewCard({ base64: BASE64, method: METHOD, params: {}, beforeSrc: BEFORE });
    expect(card.querySelector('.tool-card__compare').getAttribute('aria-pressed')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// Compare button — pointer events
// ---------------------------------------------------------------------------

describe('renderPreviewCard — Compare button pointer behaviour', () => {
  it('pointerdown emits STAGE_SET_IMAGE with beforeSrc and marks is-active', () => {
    const card = renderPreviewCard({ base64: BASE64, method: METHOD, params: {}, beforeSrc: BEFORE });
    const btn = card.querySelector('.tool-card__compare');

    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(emit).toHaveBeenCalledWith(EVENTS.STAGE_SET_IMAGE, { src: BEFORE });
    expect(btn.classList.contains('is-active')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('window pointerup emits STAGE_SET_IMAGE with base64 and removes is-active', () => {
    const card = renderPreviewCard({ base64: BASE64, method: METHOD, params: {}, beforeSrc: BEFORE });
    const btn = card.querySelector('.tool-card__compare');

    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    vi.clearAllMocks();                             // reset so we only see the release call

    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

    expect(emit).toHaveBeenCalledWith(EVENTS.STAGE_SET_IMAGE, { src: BASE64 });
    expect(btn.classList.contains('is-active')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('pointerleave restores base64 when button is active', () => {
    const card = renderPreviewCard({ base64: BASE64, method: METHOD, params: {}, beforeSrc: BEFORE });
    const btn = card.querySelector('.tool-card__compare');

    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    vi.clearAllMocks();

    btn.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));

    expect(emit).toHaveBeenCalledWith(EVENTS.STAGE_SET_IMAGE, { src: BASE64 });
    expect(btn.classList.contains('is-active')).toBe(false);
  });

  it('pointerleave is a no-op when button is not active', () => {
    const card = renderPreviewCard({ base64: BASE64, method: METHOD, params: {}, beforeSrc: BEFORE });
    const btn = card.querySelector('.tool-card__compare');

    btn.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));

    expect(emit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Compare button — keyboard events
// ---------------------------------------------------------------------------

describe('renderPreviewCard — Compare button keyboard behaviour', () => {
  it('Space keydown shows before, Space keyup restores after', () => {
    const card = renderPreviewCard({ base64: BASE64, method: METHOD, params: {}, beforeSrc: BEFORE });
    const btn = card.querySelector('.tool-card__compare');

    btn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(emit).toHaveBeenCalledWith(EVENTS.STAGE_SET_IMAGE, { src: BEFORE });
    expect(btn.classList.contains('is-active')).toBe(true);

    vi.clearAllMocks();
    btn.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    expect(emit).toHaveBeenCalledWith(EVENTS.STAGE_SET_IMAGE, { src: BASE64 });
    expect(btn.classList.contains('is-active')).toBe(false);
  });

  it('Enter keydown shows before, Enter keyup restores after', () => {
    const card = renderPreviewCard({ base64: BASE64, method: METHOD, params: {}, beforeSrc: BEFORE });
    const btn = card.querySelector('.tool-card__compare');

    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(emit).toHaveBeenCalledWith(EVENTS.STAGE_SET_IMAGE, { src: BEFORE });

    vi.clearAllMocks();
    btn.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    expect(emit).toHaveBeenCalledWith(EVENTS.STAGE_SET_IMAGE, { src: BASE64 });
  });

  it('other keys do not trigger compare', () => {
    const card = renderPreviewCard({ base64: BASE64, method: METHOD, params: {}, beforeSrc: BEFORE });
    const btn = card.querySelector('.tool-card__compare');

    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    btn.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Tab', bubbles: true }));

    expect(emit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// paramsToChips helper (exported utility)
// ---------------------------------------------------------------------------

describe('paramsToChips', () => {
  it('returns an empty array for null/undefined params', () => {
    expect(paramsToChips(null)).toEqual([]);
    expect(paramsToChips(undefined)).toEqual([]);
  });

  it('skips null/undefined values', () => {
    const chips = paramsToChips({ a: null, b: undefined, c: 1 });
    expect(chips.length).toBe(1);
  });

  it('formats number values to 2 decimal places', () => {
    const [chip] = paramsToChips({ gain: 1.567 });
    expect(chip.textContent).toContain('1.57');
  });

  it('formats integer numbers without decimals', () => {
    const [chip] = paramsToChips({ steps: 5 });
    expect(chip.textContent).toContain('5');
  });

  it('formats booleans as yes/no', () => {
    const chips = paramsToChips({ enabled: true, clamp: false });
    expect(chips[0].textContent).toContain('yes');
    expect(chips[1].textContent).toContain('no');
  });
});
