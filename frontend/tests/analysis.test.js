import { describe, it, expect, beforeEach } from 'vitest';
import { countIssues, formatAnalysisError } from '../src/analysis.js';

// ── countIssues ───────────────────────────────────────────────────────────────

describe('countIssues', () => {
  it('returns all-zero stats for an empty results array', () => {
    const { issueCounts, imagesWithIssues, perfectImages, totalIssues, allIssues } =
      countIssues([]);
    expect(issueCounts).toEqual({});
    expect(imagesWithIssues).toBe(0);
    expect(perfectImages).toBe(0);
    expect(totalIssues).toBe(0);
    expect(allIssues).toEqual([]);
  });

  it('counts a single perfect image (no issues)', () => {
    const results = [{ issues: [] }];
    const { perfectImages, imagesWithIssues, totalIssues } = countIssues(results);
    expect(perfectImages).toBe(1);
    expect(imagesWithIssues).toBe(0);
    expect(totalIssues).toBe(0);
  });

  it('counts a single image with one issue', () => {
    const results = [{ issues: ['Needs_Exposure'] }];
    const { imagesWithIssues, totalIssues, issueCounts, perfectImages } = countIssues(results);
    expect(imagesWithIssues).toBe(1);
    expect(perfectImages).toBe(0);
    expect(totalIssues).toBe(1);
    expect(issueCounts['Needs_Exposure']).toBe(1);
  });

  it('accumulates counts when the same issue appears across multiple images', () => {
    const results = [
      { issues: ['Needs_Exposure'] },
      { issues: ['Needs_Exposure', 'ColorCast'] },
      { issues: [] },
    ];
    const { issueCounts, imagesWithIssues, perfectImages, totalIssues } = countIssues(results);
    expect(issueCounts['Needs_Exposure']).toBe(2);
    expect(issueCounts['ColorCast']).toBe(1);
    expect(imagesWithIssues).toBe(2);
    expect(perfectImages).toBe(1);
    expect(totalIssues).toBe(3); // 2 Exposure + 1 ColorCast
  });

  it('handles results where issues property is missing', () => {
    const results = [{ }];
    const { perfectImages, imagesWithIssues } = countIssues(results);
    expect(perfectImages).toBe(1);
    expect(imagesWithIssues).toBe(0);
  });

  it('sorts allIssues by count descending', () => {
    const results = [
      { issues: ['ColorCast'] },
      { issues: ['Needs_Exposure', 'ColorCast'] },
      { issues: ['Needs_Exposure', 'ColorCast', 'SkinTone'] },
    ];
    const { allIssues } = countIssues(results);
    // ColorCast: 3, Needs_Exposure: 2, SkinTone: 1
    expect(allIssues[0][0]).toBe('ColorCast');
    expect(allIssues[0][1]).toBe(3);
    expect(allIssues[1][0]).toBe('Needs_Exposure');
    expect(allIssues[2][0]).toBe('SkinTone');
  });

  it('breaks count ties alphabetically', () => {
    const results = [
      { issues: ['Blur', 'Noise'] },
    ];
    const { allIssues } = countIssues(results);
    // Both count=1; "Blur" < "Noise" alphabetically
    expect(allIssues[0][0]).toBe('Blur');
    expect(allIssues[1][0]).toBe('Noise');
  });

  it('totalIssues equals the sum of all individual issue counts', () => {
    const results = [
      { issues: ['A', 'B', 'C'] },
      { issues: ['A', 'C'] },
    ];
    const { totalIssues, issueCounts } = countIssues(results);
    const sumFromCounts = Object.values(issueCounts).reduce((a, b) => a + b, 0);
    expect(totalIssues).toBe(sumFromCounts);
  });
});

// ── formatAnalysisError ───────────────────────────────────────────────────────

describe('formatAnalysisError', () => {
  it('returns a string containing the original message for a generic error', () => {
    const err = new Error('Something went wrong');
    const result = formatAnalysisError(err);
    expect(result).toContain('Something went wrong');
  });

  it('returns a network error title when message contains "Failed to fetch"', () => {
    const err = new Error('Failed to fetch');
    const result = formatAnalysisError(err);
    expect(result).toContain('Network Error');
    expect(result).toContain('backend');
  });

  it('returns a backend error title for HTTP 400 responses', () => {
    const err = new Error('HTTP 400: Bad Request');
    const result = formatAnalysisError(err);
    expect(result).toContain('Backend Error');
  });

  it('returns a backend error title for HTTP 500 responses', () => {
    const err = new Error('HTTP 500: Internal Server Error');
    const result = formatAnalysisError(err);
    expect(result).toContain('Backend Error');
  });

  it('uses "Unknown error" as fallback when err.message is empty', () => {
    const err = new Error('');
    const result = formatAnalysisError(err);
    expect(result).toContain('Unknown error');
  });

  it('handles non-Error objects with a message property', () => {
    const result = formatAnalysisError({ message: 'Custom failure' });
    expect(result).toContain('Custom failure');
  });
});
