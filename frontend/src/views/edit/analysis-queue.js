// Concurrent analysis scheduler.
//
// A decoded image is enqueued the moment it is ready — not after the whole
// batch finishes decoding — and a bounded pool of workers drains the queue in
// parallel. This overlaps decoding and analysis and keeps several cores busy,
// instead of analysing one image at a time behind the slowest RAW decode.
//
// The per-image timeout starts when a worker *dispatches* the request, so an
// image sitting in the queue can never time out before its turn (the bug where
// later images in a big batch failed before they were ever computed).

import * as state from "../../state.js";
import { classify } from "../../api/endpoints/images.js";

// Match the backend's compute capacity without oversubscribing OpenCV's own
// internal threading: clamp logical cores to [2, 4].
const CONCURRENCY = Math.max(
  2,
  Math.min(4, (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4)
);

// Per-image analysis ceiling. Generous now that compute is histogram-fast; the
// timer only runs while the request is actually in flight.
const ANALYSIS_TIMEOUT_MS = 60_000;

export function createAnalysisQueue({ onItemStart, onResult, onProgress, enableSkin = true } = {}) {
  const pending = [];               // FIFO of paths awaiting a worker
  const inFlight = new Map();       // path → AbortController
  let total = 0, done = 0, failed = 0, active = 0, workers = 0;
  let drain = null, resolveDrain = null;

  function emitProgress() {
    onProgress?.({ total, done, failed, active, remaining: total - done - failed });
  }

  function enqueue(path) {
    if (!path) return;
    total += 1;
    pending.push(path);
    state.updateImage(path, { state: "queued" });
    if (!drain) drain = new Promise((r) => (resolveDrain = r));
    emitProgress();
    pump();
  }

  function pump() {
    while (workers < CONCURRENCY && pending.length) {
      workers += 1;
      runWorker();
    }
  }

  async function runWorker() {
    try {
      while (pending.length) {
        await analyzeOne(pending.shift());
      }
    } finally {
      workers -= 1;
      settleIfIdle();
    }
  }

  async function analyzeOne(path) {
    // The slot may have been removed (or renamed) while it waited in the queue.
    if (!state.get("images").some((r) => r.path === path)) {
      done += 1;
      emitProgress();
      return;
    }

    active += 1;
    state.updateImage(path, { state: "analyzing" });
    onItemStart?.({ path });
    emitProgress();

    const controller = new AbortController();
    inFlight.set(path, controller);
    const timer = setTimeout(() => controller.abort("timeout"), ANALYSIS_TIMEOUT_MS);

    try {
      const res = await classify([path], { enableSkin, signal: controller.signal });
      const r = Array.isArray(res?.results) ? res.results[0] : null;
      if (!r) throw new Error(res?.message || "No analysis result");
      state.updateImage(path, { state: "ready", issues: r.issues || [], features: r.features || null });
      done += 1;
      onResult?.({ path, ok: true, result: r });
    } catch (err) {
      failed += 1;
      state.updateImage(path, { state: "error" });
      onResult?.({ path, ok: false, error: err });
    } finally {
      clearTimeout(timer);
      inFlight.delete(path);
      active -= 1;
      emitProgress();
    }
  }

  function settleIfIdle() {
    if (workers === 0 && pending.length === 0) {
      resolveDrain?.();
      drain = null;
      resolveDrain = null;
      // Reset counters once fully idle so the next batch reports fresh totals.
      total = done = failed = 0;
      emitProgress();
    }
  }

  // Resolves when the queue has fully drained (or immediately if already idle).
  function whenDrained() {
    return drain || Promise.resolve();
  }

  // Abort everything in flight and discard the backlog (used on view unmount).
  function cancel() {
    pending.length = 0;
    for (const c of inFlight.values()) { try { c.abort("cancelled"); } catch {} }
    inFlight.clear();
  }

  function stats() {
    return { total, done, failed, active, remaining: total - done - failed };
  }

  return { enqueue, whenDrained, cancel, stats, concurrency: CONCURRENCY };
}
