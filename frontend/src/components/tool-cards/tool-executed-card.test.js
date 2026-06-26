import { describe, it, expect } from 'vitest';
import { renderToolExecutedCard, TOOLS_HIDDEN_BY_DEFAULT } from './tool-executed-card.js';

function summaryOf(card) {
  return card.querySelector('.tool-executed__summary').textContent;
}
function titleOf(card) {
  return card.querySelector('.tool-executed__title').textContent;
}

describe('renderToolExecutedCard — structure', () => {
  it('renders a tool-executed article with role=group', () => {
    const card = renderToolExecutedCard({ name: 'analyzeImage', arguments: '{}', result: '' });
    expect(card.tagName).toBe('ARTICLE');
    expect(card.className).toBe('tool-executed');
    expect(card.getAttribute('role')).toBe('group');
  });

  it('uses the known tool label + icon', () => {
    const card = renderToolExecutedCard({ name: 'classifyIssues', arguments: '{}', result: 'none' });
    expect(titleOf(card)).toBe('Classified issues');
    expect(card.querySelector('.tool-executed__icon i').className).toContain('bi-tags');
  });

  it('falls back to the raw tool name + generic icon for unknown tools', () => {
    const card = renderToolExecutedCard({ name: 'mysteryTool', arguments: '{}', result: 'x' });
    expect(titleOf(card)).toBe('mysteryTool');
    expect(card.querySelector('.tool-executed__icon i').className).toContain('bi-tools');
  });

  it('falls back to a generic "Tool" label when name is missing', () => {
    const card = renderToolExecutedCard({ name: '', arguments: '{}', result: 'x' });
    expect(titleOf(card)).toBe('Tool');
  });
});

describe('TOOLS_HIDDEN_BY_DEFAULT', () => {
  it('hides preview + commit (they have rich cards)', () => {
    expect(TOOLS_HIDDEN_BY_DEFAULT.has('previewCorrection')).toBe(true);
    expect(TOOLS_HIDDEN_BY_DEFAULT.has('commitCorrection')).toBe(true);
    expect(TOOLS_HIDDEN_BY_DEFAULT.has('analyzeImage')).toBe(false);
  });
});

describe('summarize — analyzeImage', () => {
  it('formats luma/sat/cast metrics from a JSON result', () => {
    const result = JSON.stringify({ medianY: 0.42, meanS: 5.6, castAngleDeg: 123.4 });
    const card = renderToolExecutedCard({ name: 'analyzeImage', arguments: '{"imagePath":"/p/a.jpg"}', result });
    const s = summaryOf(card);
    expect(s).toContain('a.jpg —');
    expect(s).toContain('luma 0.42');   // <1 → 2dp
    expect(s).toContain('sat 5.6');     // <10 → 1dp
    expect(s).toContain('cast 123°');   // >=10 → rounded
  });

  it('falls back to "Read <file>" when result has no usable metrics', () => {
    const card = renderToolExecutedCard({ name: 'analyzeImage', arguments: '{"imagePath":"/p/a.jpg"}', result: 'garbage' });
    expect(summaryOf(card)).toBe('Read a.jpg');
  });

  it('truncates a raw result when neither metrics nor imagePath exist', () => {
    const card = renderToolExecutedCard({ name: 'analyzeImage', arguments: '{}', result: 'plain text' });
    expect(summaryOf(card)).toBe('plain text');
  });
});

describe('summarize — classifyIssues', () => {
  it('reports "No issues detected" for "none"', () => {
    const card = renderToolExecutedCard({ name: 'classifyIssues', arguments: '{}', result: 'None' });
    expect(summaryOf(card)).toBe('No issues detected');
  });

  it('counts a single issue (singular noun)', () => {
    const card = renderToolExecutedCard({ name: 'classifyIssues', arguments: '{}', result: 'Hazy' });
    expect(summaryOf(card)).toBe('1 issue: Hazy');
  });

  it('counts and lists up to three issues, eliding the rest', () => {
    const card = renderToolExecutedCard({ name: 'classifyIssues', arguments: '{}', result: 'a, b, c, d' });
    expect(summaryOf(card)).toBe('4 issues: a, b, c…');
  });
});

describe('summarize — recommendCorrections', () => {
  it('summarises a ranked array with the top three algorithm ids', () => {
    const result = JSON.stringify([
      { algorithmId: 'gray-world' }, { algorithmId: 'white-patch' },
      { algorithmId: 'temperature' }, { algorithmId: 'aces' },
    ]);
    const card = renderToolExecutedCard({ name: 'recommendCorrections', arguments: '{}', result });
    expect(summaryOf(card)).toBe('4 ranked — gray-world, white-patch, temperature…');
  });

  it('truncates non-array results', () => {
    const card = renderToolExecutedCard({ name: 'recommendCorrections', arguments: '{}', result: 'oops' });
    expect(summaryOf(card)).toBe('oops');
  });
});

describe('summarize — misc tools', () => {
  it('describeAlgorithm uses the algoId argument', () => {
    const card = renderToolExecutedCard({ name: 'describeAlgorithm', arguments: '{"algoId":"gray-world"}', result: '...' });
    expect(summaryOf(card)).toBe('Looked up gray-world');
  });

  it('listWorkflows counts a JSON array', () => {
    const card = renderToolExecutedCard({ name: 'listWorkflows', arguments: '{}', result: '[1,2,3]' });
    expect(summaryOf(card)).toBe('3 workflows');
  });

  it('applyCorrection reports the exported filename', () => {
    const card = renderToolExecutedCard({ name: 'applyCorrection', arguments: '{}', result: '/out/final.jpg' });
    expect(summaryOf(card)).toBe('Exported final.jpg');
  });

  it('applyCorrection reports a bare "Exported" when result is empty', () => {
    const card = renderToolExecutedCard({ name: 'applyCorrection', arguments: '{}', result: '' });
    expect(summaryOf(card)).toBe('Exported');
  });

  it('previewCorrection echoes the method argument', () => {
    const card = renderToolExecutedCard({ name: 'previewCorrection', arguments: '{"method":"gray_world"}', result: '' });
    expect(summaryOf(card)).toBe('gray_world');
  });

  it('default branch appends "(truncated)" when flagged', () => {
    const card = renderToolExecutedCard({ name: 'someTool', arguments: '{}', result: 'partial output', truncated: true });
    expect(summaryOf(card)).toBe('partial output (truncated)');
  });
});
