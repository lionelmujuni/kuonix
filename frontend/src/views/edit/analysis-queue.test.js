import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../api/endpoints/images.js', () => ({
  classify: vi.fn(),
}));

import { createAnalysisQueue } from './analysis-queue.js';
import { classify } from '../../api/endpoints/images.js';
import * as state from '../../state.js';

function addImages(paths) {
  for (const p of paths) state.addImage({ path: p, state: 'decoding', issues: [], features: null });
}
function stateOf(path) {
  return state.get('images').find((r) => r.path === path)?.state;
}

beforeEach(() => {
  state.clearImages();
  classify.mockReset();
});

describe('createAnalysisQueue — happy path', () => {
  it('moves a card queued → analyzing → ready and reports the result', async () => {
    classify.mockResolvedValue({ results: [{ path: '/a.jpg', issues: ['Hazy'], features: { medianY: 0.4 } }] });
    addImages(['/a.jpg']);

    const results = [];
    const q = createAnalysisQueue({ onResult: (r) => results.push(r) });
    q.enqueue('/a.jpg');
    // With a free worker the item starts immediately; "queued" is only visible
    // when the pool is saturated (covered by the concurrency test).
    expect(stateOf('/a.jpg')).toBe('analyzing');

    await q.whenDrained();

    expect(stateOf('/a.jpg')).toBe('ready');
    expect(state.get('images')[0].issues).toEqual(['Hazy']);
    expect(results).toEqual([expect.objectContaining({ path: '/a.jpg', ok: true })]);
  });

  it('reports aggregate progress reaching total === done', async () => {
    classify.mockResolvedValue({ results: [{ path: 'x', issues: [], features: {} }] });
    addImages(['/a.jpg', '/b.jpg', '/c.jpg']);

    const progress = [];
    const q = createAnalysisQueue({ onProgress: (p) => progress.push(p) });
    ['/a.jpg', '/b.jpg', '/c.jpg'].forEach((p) => q.enqueue(p));
    await q.whenDrained();

    const last = progress[progress.length - 1];
    // Counters reset once fully idle, so the final emit is the zeroed baseline;
    // the peak emit should show all three processed.
    const peak = progress.find((p) => p.done === 3);
    expect(peak).toBeTruthy();
    expect(last).toMatchObject({ total: 0, done: 0, failed: 0 });
  });
});

describe('createAnalysisQueue — failures', () => {
  it('marks a card errored and reports ok:false when classify rejects', async () => {
    classify.mockRejectedValue(new Error('boom'));
    addImages(['/a.jpg']);

    const results = [];
    const q = createAnalysisQueue({ onResult: (r) => results.push(r) });
    q.enqueue('/a.jpg');
    await q.whenDrained();

    expect(stateOf('/a.jpg')).toBe('error');
    expect(results[0]).toMatchObject({ path: '/a.jpg', ok: false });
  });

  it('skips a path whose card no longer exists (never calls classify)', async () => {
    classify.mockResolvedValue({ results: [{ path: 'x', issues: [], features: {} }] });
    // No addImages → the slot does not exist.
    const q = createAnalysisQueue({});
    q.enqueue('/gone.jpg');
    await q.whenDrained();
    expect(classify).not.toHaveBeenCalled();
  });
});

describe('createAnalysisQueue — concurrency', () => {
  it('never runs more than `concurrency` analyses at once', async () => {
    let inFlight = 0, peak = 0;
    const gates = [];
    classify.mockImplementation(() => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      return new Promise((resolve) => {
        gates.push(() => { inFlight -= 1; resolve({ results: [{ path: 'x', issues: [], features: {} }] }); });
      });
    });

    const q = createAnalysisQueue({});
    const paths = Array.from({ length: q.concurrency + 3 }, (_, i) => `/img${i}.jpg`);
    addImages(paths);
    paths.forEach((p) => q.enqueue(p));

    // Workers start synchronously up to the cap; the rest wait in the queue.
    expect(classify).toHaveBeenCalledTimes(q.concurrency);
    // The overflow items sit in the "queued" state until a worker frees up.
    expect(stateOf(paths[paths.length - 1])).toBe('queued');

    // Drain: release gates until everything has been processed.
    while (gates.length) { gates.shift()(); await Promise.resolve(); await Promise.resolve(); }
    await q.whenDrained();

    expect(peak).toBe(q.concurrency);
    expect(classify).toHaveBeenCalledTimes(paths.length);
  });
});
