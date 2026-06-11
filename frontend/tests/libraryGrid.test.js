import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initLibraryGrid, getVirtualScroller } from '../src/libraryGrid.js';

// ── VirtualLibraryScroller.calculateDimensions ────────────────────────────────
//
// calculateDimensions() computes:
//   columnCount = clamp(floor((containerWidth + CARD_GAP) / (MIN_COLUMN_WIDTH + CARD_GAP)), 1, MAX_COLUMNS)
//
// Constants from VirtualLibraryScroller:
//   MIN_COLUMN_WIDTH = 192  (12rem in pixels)
//   CARD_GAP         = 10
//   MAX_COLUMNS      = 4

const MIN_COLUMN_WIDTH = 192;
const CARD_GAP = 10;
const MAX_COLUMNS = 4;

/** Helper: expected column count using the same formula as the source */
function expectedColumns(containerWidth) {
  const raw = Math.floor((containerWidth + CARD_GAP) / (MIN_COLUMN_WIDTH + CARD_GAP));
  return Math.max(1, Math.min(raw, MAX_COLUMNS));
}

/** Build a scroll container element with a given clientWidth via Object.defineProperty */
function makeScrollContainer(clientWidth) {
  const el = document.createElement('div');
  el.id = 'libraryScrollContainer';
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
  return el;
}

describe('VirtualLibraryScroller.calculateDimensions', () => {
  let scroller;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="libraryScrollContainer"></div>
      <div id="libraryScrollSpacer"></div>
      <div id="libraryGrid"></div>
      <div id="libraryLoadingSkeleton"></div>
      <div id="libraryEmptyState"></div>
    `;

    // initLibraryGrid sets the shared _libraryImages ref used by the scroller
    initLibraryGrid({
      libraryImages: [{ id: '1', url: 'data:image/png;base64,abc', aspectRatio: 1.5 }],
      libraryView: document.createElement('div'),
      onImageClick: () => {},
    });

    scroller = getVirtualScroller();
    // Point the scroller's scrollContainer at our DOM node
    scroller.scrollContainer = document.getElementById('libraryScrollContainer');
    scroller.scrollSpacer    = document.getElementById('libraryScrollSpacer');
    scroller.grid            = document.getElementById('libraryGrid');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    // Reset scroller state between tests
    scroller.isInitialized = false;
    scroller.isEnabled = false;
    scroller.columnCount = 4;
    scroller.containerWidth = 0;
  });

  it('returns 1 column for a very narrow container (< MIN_COLUMN_WIDTH)', () => {
    Object.defineProperty(scroller.scrollContainer, 'clientWidth', { value: 100, configurable: true });
    scroller.calculateDimensions();
    expect(scroller.columnCount).toBe(expectedColumns(100));
    expect(scroller.columnCount).toBe(1);
  });

  it('returns 1 column for a container exactly at MIN_COLUMN_WIDTH', () => {
    Object.defineProperty(scroller.scrollContainer, 'clientWidth', { value: MIN_COLUMN_WIDTH, configurable: true });
    scroller.calculateDimensions();
    expect(scroller.columnCount).toBe(1);
  });

  it('returns 2 columns for a container wide enough for two columns', () => {
    // Width needed for 2 cols: 2 * (192 + 10) - 10 = 394
    const width = 2 * (MIN_COLUMN_WIDTH + CARD_GAP) - CARD_GAP; // 394
    Object.defineProperty(scroller.scrollContainer, 'clientWidth', { value: width, configurable: true });
    scroller.calculateDimensions();
    expect(scroller.columnCount).toBe(2);
  });

  it('returns 3 columns for the appropriate container width', () => {
    const width = 3 * (MIN_COLUMN_WIDTH + CARD_GAP) - CARD_GAP; // 596
    Object.defineProperty(scroller.scrollContainer, 'clientWidth', { value: width, configurable: true });
    scroller.calculateDimensions();
    expect(scroller.columnCount).toBe(3);
  });

  it('caps at MAX_COLUMNS (4) even for a very wide container', () => {
    Object.defineProperty(scroller.scrollContainer, 'clientWidth', { value: 5000, configurable: true });
    scroller.calculateDimensions();
    expect(scroller.columnCount).toBe(MAX_COLUMNS);
    expect(scroller.columnCount).toBeLessThanOrEqual(MAX_COLUMNS);
  });

  it('stores containerWidth equal to scrollContainer.clientWidth', () => {
    Object.defineProperty(scroller.scrollContainer, 'clientWidth', { value: 800, configurable: true });
    scroller.calculateDimensions();
    expect(scroller.containerWidth).toBe(800);
  });

  it('column count matches the formula for an arbitrary container width (700px)', () => {
    Object.defineProperty(scroller.scrollContainer, 'clientWidth', { value: 700, configurable: true });
    scroller.calculateDimensions();
    expect(scroller.columnCount).toBe(expectedColumns(700));
  });

  it('does not throw when scrollContainer has zero clientWidth', () => {
    Object.defineProperty(scroller.scrollContainer, 'clientWidth', { value: 0, configurable: true });
    expect(() => scroller.calculateDimensions()).not.toThrow();
    // 0-width container → 0 raw columns → clamped to 1
    expect(scroller.columnCount).toBe(1);
  });

  it('returns the same result on repeated calls (idempotent)', () => {
    Object.defineProperty(scroller.scrollContainer, 'clientWidth', { value: 600, configurable: true });
    scroller.calculateDimensions();
    const first = scroller.columnCount;
    scroller.calculateDimensions();
    expect(scroller.columnCount).toBe(first);
  });
});
