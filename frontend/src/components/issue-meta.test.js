import { describe, it, expect } from 'vitest';
import {
  ISSUE_META, GAP_MAX, FAMILY_RGB, getIssueMeta, issueRgb, prettify,
} from './issue-meta.js';

// Canonical issue keys — must mirror restful .../dto/ImageIssue.java exactly.
// This is the single source of truth the classifier emits and that every UI
// surface (ribbon, contact sheet, library, group filter, issue drawer) keys on.
// If the backend enum changes, update this list AND the ISSUE_META map.
const IMAGE_ISSUES = [
  'Needs_Exposure_Increase', 'Needs_Exposure_Decrease',
  'Needs_Contrast_Increase', 'Needs_Contrast_Decrease',
  'Needs_Saturation_Increase',
  'Oversaturated_Global', 'Oversaturated_Red', 'Oversaturated_Green',
  'Oversaturated_Blue', 'Oversaturated_Cyan', 'Oversaturated_Magenta', 'Oversaturated_Yellow',
  'ColorCast_Red', 'ColorCast_Green', 'ColorCast_Blue',
  'ColorCast_Cyan', 'ColorCast_Magenta', 'ColorCast_Yellow',
  'Needs_Noise_Reduction',
  'SkinTone_Too_Green', 'SkinTone_Too_Magenta', 'SkinTone_Too_Desaturated', 'SkinTone_Too_OrangeRed',
  'Hazy', 'Crushed_Shadows', 'Clipped_Highlights',
];

const VALID_FAMILIES = ['exposure', 'cast', 'noise', 'other'];

describe('ISSUE_META — enum parity', () => {
  it('has an entry for every backend ImageIssue value', () => {
    for (const issue of IMAGE_ISSUES) {
      expect(ISSUE_META, `Missing meta for issue: ${issue}`).toHaveProperty(issue);
    }
  });

  it('has no stale keys that are not backend ImageIssue values', () => {
    // Guards against the original bug where surfaces keyed on dead vocabularies
    // (UNDEREXPOSED, ColorCast_Cool, …) that never matched the real enum names.
    for (const key of Object.keys(ISSUE_META)) {
      expect(IMAGE_ISSUES, `Stale meta key not in enum: ${key}`).toContain(key);
    }
  });
});

describe('ISSUE_META — entry shape', () => {
  it('every entry has a non-empty label, a bi- icon, a valid family, and a known gap', () => {
    for (const [issue, meta] of Object.entries(ISSUE_META)) {
      expect(typeof meta.label, issue).toBe('string');
      expect(meta.label.length, issue).toBeGreaterThan(0);
      expect(meta.icon, issue).toMatch(/^bi-/);
      expect(VALID_FAMILIES, `${issue} has invalid family ${meta.family}`).toContain(meta.family);
      if (meta.gap !== null) {
        expect(GAP_MAX, `${issue} gap ${meta.gap} missing from GAP_MAX`).toHaveProperty(meta.gap);
      }
    }
  });
});

describe('getIssueMeta', () => {
  it('returns the mapped entry for a known issue', () => {
    expect(getIssueMeta('Needs_Exposure_Increase')).toEqual(ISSUE_META.Needs_Exposure_Increase);
  });

  it('returns a complete fallback for an unknown issue', () => {
    const meta = getIssueMeta('Totally_Made_Up');
    expect(meta).toEqual({ label: 'Totally Made Up', icon: 'bi-circle', family: 'other', gap: null });
  });

  it('always returns the four required fields', () => {
    for (const issue of [...IMAGE_ISSUES, 'unknown_key', '']) {
      const meta = getIssueMeta(issue);
      expect(meta).toHaveProperty('label');
      expect(meta).toHaveProperty('icon');
      expect(meta).toHaveProperty('family');
      expect(meta).toHaveProperty('gap');
    }
  });
});

describe('issueRgb / FAMILY_RGB', () => {
  it('has an RGB var for every valid family', () => {
    for (const family of VALID_FAMILIES) {
      expect(FAMILY_RGB).toHaveProperty(family);
      expect(FAMILY_RGB[family]).toMatch(/^var\(--.*-rgb\)$/);
    }
  });

  it('maps each issue family to the matching theme RGB var', () => {
    expect(issueRgb('Needs_Exposure_Increase')).toBe(FAMILY_RGB.exposure);
    expect(issueRgb('ColorCast_Blue')).toBe(FAMILY_RGB.cast);
    expect(issueRgb('Needs_Noise_Reduction')).toBe(FAMILY_RGB.noise);
    expect(issueRgb('Hazy')).toBe(FAMILY_RGB.other);
  });

  it('falls back to the other-family RGB for unknown issues', () => {
    expect(issueRgb('Totally_Made_Up')).toBe(FAMILY_RGB.other);
  });
});

describe('prettify', () => {
  it('replaces underscores and title-cases words', () => {
    expect(prettify('Needs_Exposure_Increase')).toBe('Needs Exposure Increase');
    expect(prettify('hazy')).toBe('Hazy');
  });
});

describe('GAP_MAX', () => {
  it('every dimension is a positive number', () => {
    for (const [dim, max] of Object.entries(GAP_MAX)) {
      expect(typeof max, dim).toBe('number');
      expect(max, dim).toBeGreaterThan(0);
    }
  });
});
