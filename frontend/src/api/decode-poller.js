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

// A status check should be near-instant. Bounding it matters more than the
// value: `inFlight` below is only cleared once a poll settles, so one request
// that never returned used to wedge the poller for the rest of the session —
// every watcher then waited forever and its image sat at "decoding" with no
// error and no analysis.
const POLL_TIMEOUT_MS = 10_000;

// Waiting is not failure — an image can sit in the server's decode queue for a
// long time legitimately. But if polls fail *continuously* the server side is
// unreachable, and hanging silently is the worst outcome: give up and let
// callers fall back to analysing the preview they already have.
const MAX_CONSECUTIVE_FAILURES = 30;

const watchers = new Map(); // taskId → { resolve, onProgress }
let timer = null;
let inFlight = false;
let consecutiveFailures = 0;

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
  consecutiveFailures = 0;
  stopIfIdle();
}

// Resolve every watcher with the same terminal status and stop polling. Used
// when the poll itself is failing repeatedly — the alternative is leaving the
// pipeline awaiting a promise that will never settle.
function resolveAll(status, error) {
  for (const [taskId, w] of watchers) w.resolve({ taskId, status, error });
  watchers.clear();
  consecutiveFailures = 0;
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
      const events = await apiJson(`/images/decode-status?${qs}`, { timeoutMs: POLL_TIMEOUT_MS });
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
    consecutiveFailures = 0;
  } catch (err) {
    // Transient poll failure — decode state lives server-side, keep polling.
    consecutiveFailures += 1;
    console.warn(`decode poll failed (${consecutiveFailures})`, err);
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error("decode polling gave up after repeated failures");
      resolveAll("error", "Decode status unavailable.");
    }
  } finally {
    inFlight = false;
    stopIfIdle();
  }
}
