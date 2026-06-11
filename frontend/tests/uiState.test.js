import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rgbToHue, applyAccentColor, ButtonLoader } from '../src/uiState.js';

// ── rgbToHue ──────────────────────────────────────────────────────────────────

describe('rgbToHue', () => {
  it('returns 0 for achromatic gray (r = g = b)', () => {
    expect(rgbToHue(128, 128, 128)).toBe(0);
  });

  it('returns 0 for pure black', () => {
    expect(rgbToHue(0, 0, 0)).toBe(0);
  });

  it('returns 0 for pure white', () => {
    expect(rgbToHue(255, 255, 255)).toBe(0);
  });

  it('returns 0 for pure red', () => {
    expect(rgbToHue(255, 0, 0)).toBe(0);
  });

  it('returns 120 for pure green', () => {
    expect(rgbToHue(0, 255, 0)).toBe(120);
  });

  it('returns 240 for pure blue', () => {
    expect(rgbToHue(0, 0, 255)).toBe(240);
  });

  it('returns 60 for yellow (r=255, g=255, b=0)', () => {
    expect(rgbToHue(255, 255, 0)).toBe(60);
  });

  it('returns 180 for cyan (r=0, g=255, b=255)', () => {
    expect(rgbToHue(0, 255, 255)).toBe(180);
  });

  it('returns 300 for magenta (r=255, g=0, b=255)', () => {
    expect(rgbToHue(255, 0, 255)).toBe(300);
  });

  it('always returns a value in [0, 360)', () => {
    const hue = rgbToHue(10, 200, 50);
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });
});

// ── applyAccentColor ──────────────────────────────────────────────────────────

describe('applyAccentColor', () => {
  beforeEach(() => {
    // Reset any inline styles set by previous tests
    document.documentElement.removeAttribute('style');
  });

  it('sets --accent-color to rgba at full opacity', () => {
    applyAccentColor('100, 150, 200');
    expect(document.documentElement.style.getPropertyValue('--accent-color'))
      .toBe('rgba(100, 150, 200, 1)');
  });

  it('sets --accent-color-rgb to the raw string', () => {
    applyAccentColor('100, 150, 200');
    expect(document.documentElement.style.getPropertyValue('--accent-color-rgb'))
      .toBe('100, 150, 200');
  });

  it('sets --accent-subtle at 0.08 opacity', () => {
    applyAccentColor('100, 150, 200');
    expect(document.documentElement.style.getPropertyValue('--accent-subtle'))
      .toBe('rgba(100, 150, 200, 0.08)');
  });

  it('sets --accent-border at 0.2 opacity', () => {
    applyAccentColor('100, 150, 200');
    expect(document.documentElement.style.getPropertyValue('--accent-border'))
      .toBe('rgba(100, 150, 200, 0.2)');
  });

  it('sets --accent-shadow at 0.15 opacity', () => {
    applyAccentColor('100, 150, 200');
    expect(document.documentElement.style.getPropertyValue('--accent-shadow'))
      .toBe('rgba(100, 150, 200, 0.15)');
  });

  it('sets --fullscreen-bg as an hsla value', () => {
    applyAccentColor('0, 255, 0'); // pure green → hue 120
    const bg = document.documentElement.style.getPropertyValue('--fullscreen-bg');
    expect(bg).toBe('hsla(120, 70%, 95%, 0.95)');
  });

  it('handles achromatic RGB (gray) without throwing', () => {
    expect(() => applyAccentColor('128, 128, 128')).not.toThrow();
  });
});

// ── ButtonLoader ──────────────────────────────────────────────────────────────

describe('ButtonLoader', () => {
  let button;

  beforeEach(() => {
    button = document.createElement('button');
    button.innerHTML = 'Submit';
    button.disabled = false;
    document.body.appendChild(button);
  });

  it('start() disables the button', () => {
    ButtonLoader.start(button, 'Loading...');
    expect(button.disabled).toBe(true);
  });

  it('start() adds the "loading" CSS class', () => {
    ButtonLoader.start(button, 'Loading...');
    expect(button.classList.contains('loading')).toBe(true);
  });

  it('start() replaces innerHTML with hourglass icon + text', () => {
    ButtonLoader.start(button, 'Please wait');
    expect(button.innerHTML).toContain('bi-hourglass-split');
    expect(button.innerHTML).toContain('Please wait');
  });

  it('start() returns the original state snapshot', () => {
    const state = ButtonLoader.start(button, 'Loading...');
    expect(state.text).toBe('Submit');
    expect(state.disabled).toBe(false);
  });

  it('stop() restores original innerHTML', () => {
    const state = ButtonLoader.start(button, 'Loading...');
    ButtonLoader.stop(button, state);
    expect(button.innerHTML).toBe('Submit');
  });

  it('stop() re-enables the button', () => {
    const state = ButtonLoader.start(button, 'Loading...');
    ButtonLoader.stop(button, state);
    expect(button.disabled).toBe(false);
  });

  it('stop() removes the "loading" CSS class', () => {
    const state = ButtonLoader.start(button, 'Loading...');
    ButtonLoader.stop(button, state);
    expect(button.classList.contains('loading')).toBe(false);
  });

  it('wrap() executes the async function and restores state', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const result = await ButtonLoader.wrap(button, 'Loading...', fn);
    expect(fn).toHaveBeenCalledOnce();
    expect(result).toBe('result');
    expect(button.disabled).toBe(false);
    expect(button.innerHTML).toBe('Submit');
  });

  it('wrap() restores state even when async function throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(ButtonLoader.wrap(button, 'Loading...', fn)).rejects.toThrow('boom');
    expect(button.disabled).toBe(false);
    expect(button.classList.contains('loading')).toBe(false);
  });
});
