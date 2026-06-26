import { describe, it, expect } from 'vitest';
import { createHistogramStrip } from './histogram.js';

// jsdom does not implement canvas 2d contexts, so the bar-drawing paths
// (attach/clear/updateFromImageSrc) can't run here. These tests cover the
// DOM scaffold, the metrics formatter, and teardown.

function metric(strip, name) {
  return strip.el.querySelector(`[data-metric="${name}"]`).textContent;
}

describe('createHistogramStrip — structure', () => {
  it('renders a canvas and three metric slots, all initially blank', () => {
    const strip = createHistogramStrip();
    expect(strip.el.className).toBe('histogram-strip');
    expect(strip.el.querySelector('canvas')).not.toBeNull();
    expect(metric(strip, 'brightness')).toBe('—');
    expect(metric(strip, 'contrast')).toBe('—');
    expect(metric(strip, 'saturation')).toBe('—');
  });

  it('exposes the expected API surface', () => {
    const strip = createHistogramStrip();
    for (const fn of ['attach', 'destroy', 'setMetrics', 'updateFromImageSrc', 'clear']) {
      expect(typeof strip[fn]).toBe('function');
    }
  });
});

describe('createHistogramStrip — setMetrics formatting', () => {
  it('formats values by magnitude (2dp <1, 1dp <10, rounded otherwise)', () => {
    const strip = createHistogramStrip();
    strip.setMetrics({ brightness: 0.4, contrast: 5.6, saturation: 123.4 });
    expect(metric(strip, 'brightness')).toBe('0.40');
    expect(metric(strip, 'contrast')).toBe('5.6');
    expect(metric(strip, 'saturation')).toBe('123');
  });

  it('renders a dash for null/NaN/missing features', () => {
    const strip = createHistogramStrip();
    strip.setMetrics({ brightness: null, contrast: NaN });
    expect(metric(strip, 'brightness')).toBe('—');
    expect(metric(strip, 'contrast')).toBe('—');
    expect(metric(strip, 'saturation')).toBe('—');
  });

  it('tolerates being called with no argument', () => {
    const strip = createHistogramStrip();
    expect(() => strip.setMetrics()).not.toThrow();
    expect(metric(strip, 'brightness')).toBe('—');
  });
});

describe('createHistogramStrip — destroy', () => {
  it('detaches from the DOM and is safe to call when never attached', () => {
    const strip = createHistogramStrip();
    const host = document.createElement('div');
    host.appendChild(strip.el);
    strip.destroy();
    expect(host.contains(strip.el)).toBe(false);
    expect(() => strip.destroy()).not.toThrow();
  });
});
