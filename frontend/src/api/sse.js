// SSE consumer.
//
// Two flavors:
//   • postSse(path, body, handlers)  — POST + ReadableStream parse (used by /agent/chat,
//     /images/classify-stream); returns a controller with .cancel().
//   • eventSourceSse(path, handlers) — classic GET EventSource (used by /images/decode-stream).
//
// Handlers are { onEvent({event, data}), onToken(text), onError(err), onComplete() }.
// `event` is the SSE `event:` name when present, "message" otherwise.

import { BASE_URL } from "./client.js";

export function postSse(path, body, handlers = {}) {
  const ctrl = new AbortController();
  let done = false;

  fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: ctrl.signal,
  }).then(async (res) => {
    if (!res.ok) {
      handlers.onError?.(new Error(`SSE ${res.status}: ${await res.text()}`));
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let pendingEvent = null;

    const flush = (lines) => {
      // Drain a complete SSE record (lines belonging to one block).
      let dataParts = [];
      let event = "message";
      for (const line of lines) {
        if (!line) continue;
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataParts.push(line.slice(5).trimStart());
        // ignore id:, retry:, comments
      }
      const data = dataParts.join("\n");
      if (!data && event === "message") return;
      if (data === "[DONE]") { handlers.onComplete?.(); done = true; return; }
      let parsed = data;
      try { parsed = JSON.parse(data); } catch { /* keep as text */ }
      handlers.onEvent?.({ event, data: parsed, raw: data });
      if (event === "token" || event === "message") {
        if (typeof parsed === "string") handlers.onToken?.(parsed);
      }
    };

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      let sep;
      // SSE records are separated by a blank line ("\n\n").
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        flush(block.split("\n"));
        if (done) break;
      }
    }
    if (!done) handlers.onComplete?.();
  }).catch((err) => {
    if (err?.name === "AbortError") return;
    handlers.onError?.(err);
  });

  return { cancel: () => ctrl.abort() };
}

export function eventSourceSse(path, handlers = {}) {
  const es = new EventSource(`${BASE_URL}${path}`);
  const wrap = (eventName) => (e) => {
    if (e.data === "[DONE]") { handlers.onComplete?.(); es.close(); return; }
    let parsed = e.data;
    try { parsed = JSON.parse(e.data); } catch { /* keep */ }
    handlers.onEvent?.({ event: eventName, data: parsed, raw: e.data });
  };
  es.onmessage = wrap("message");
  // Backend names: progress, complete, error, summary.
  for (const ev of ["progress", "complete", "error", "summary", "token", "correction", "commit", "done"]) {
    es.addEventListener(ev, wrap(ev));
  }
  es.onerror = (e) => {
    handlers.onError?.(e);
    es.close();
  };
  return { cancel: () => es.close() };
}
