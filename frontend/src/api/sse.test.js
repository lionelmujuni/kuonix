import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postSse } from './sse.js';

// Build a Response whose body is a ReadableStream that yields the given UTF-8
// chunks. Used to simulate the backend's SSE wire format.
function sseResponse(chunks, { status = 200 } = {}) {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('postSse — record parsing', () => {
  it('parses a single token event with JSON-string payload', async () => {
    fetch.mockResolvedValueOnce(sseResponse([
      'event: token\n',
      'data: "hello"\n\n',
      'data: [DONE]\n\n',
    ]));
    const onEvent = vi.fn();
    const onToken = vi.fn();
    const onComplete = vi.fn();
    postSse('/agent/chat', {}, { onEvent, onToken, onComplete });
    await new Promise(r => setTimeout(r, 5));
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'token',
      data: 'hello',
    }));
    expect(onToken).toHaveBeenCalledWith('hello');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('parses a JSON object payload and exposes it on data', async () => {
    fetch.mockResolvedValueOnce(sseResponse([
      'event: correction\n',
      'data: {"method":"exposure","value":0.3}\n\n',
      'data: [DONE]\n\n',
    ]));
    const onEvent = vi.fn();
    postSse('/agent/chat', {}, { onEvent });
    await new Promise(r => setTimeout(r, 5));
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'correction',
      data: { method: 'exposure', value: 0.3 },
    }));
  });

  it('keeps non-JSON payloads as raw strings', async () => {
    fetch.mockResolvedValueOnce(sseResponse([
      'data: not-json-here\n\n',
      'data: [DONE]\n\n',
    ]));
    const onEvent = vi.fn();
    postSse('/x', {}, { onEvent });
    await new Promise(r => setTimeout(r, 5));
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'message',
      data: 'not-json-here',
    }));
  });

  it('handles a record split across chunk boundaries', async () => {
    fetch.mockResolvedValueOnce(sseResponse([
      'event: tok',
      'en\ndata: "ab',
      'cd"\n\n',
      'data: [DONE]\n\n',
    ]));
    const onToken = vi.fn();
    postSse('/x', {}, { onToken });
    await new Promise(r => setTimeout(r, 5));
    expect(onToken).toHaveBeenCalledWith('abcd');
  });

  it('completes naturally when stream ends without [DONE]', async () => {
    fetch.mockResolvedValueOnce(sseResponse([
      'event: token\ndata: "x"\n\n',
    ]));
    const onComplete = vi.fn();
    postSse('/x', {}, { onComplete });
    await new Promise(r => setTimeout(r, 5));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('postSse — request shape', () => {
  it('POSTs JSON body to BASE_URL + path with abort signal', async () => {
    fetch.mockResolvedValueOnce(sseResponse(['data: [DONE]\n\n']));
    postSse('/agent/chat', { sessionId: 's1', text: 'hi' }, {});
    await new Promise(r => setTimeout(r, 1));
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toMatch(/\/agent\/chat$/);
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toEqual({ sessionId: 's1', text: 'hi' });
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('postSse — error paths', () => {
  it('reports onError on non-ok response', async () => {
    fetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const onError = vi.fn();
    postSse('/x', {}, { onError });
    await new Promise(r => setTimeout(r, 5));
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('cancel() aborts the underlying request without firing onError', async () => {
    fetch.mockImplementation(() => new Promise(() => {})); // never resolves
    const onError = vi.fn();
    const ctrl = postSse('/x', {}, { onError });
    ctrl.cancel();
    await new Promise(r => setTimeout(r, 5));
    expect(onError).not.toHaveBeenCalled();
  });
});
