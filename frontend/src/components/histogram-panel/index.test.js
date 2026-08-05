import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the endpoint so no real fetch happens; assert the panel calls it.
vi.mock('../../api/endpoints/images.js', () => ({
  getHistogram: vi.fn(() => Promise.resolve({
    bins: 4,
    luma: [1, 2, 3, 4], red: [1, 1, 1, 1], green: [2, 2, 2, 2], blue: [0, 1, 2, 3],
    saturation: [4, 3, 2, 1], hue: [1, 1, 1, 1], darkChannel: [4, 0, 0, 0],
  })),
}));

import { createHistogramPanel } from './index.js';
import { getHistogram } from '../../api/endpoints/images.js';
import * as state from '../../state.js';

function channels(panel) {
  return [...panel.el.querySelectorAll('.histogram-panel__chan')].map((b) => b.textContent);
}
function activeChannel(panel) {
  return panel.el.querySelector('.histogram-panel__chan.is-active')?.textContent;
}

let panel;
beforeEach(() => {
  state.clearImages();
  getHistogram.mockClear();
  panel = createHistogramPanel();
});
afterEach(() => {
  // Panels add state subscriptions on bind(); destroy so they don't leak across
  // tests and fire on the next test's state changes.
  panel?.destroy();
});

describe('createHistogramPanel — structure', () => {
  it('renders a collapsed panel with a toggle and hidden body by default', () => {
    expect(panel.el.className).toBe('histogram-panel');
    const toggle = panel.el.querySelector('.histogram-panel__toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel.el.querySelector('.histogram-panel__body').hidden).toBe(true);
  });

  it('renders the core trio of channels by default', () => {
    panel.bind();
    expect(channels(panel)).toEqual(['Luma', 'RGB', 'Sat']);
    expect(activeChannel(panel)).toBe('Luma');
  });

  it('starts expanded when created with defaultOpen and no stored preference', () => {
    const p = createHistogramPanel({ defaultOpen: true });
    expect(p.el.querySelector('.histogram-panel__toggle').getAttribute('aria-expanded')).toBe('true');
    expect(p.el.querySelector('.histogram-panel__body').hidden).toBe(false);
    p.destroy();
  });

  it('a stored collapsed preference wins over defaultOpen', () => {
    localStorage.setItem('kuonix.histogramPanelOpen', 'false');
    const p = createHistogramPanel({ defaultOpen: true });
    expect(p.el.querySelector('.histogram-panel__toggle').getAttribute('aria-expanded')).toBe('false');
    p.destroy();
  });
});

describe('createHistogramPanel — contextual channels', () => {
  it('adds Hue when the active image has a colour-cast / oversaturation / skin issue', () => {
    state.addImage({ path: '/a.jpg', issues: ['ColorCast_Blue'] });
    panel.bind();
    expect(channels(panel)).toContain('Hue');
    expect(channels(panel)).not.toContain('Haze');
  });

  it('adds Haze when the active image is Hazy', () => {
    state.addImage({ path: '/b.jpg', issues: ['Hazy'] });
    panel.bind();
    expect(channels(panel)).toContain('Haze');
  });

  it('shows only the core trio when there are no relevant issues', () => {
    state.addImage({ path: '/c.jpg', issues: ['Needs_Exposure_Increase'] });
    panel.bind();
    expect(channels(panel)).toEqual(['Luma', 'RGB', 'Sat']);
  });
});

describe('createHistogramPanel — setChannel (algorithm-driven)', () => {
  it('switches the active channel to the one the algorithm manipulates', () => {
    panel.bind();
    panel.setChannel('sat');
    expect(activeChannel(panel)).toBe('Sat');
  });

  it('surfaces a contextual channel chip even without a matching issue', () => {
    panel.bind();
    panel.setChannel('haze');
    expect(channels(panel)).toContain('Haze');
    expect(activeChannel(panel)).toBe('Haze');
  });

  it('ignores unknown channel ids', () => {
    panel.bind();
    panel.setChannel('nope');
    expect(activeChannel(panel)).toBe('Luma');
  });
});

describe('createHistogramPanel — interaction', () => {
  it('selecting a channel moves the active highlight', () => {
    panel.bind();
    const rgb = [...panel.el.querySelectorAll('.histogram-panel__chan')].find((b) => b.textContent === 'RGB');
    rgb.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(activeChannel(panel)).toBe('RGB');
  });

  it('expanding the panel fetches the histogram for the active image', async () => {
    vi.useFakeTimers();
    state.addImage({ path: '/d.jpg', issues: [] });
    panel.bind();
    panel.el.querySelector('.histogram-panel__toggle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(200);   // clear the 150ms debounce
    expect(getHistogram).toHaveBeenCalledWith('/d.jpg', expect.objectContaining({ bins: expect.any(Number) }));
    vi.useRealTimers();
  });

  it('does not hit the backend while collapsed', async () => {
    vi.useFakeTimers();
    state.addImage({ path: '/e.jpg', issues: [] });
    panel.bind();                              // stays collapsed
    await vi.advanceTimersByTimeAsync(300);
    expect(getHistogram).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('createHistogramPanel — teardown', () => {
  it('destroy() detaches and is safe', () => {
    const host = document.createElement('div');
    host.appendChild(panel.el);
    panel.bind();
    panel.destroy();
    expect(host.contains(panel.el)).toBe(false);
    expect(() => panel.destroy()).not.toThrow();
  });
});
