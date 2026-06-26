import { describe, it, expect, beforeEach } from 'vitest';
import { createGroupFilter } from './group-filter.js';
import * as state from '../../state.js';

// Uses the real state store (reset between tests via localStorage.clear in
// setup.js) and the real issue-meta labels.

const IMAGES = [
  { path: '/a.jpg', issues: ['Hazy', 'ColorCast_Blue'] },
  { path: '/b.jpg', issues: ['Hazy'] },
  { path: '/c.jpg', issues: [] },
];

function chips(filter) {
  return [...filter.el.querySelectorAll('.group-chip')];
}
function labelOf(chip) {
  return chip.querySelector('.group-chip__label').textContent;
}
function countOf(chip) {
  return chip.querySelector('.group-chip__count').textContent;
}

let filter;
beforeEach(() => {
  state.set('images', IMAGES);
  state.set('filterIssue', null);
  filter = createGroupFilter();
});

describe('createGroupFilter — rendering', () => {
  it('renders an "All" chip first with the total image count', () => {
    const [all] = chips(filter);
    expect(labelOf(all)).toBe('All');
    expect(countOf(all)).toBe('3');
  });

  it('renders one chip per distinct issue, sorted by descending count', () => {
    const labels = chips(filter).map(labelOf);
    // All, then Hazy (2), then Cool cast (1).
    expect(labels).toEqual(['All', 'Hazy', 'Cool cast']);
  });

  it('uses human labels from issue-meta and the per-issue counts', () => {
    const hazy = chips(filter).find((c) => labelOf(c) === 'Hazy');
    expect(countOf(hazy)).toBe('2');
    const cast = chips(filter).find((c) => labelOf(c) === 'Cool cast');
    expect(countOf(cast)).toBe('1');
  });
});

describe('createGroupFilter — interaction', () => {
  it('clicking an issue chip sets the filter and selects the matching set', () => {
    const hazy = chips(filter).find((c) => labelOf(c) === 'Hazy');
    hazy.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(state.get('filterIssue')).toBe('Hazy');
    expect(state.getSelectedPaths().sort()).toEqual(['/a.jpg', '/b.jpg']);
  });

  it('re-renders with is-active on the chosen chip after filtering', () => {
    const hazy = chips(filter).find((c) => labelOf(c) === 'Hazy');
    hazy.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const active = chips(filter).filter((c) => c.classList.contains('is-active'));
    expect(active.map(labelOf)).toEqual(['Hazy']);
  });

  it('clicking "All" clears the filter without forcing a selection', () => {
    state.set('filterIssue', 'Hazy');
    const [all] = chips(filter);
    all.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(state.get('filterIssue')).toBeNull();
  });

  it('reacts to images changing in the store', () => {
    state.set('images', [{ path: '/x.jpg', issues: ['Needs_Noise_Reduction'] }]);
    const labels = chips(filter).map(labelOf);
    expect(labels).toEqual(['All', 'Shadow noise']);
  });

  it('destroy() unsubscribes so later store changes do not re-render', () => {
    filter.destroy();
    const before = filter.el.innerHTML;
    state.set('images', []);
    expect(filter.el.innerHTML).toBe(before);
  });
});
