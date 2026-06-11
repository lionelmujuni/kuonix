import { describe, it, expect } from 'vitest';
import { formatIssueName, formatFileSize } from '../src/utils.js';

// ── formatIssueName ───────────────────────────────────────────────────────────

describe('formatIssueName', () => {
  it('strips "Needs_" prefix and replaces underscore with space', () => {
    expect(formatIssueName('Needs_Exposure')).toBe('Exposure');
  });

  it('strips "Needs " (with space) after underscore replacement', () => {
    expect(formatIssueName('Needs_White_Balance')).toBe('White Balance');
  });

  it('abbreviates Oversaturated to Oversat', () => {
    expect(formatIssueName('Oversaturated')).toBe('Oversat');
  });

  it('abbreviates ColorCast to Cast', () => {
    expect(formatIssueName('ColorCast')).toBe('Cast');
  });

  it('abbreviates SkinTone to Skin', () => {
    expect(formatIssueName('SkinTone')).toBe('Skin');
  });

  it('converts underscores to spaces when no Needs prefix', () => {
    expect(formatIssueName('Motion_Blur')).toBe('Motion Blur');
  });

  it('returns the string unchanged when no substitution applies', () => {
    expect(formatIssueName('Blur')).toBe('Blur');
  });

  it('handles empty string without throwing', () => {
    expect(formatIssueName('')).toBe('');
  });

  it('handles Needs_Oversaturated — strips prefix then abbreviates', () => {
    expect(formatIssueName('Needs_Oversaturated')).toBe('Oversat');
  });
});

// ── formatFileSize ────────────────────────────────────────────────────────────

describe('formatFileSize', () => {
  it('returns "0 Bytes" for 0', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });

  it('formats bytes below 1 KB', () => {
    expect(formatFileSize(512)).toBe('512 Bytes');
  });

  it('formats exactly 1 KB', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
  });

  it('formats fractional KB', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats exactly 1 MB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
  });

  it('formats fractional MB', () => {
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });

  it('formats exactly 1 GB', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('rounds to 2 decimal places', () => {
    // 1 KB + 1 byte = 1.000977… KB — rounds to 1 KB
    expect(formatFileSize(1025)).toBe('1 KB');
  });

  it('formats a typical photo file (3.2 MB)', () => {
    expect(formatFileSize(3.2 * 1024 * 1024)).toBe('3.2 MB');
  });
});
