// Shared decode-progress poller.
//
// One short-lived GET per second reports every in-flight decode, replacing
// the per-image EventSource on /images/decode-stream. Chromium caps HTTP/1.1
// connections at 6 per origin; long-lived per-image streams held those slots
// for the full decode duration and starved classify/upload fetches into
// their timeouts during batches. Polling also has no fixed lifetime, so an
// image can wait in the server's decode queue indefinitely without anything
// expiring — waiting is not failure.

import { apiJson } from "./client.js";

const POLL_MS = 1000;
const MAX_IDS_PER_POLL = 100; // server rejects larger task lists

const watchers = new Map(); // taskId → { resolve, onProgress }
let timer = null;
let inFlight = false;

// Resolves with the terminal DecodeProgressEvent for the task:
// { status: "complete", fullPath, ... } | { status: "error", error } |
// { status: "missing" } | { status: "cancelled" } (local unmount).
export function watchDecode(taskId, { onProgress } = {}) {
  return new Promise((resolve) => {
    watchers.set(taskId, { resolve, onProgress });
    if (!timer) timer = setInterval(tick, POLL_MS);
  });
}

// View unmount: resolve everything as cancelled and stop polling. Server-side
// decode tasks keep running and stay pollable if the view remounts.
export function cancelDecodeWatches() {
  for (const [taskId, w] of watchers) w.resolve({ taskId, status: "cancelled" });
  watchers.clear();
  stopIfIdle();
}

function stopIfIdle() {
  if (watchers.size === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function tick() {
  if (inFlight || watchers.size === 0) return;
  inFlight = true;
  try {
    const ids = [...watchers.keys()];
    for (let i = 0; i < ids.length; i += MAX_IDS_PER_POLL) {
      const qs = ids.slice(i, i + MAX_IDS_PER_POLL)
        .map((id) => `taskIds=${encodeURIComponent(id)}`)
        .join("&");
      const events = await apiJson(`/images/decode-status?${qs}`);
      for (const ev of events || []) {
        const w = watchers.get(ev.taskId);
        if (!w) continue;
        if (ev.status === "complete" || ev.status === "error" || ev.status === "missing") {
          watchers.delete(ev.taskId);
          w.resolve(ev);
        } else {
          w.onProgress?.(ev);
        }
      }
    }
  } catch (err) {
    // Transient poll failure — decode state lives server-side, keep polling.
    console.warn("decode poll failed", err);
  } finally {
    inFlight = false;
    stopIfIdle();
  }
}
