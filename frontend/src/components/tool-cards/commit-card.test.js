import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../bus.js', () => ({
  emit: vi.fn(),
  EVENTS: { STAGE_RESTORE: 'kuonix:stage:restore' },
}));

import { renderCommitCard } from './commit-card.js';
import { emit, EVENTS } from '../../bus.js';

const BASE64 = 'data:image/jpeg;base64,COMMITTED';
const METHOD = 'temperature_tint';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('renderCommitCard — structure', () => {
  it('renders an article with tool-card--commit class', () => {
    const card = renderCommitCard({ workingPath: '/w/x.jpg', base64: BASE64, method: METHOD, params: {} });
    expect(card.tagName).toBe('ARTICLE');
    expect(card.classList.contains('tool-card--commit')).toBe(true);
  });

  it('sets aria-label to "Committed: <method>"', () => {
    const card = renderCommitCard({ workingPath: '/w/x.jpg', base64: BASE64, method: METHOD, params: {} });
    expect(card.getAttribute('aria-label')).toBe(`Committed: ${METHOD}`);
  });

  it('prettifies the method into the title (snake_case → Title Case)', () => {
    const card = renderCommitCard({ workingPath: '/w/x.jpg', base64: BASE64, method: METHOD, params: {} });
    expect(card.querySelector('.tool-card__title').textContent).toBe('Temperature Tint');
  });

  it('falls back to "Correction" when method is missing', () => {
    const card = renderCommitCard({ workingPath: '/w/x.jpg', base64: BASE64, params: {} });
    expect(card.querySelector('.tool-card__title').textContent).toBe('Correction');
  });

  it('shows the basename of the working path', () => {
    const card = renderCommitCard({ workingPath: 'C:/work/sub/photo.jpg', base64: BASE64, method: METHOD, params: {} });
    expect(card.querySelector('.tool-card__path').textContent).toBe('photo.jpg');
  });

  it('renders an img in the thumb when base64 is provided', () => {
    const card = renderCommitCard({ workingPath: '/w/x.jpg', base64: BASE64, method: METHOD, params: {} });
    const img = card.querySelector('.tool-card__thumb img');
    expect(img).not.toBeNull();
    expect(img.src).toContain('COMMITTED');
  });

  it('renders no img when base64 is absent', () => {
    const card = renderCommitCard({ workingPath: '/w/x.jpg', method: METHOD, params: {} });
    expect(card.querySelector('.tool-card__thumb img')).toBeNull();
  });

  it('renders param chips from the params object', () => {
    const card = renderCommitCard({ workingPath: '/w/x.jpg', base64: BASE64, method: METHOD, params: { temperature: 50, tint: -10 } });
    expect(card.querySelectorAll('.tool-card__param').length).toBe(2);
  });

  it('escapes HTML in the working path title attribute', () => {
    const card = renderCommitCard({ workingPath: '/w/<script>.jpg', base64: BASE64, method: METHOD, params: {} });
    const pathEl = card.querySelector('.tool-card__path');
    // Attribute round-trips the literal string; no raw element injected.
    expect(pathEl.getAttribute('title')).toBe('/w/<script>.jpg');
    expect(card.querySelector('script')).toBeNull();
  });
});

describe('renderCommitCard — restore interaction', () => {
  it('click emits STAGE_RESTORE with src + path when base64 present', () => {
    const card = renderCommitCard({ workingPath: '/w/x.jpg', base64: BASE64, method: METHOD, params: {} });
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(emit).toHaveBeenCalledWith(EVENTS.STAGE_RESTORE, { src: BASE64, path: '/w/x.jpg' });
  });

  it('click is a no-op when base64 is absent', () => {
    const card = renderCommitCard({ workingPath: '/w/x.jpg', method: METHOD, params: {} });
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(emit).not.toHaveBeenCalled();
  });

  it('marks the card as a pointer affordance', () => {
    const card = renderCommitCard({ workingPath: '/w/x.jpg', base64: BASE64, method: METHOD, params: {} });
    expect(card.style.cursor).toBe('pointer');
  });
});
