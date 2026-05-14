import { describe, it, expect, beforeEach, vi } from 'vitest';

// state.js reads localStorage at module-load time, so reset modules per test.
let state;
beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  state = await import('./state.js');
});

describe('state — defaults', () => {
  it('initialises with default theme/accent/mode when storage is empty', () => {
    expect(state.get('theme')).toBe('system');
    expect(state.get('accent')).toBe('blue');
    expect(state.get('mode')).toBe('single');
    expect(state.get('agentRailCollapsed')).toBe(false);
  });

  it('starts with no images and activeIndex = -1', () => {
    expect(state.get('images')).toEqual([]);
    expect(state.get('activeIndex')).toBe(-1);
    expect(state.get('currentImagePath')).toBe(null);
  });

  it('generates a sessionId per launch (not persisted)', () => {
    const id = state.get('sessionId');
    expect(typeof id).toBe('string');
    expect(id.startsWith('s_')).toBe(true);
  });
});

describe('state — set / update / on', () => {
  it('set() updates value, persists, and emits to subscribers', () => {
    const fn = vi.fn();
    state.on('theme', fn);
    state.set('theme', 'dark');
    expect(state.get('theme')).toBe('dark');
    expect(fn).toHaveBeenCalledWith('dark', expect.any(Object));
    const persisted = JSON.parse(localStorage.getItem('kuonix.state.v1'));
    expect(persisted.theme).toBe('dark');
  });

  it('set() is a no-op when value is unchanged', () => {
    const fn = vi.fn();
    state.set('theme', 'dark');
    state.on('theme', fn);
    state.set('theme', 'dark');
    expect(fn).not.toHaveBeenCalled();
  });

  it('update() emits per changed key and persists once', () => {
    const themeFn = vi.fn(); const accentFn = vi.fn();
    state.on('theme', themeFn);
    state.on('accent', accentFn);
    state.update({ theme: 'dark', accent: 'pink' });
    expect(themeFn).toHaveBeenCalledWith('dark', expect.any(Object));
    expect(accentFn).toHaveBeenCalledWith('pink', expect.any(Object));
    const persisted = JSON.parse(localStorage.getItem('kuonix.state.v1'));
    expect(persisted.theme).toBe('dark');
    expect(persisted.accent).toBe('pink');
  });

  it('on() returns an unsubscribe function', () => {
    const fn = vi.fn();
    const off = state.on('theme', fn);
    off();
    state.set('theme', 'dark');
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('state — persistence whitelist', () => {
  it('only persists PERSISTED_KEYS, not runtime fields', () => {
    state.set('theme', 'dark');
    state.addImage({ path: '/tmp/a.jpg', url: 'blob:a' });
    const persisted = JSON.parse(localStorage.getItem('kuonix.state.v1'));
    expect(persisted).toHaveProperty('theme', 'dark');
    expect(persisted).not.toHaveProperty('images');
    expect(persisted).not.toHaveProperty('sessionId');
    expect(persisted).not.toHaveProperty('activeIndex');
  });

  it('hydrates persisted keys on next module load', async () => {
    state.update({ theme: 'dark', accent: 'pink', mode: 'batch' });
    vi.resetModules();
    const reloaded = await import('./state.js');
    expect(reloaded.get('theme')).toBe('dark');
    expect(reloaded.get('accent')).toBe('pink');
    expect(reloaded.get('mode')).toBe('batch');
  });
});

describe('state — image lifecycle', () => {
  it('addImage() appends, sets activeIndex, syncs current* mirrors', () => {
    state.addImage({ path: '/p/a.jpg', url: 'blob:a' });
    expect(state.get('images')).toHaveLength(1);
    expect(state.get('activeIndex')).toBe(0);
    expect(state.get('currentImagePath')).toBe('/p/a.jpg');
    expect(state.get('currentImageUrl')).toBe('blob:a');
  });

  it('addImage() with an existing path merges instead of duplicating', () => {
    state.addImage({ path: '/p/a.jpg', url: 'blob:a' });
    state.addImage({ path: '/p/a.jpg', taskId: 't1' });
    expect(state.get('images')).toHaveLength(1);
    expect(state.get('images')[0].taskId).toBe('t1');
    expect(state.get('images')[0].url).toBe('blob:a');
  });

  it('updateImage() patches by path and syncs mirrors when active', () => {
    state.addImage({ path: '/p/a.jpg' });
    state.updateImage('/p/a.jpg', { state: 'ready', issues: ['ColorCast_Cool'] });
    expect(state.get('images')[0].state).toBe('ready');
    expect(state.get('analysisState')).toBe('ready');
    expect(state.get('currentIssues')).toEqual(['ColorCast_Cool']);
  });

  it('renameImage() rewrites path in place and preserves index', () => {
    state.addImage({ path: '/tmp/a.jpg' });
    const ok = state.renameImage('/tmp/a.jpg', '/real/a.jpg', { state: 'decoded' });
    expect(ok).toBe(true);
    expect(state.get('images')[0].path).toBe('/real/a.jpg');
    expect(state.get('currentImagePath')).toBe('/real/a.jpg');
  });

  it('renameImage() returns false when oldPath is unknown', () => {
    expect(state.renameImage('/nope', '/somewhere')).toBe(false);
  });

  it('removeImage() shrinks list and clamps activeIndex', () => {
    state.addImage({ path: '/p/a.jpg' });
    state.addImage({ path: '/p/b.jpg' });
    state.setActiveIndex(1);
    state.removeImage('/p/b.jpg');
    expect(state.get('images')).toHaveLength(1);
    expect(state.get('activeIndex')).toBe(0);
    expect(state.get('currentImagePath')).toBe('/p/a.jpg');
  });

  it('clearImages() resets list, active index, and filter', () => {
    state.addImage({ path: '/p/a.jpg' });
    state.setFilterIssue('ColorCast_Warm');
    state.clearImages();
    expect(state.get('images')).toEqual([]);
    expect(state.get('activeIndex')).toBe(-1);
    expect(state.get('filterIssue')).toBe(null);
    expect(state.get('currentImagePath')).toBe(null);
  });
});

describe('state — selection and filtering', () => {
  beforeEach(() => {
    state.addImage({ path: '/p/a.jpg', issues: ['ColorCast_Warm'] });
    state.addImage({ path: '/p/b.jpg', issues: ['ColorCast_Cool'] });
    state.addImage({ path: '/p/c.jpg', issues: [] });
  });

  it('toggleSelected() flips selection and emits selectedPaths', () => {
    const fn = vi.fn();
    state.on('selectedPaths', fn);
    state.toggleSelected('/p/a.jpg', false);
    expect(state.getSelectedPaths()).toEqual(['/p/b.jpg', '/p/c.jpg']);
    expect(fn).toHaveBeenCalled();
  });

  it('selectAll(false) deselects every image', () => {
    state.selectAll(false);
    expect(state.getSelectedPaths()).toEqual([]);
  });

  it('visibleImages() filters by filterIssue', () => {
    state.setFilterIssue('ColorCast_Warm');
    expect(state.visibleImages().map(r => r.path)).toEqual(['/p/a.jpg']);
  });

  it('visibleImages() returns all when no filter is set', () => {
    expect(state.visibleImages()).toHaveLength(3);
  });
});

describe('state — accent presets', () => {
  it('exposes the 10 named presets with rgb triples', () => {
    expect(Object.keys(state.ACCENT_PRESETS)).toHaveLength(10);
    expect(state.ACCENT_PRESETS.blue).toMatchObject({
      rgb: expect.any(String),
      label: 'Blue',
    });
  });
});
