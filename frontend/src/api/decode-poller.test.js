import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// The poller gates the whole decode→analysis handoff: if a watcher never
// settles, pipelineRaw never reaches analysisQueue.enqueue() and the image sits
// at "decoding" forever with no error and no analysis. These tests pin down the
// recovery behaviour that guarantees a watcher always settles.
// ---------------------------------------------------------------------------

const { apiJsonMock } = vi.hoisted(() => ({ apiJsonMock: vi.fn() }));
vi.mock('./client.js', () => ({ apiJson: apiJsonMock }));

const POLL_MS = 1000;
const POLL_TIMEOUT_MS = 10_000;
const MAX_CONSECUTIVE_FAILURES = 30;

// Fresh module instance per test — the poller keeps module-level state
// (watchers, timer, inFlight, consecutiveFailures) that would leak between cases.
async function loadPoller() {
  vi.resetModules();
  return import('./decode-poller.js');
}

const complete = (taskId, fullPath = '/full/a.jpg') => ({ taskId, status: 'complete', fullPath });

beforeEach(() => {
  vi.useFakeTimers();
  apiJsonMock.mockReset();
  // The failure paths log by design; keep the reporter readable.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('watchDecode — terminal statuses', () => {
  it('resolves with the completion event, carrying fullPath through', async () => {
    const { watchDecode } = await loadPoller();
    apiJsonMock.mockResolvedValue([complete('t1', '/full/shot.jpg')]);

    const p = watchDecode('t1');
    await vi.advanceTimersByTimeAsync(POLL_MS);

    await expect(p).resolves.toMatchObject({ status: 'complete', fullPath: '/full/shot.jpg' });
  });

  it.each(['error', 'missing'])('resolves on a %s event', async (status) => {
    const { watchDecode } = await loadPoller();
    apiJsonMock.mockResolvedValue([{ taskId: 't1', status }]);

    const p = watchDecode('t1');
    await vi.advanceTimersByTimeAsync(POLL_MS);

    await expect(p).resolves.toMatchObject({ status });
  });

  it('forwards non-terminal events to onProgress without resolving', async () => {
    const { watchDecode } = await loadPoller();
    apiJsonMock.mockResolvedValue([{ taskId: 't1', status: 'decoding', progress: 40 }]);

    const onProgress = vi.fn();
    let settled = false;
    watchDecode('t1', { onProgress }).then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ progress: 40 }));
    expect(settled).toBe(false);
  });

  it('stops polling once every watcher has settled', async () => {
    const { watchDecode } = await loadPoller();
    apiJsonMock.mockResolvedValue([complete('t1')]);

    await watchDecodeAndAdvance(watchDecode('t1'));
    const callsAtResolve = apiJsonMock.mock.calls.length;

    await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    expect(apiJsonMock.mock.calls.length).toBe(callsAtResolve);
  });
});

describe('watchDecode — a stalled or failing poll never strands a watcher', () => {
  it('survives a poll that stalls until its deadline fires', async () => {
    const { watchDecode } = await loadPoller();
    // First poll hangs, then rejects the way apiJson's deadline would. Before
    // the deadline existed this request never settled, `inFlight` latched true,
    // and every later tick early-returned — the poller was dead for the session.
    apiJsonMock.mockImplementationOnce(() => new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), POLL_TIMEOUT_MS);
    }));
    apiJsonMock.mockResolvedValue([complete('t1')]);

    const p = watchDecode('t1');
    await vi.advanceTimersByTimeAsync(POLL_MS);           // tick 1 dispatches, then stalls
    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS);   // its deadline fires → rejects
    await vi.advanceTimersByTimeAsync(POLL_MS);           // tick 2 resolves the watcher

    await expect(p).resolves.toMatchObject({ status: 'complete' });
  });

  it('recovers from a transient failure and resolves on a later poll', async () => {
    const { watchDecode } = await loadPoller();
    apiJsonMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue([complete('t1')]);

    const p = watchDecode('t1');
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);

    await expect(p).resolves.toMatchObject({ status: 'complete' });
  });

  it('gives up after sustained failures rather than waiting forever', async () => {
    const { watchDecode } = await loadPoller();
    apiJsonMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const p = watchDecode('t1');
    await vi.advanceTimersByTimeAsync(POLL_MS * MAX_CONSECUTIVE_FAILURES);

    // Resolving as "error" lets pipelineRaw fall back to analysing the preview.
    await expect(p).resolves.toMatchObject({ status: 'error' });
  });

  it('does not give up while failures are interrupted by successes', async () => {
    const { watchDecode } = await loadPoller();
    let n = 0;
    // Alternate failure/pending-success: the consecutive counter must reset.
    apiJsonMock.mockImplementation(() => (n++ % 2 === 0
      ? Promise.reject(new Error('flaky'))
      : Promise.resolve([{ taskId: 't1', status: 'decoding', progress: 10 }])));

    let settled = false;
    watchDecode('t1').then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(POLL_MS * MAX_CONSECUTIVE_FAILURES * 2);

    expect(settled).toBe(false);
  });
});

describe('cancelDecodeWatches', () => {
  it('resolves pending watchers as cancelled and stops polling', async () => {
    const { watchDecode, cancelDecodeWatches } = await loadPoller();
    apiJsonMock.mockResolvedValue([]);

    const p = watchDecode('t1');
    cancelDecodeWatches();

    await expect(p).resolves.toMatchObject({ taskId: 't1', status: 'cancelled' });
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(apiJsonMock).not.toHaveBeenCalled();
  });
});

describe('poll request shape', () => {
  it('bounds each poll with a timeout', async () => {
    const { watchDecode } = await loadPoller();
    apiJsonMock.mockResolvedValue([]);

    watchDecode('t1');
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(apiJsonMock).toHaveBeenCalledWith(
      expect.stringContaining('/images/decode-status?'),
      { timeoutMs: POLL_TIMEOUT_MS },
    );
  });

  it('percent-encodes task ids', async () => {
    const { watchDecode } = await loadPoller();
    apiJsonMock.mockResolvedValue([]);

    watchDecode('id/1');
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(apiJsonMock.mock.calls[0][0]).toContain(`taskIds=${encodeURIComponent('id/1')}`);
  });

  it('splits more than 100 task ids across separate requests', async () => {
    const { watchDecode } = await loadPoller();
    apiJsonMock.mockResolvedValue([]);

    for (let i = 0; i < 150; i++) watchDecode(`t${i}`);
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(apiJsonMock).toHaveBeenCalledTimes(2);
    expect(apiJsonMock.mock.calls[0][0].match(/taskIds=/g)).toHaveLength(100);
    expect(apiJsonMock.mock.calls[1][0].match(/taskIds=/g)).toHaveLength(50);
  });
});

// Advances just far enough for one poll cycle to settle the given promise.
async function watchDecodeAndAdvance(promise) {
  await vi.advanceTimersByTimeAsync(POLL_MS);
  return promise;
}
