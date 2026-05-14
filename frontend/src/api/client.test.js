import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    fetch.mockResolvedValueOnce(textResponse('boom', { status: 500 }));
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
