import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiJson, apiText, apiUploadMultipart, pingHealth, waitForBackend, ApiError, BASE_URL,
} from './client.js';

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function textResponse(text, { status = 200 } = {}) {
  return new Response(text, { status });
}

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('apiJson', () => {
  it('GETs and parses JSON on 200', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const out = await apiJson('/foo');
    expect(out).toEqual({ ok: true });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/foo`);
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('returns null on 204 No Content', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const out = await apiJson('/empty');
    expect(out).toBe(null);
  });

  it('throws ApiError with status + body on non-2xx', async () => {
    // Fresh Response per call — a Response body can only be read once, and the
    // assertion makes two independent apiJson('/fail') calls.
    fetch.mockImplementation(() => Promise.resolve(textResponse('boom', { status: 500 })));
    await expect(apiJson('/fail')).rejects.toThrow(ApiError);
    await expect(apiJson('/fail').catch(e => e)).resolves.toBeInstanceOf(ApiError);
  });

  it('preserves caller headers and merges Content-Type default', async () => {
    fetch.mockResolvedValue(jsonResponse({}));
    await apiJson('/x', { method: 'POST', headers: { 'X-Trace': 'abc' }, body: '{}' });
    const [, opts] = fetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-Trace']).toBe('abc');
    expect(opts.headers['Content-Type']).toBe('application/json');
  });
});

// Every request carries a deadline. Without one, a fetch that never settled
// hung its caller forever — the decode poller latched and its images sat at
// "decoding" for the rest of the session with no error and no analysis.
describe('apiJson — request deadlines', () => {
  // A fetch that only settles when its signal aborts: models a stalled backend.
  function stalledFetch() {
    return vi.fn((url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener(
        'abort',
        () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        { once: true },
      );
    }));
  }

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('passes an AbortSignal on every request', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({}));
    await apiJson('/x');
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts a stalled request once timeoutMs elapses', async () => {
    globalThis.fetch = stalledFetch();
    const rejects = expect(apiJson('/stall', { timeoutMs: 5000 })).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(5000);
    await rejects;
    expect(fetch.mock.calls[0][1].signal.reason).toBe('timeout');
  });

  it('leaves a request in flight until its deadline is actually reached', async () => {
    globalThis.fetch = stalledFetch();
    let settled = false;
    apiJson('/stall', { timeoutMs: 5000 }).catch(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
  });

  it('honours a caller-supplied signal alongside the deadline', async () => {
    globalThis.fetch = stalledFetch();
    const ctrl = new AbortController();
    const rejects = expect(
      apiJson('/stall', { signal: ctrl.signal, timeoutMs: 60_000 }),
    ).rejects.toThrow();
    ctrl.abort('cancelled');
    await rejects;
    expect(fetch.mock.calls[0][1].signal.reason).toBe('cancelled');
  });

  it('does not forward timeoutMs to fetch as a request option', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({}));
    await apiJson('/x', { timeoutMs: 1234 });
    expect(fetch.mock.calls[0][1]).not.toHaveProperty('timeoutMs');
  });

  it('clears its deadline timer when the request succeeds', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await apiJson('/x');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its deadline timer when the request fails', async () => {
    fetch.mockResolvedValueOnce(textResponse('boom', { status: 500 }));
    await expect(apiJson('/fail')).rejects.toBeInstanceOf(ApiError);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('apiText', () => {
  it('returns plain text on 200', async () => {
    fetch.mockResolvedValueOnce(textResponse('hello'));
    expect(await apiText('/t')).toBe('hello');
  });

  it('throws ApiError on non-ok', async () => {
    fetch.mockResolvedValueOnce(textResponse('nope', { status: 404 }));
    await expect(apiText('/t')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('apiUploadMultipart', () => {
  it('builds FormData with files under the given field name', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ uploaded: 2 }));
    const f1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const f2 = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
    const out = await apiUploadMultipart('/upload', [f1, f2]);
    expect(out).toEqual({ uploaded: 2 });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/upload`);
    expect(opts.method).toBe('POST');
    expect(opts.body).toBeInstanceOf(FormData);
    const all = opts.body.getAll('files');
    expect(all).toHaveLength(2);
  });

  it('uses a custom field name when provided', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({}));
    const f = new File(['x'], 'x.jpg');
    await apiUploadMultipart('/u', [f], 'image');
    const fd = fetch.mock.calls[0][1].body;
    expect(fd.getAll('image')).toHaveLength(1);
    expect(fd.getAll('files')).toHaveLength(0);
  });
});

describe('pingHealth', () => {
  it('returns true when backend responds 2xx', async () => {
    fetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    expect(await pingHealth()).toBe(true);
  });

  it('treats 4xx as alive (only 5xx counts as down)', async () => {
    fetch.mockResolvedValueOnce(new Response('', { status: 404 }));
    expect(await pingHealth()).toBe(true);
  });

  it('returns false when fetch rejects', async () => {
    fetch.mockRejectedValueOnce(new Error('connection refused'));
    expect(await pingHealth()).toBe(false);
  });

  it('passes an AbortSignal so the request is cancellable', async () => {
    fetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await pingHealth(100);
    const opts = fetch.mock.calls[0][1];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('waitForBackend', () => {
  it('returns true on first successful ping', async () => {
    fetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    expect(await waitForBackend({ attempts: 3, delayMs: 1 })).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries until attempts run out, then returns false', async () => {
    fetch.mockRejectedValue(new Error('down'));
    expect(await waitForBackend({ attempts: 2, delayMs: 1 })).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
