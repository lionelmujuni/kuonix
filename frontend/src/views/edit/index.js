// Edit view orchestrator (Phase 1–3).
//
// Responsibility: render the right inner state (empty | single | batch) based
// on state.mode and state.images.length, run per-file upload→decode→analyze
// pipelines, and forward stage events from the bus.
//
// Single mode:  ribbon → image stage → histogram strip
// Batch  mode:  group filter → contact sheet
// Both share the same upload pipeline; the only difference is the layout.

import { gsap } from "../../../node_modules/gsap/index.js";
import { enterView, isReduced, accentRipple, magneticHover, dropAreaPulse } from "../../motion.js";
import * as state from "../../state.js";

import { renderEmptyState, isRawFile } from "./empty-state.js";
import { createAnalysisRibbon } from "./ribbon.js";
import { createImageStage } from "./stage.js";
import { createHistogramStrip } from "./histogram.js";
import { createContactSheet } from "./contact-sheet.js";
import { createGroupFilter } from "./group-filter.js";
import { openSlidersPanel } from "../../components/sliders-panel/index.js";
import { createExifPanel } from "../../components/exif-panel/index.js";
import { createStyleProfilePanel } from "../../components/style-profile-panel/index.js";
import { createHistogramPanel } from "../../components/histogram-panel/index.js";

import { uploadJpeg, uploadRaw, getUrls } from "../../api/endpoints/images.js";
import { watchDecode, cancelDecodeWatches } from "../../api/decode-poller.js";
import { createAnalysisQueue } from "./analysis-queue.js";
import { toast } from "../../components/toast/index.js";
import { on, EVENTS } from "../../bus.js";

let ctx = null;
let outletRef = null;
let modeUnsub = null;
let imagesUnsub = null;

// Active layout (only one set is non-null at a time)
let layout = null;          // { kind: "empty"|"single"|"batch", ...refs }
let busUnsubs = [];

let analysisQueue = null;   // concurrent decode→analyze scheduler (created on mount)

function unbindBus() {
  for (const off of busUnsubs) { try { off(); } catch {} }
  busUnsubs = [];
}

// ---------------------------------------------------------------------------

export function mount(outlet) {
  outletRef = outlet;
  outlet.innerHTML = "";

  // One scheduler for the whole edit session — shared by the initial drop and
  // any later "add more", so a second batch streams into the same worker pool.
  analysisQueue = createAnalysisQueue({
    onItemStart: ({ path }) => reportProgress(path, "analyzing", 0.85, "Reading exposure, color, noise…"),
    onResult: onAnalysisResult,
    onProgress: updateBatchBanner,
  });

  const view = document.createElement("section");
  view.className = "view edit-view";
  view.dataset.view = "edit";
  outlet.appendChild(view);

  renderForState(view);
  bindStageBus();

  // Re-render when mode flips (Single ↔ Batch).
  modeUnsub = state.on("mode", () => renderForState(view));

  // Re-render when transitioning between empty and populated.
  imagesUnsub = state.on("images", (images) => {
    const populated = images.length > 0;
    const wantsEmpty = !populated;
    const isEmpty = layout?.kind === "empty";
    if (wantsEmpty !== isEmpty) renderForState(view);
  });

  ctx = enterView(outlet);
}

export function unmount() {
  cancelDecodeWatches();
  analysisQueue?.cancel();
  analysisQueue = null;
  unbindBus();
  modeUnsub?.(); modeUnsub = null;
  imagesUnsub?.(); imagesUnsub = null;
  destroyLayout();
  ctx?.revert?.();
  ctx = null;
  outletRef = null;
}

function destroyLayout() {
  if (!layout) return;
  layout.ribbon?.destroy?.();
  layout.hist?.destroy?.();
  layout.histogramPanel?.destroy?.();
  layout.exifPanel?.destroy?.();
  layout.styleProfilePanel?.destroy?.();
  layout.contactUnsub?.();
  layout.groupFilter?.destroy?.();
  layout.activeUnsub?.();
  layout.issuesUnsub?.();
  layout.featuresUnsub?.();
  layout.stateUnsub?.();
  layout.urlUnsub?.();
  layout.adjustUnmagnet?.();
  layout = null;
}

// ---- Render dispatch ---------------------------------------------------

function renderForState(view) {
  destroyLayout();
  view.innerHTML = "";

  const images = state.get("images");
  if (!images.length) {
    mountEmpty(view);
    return;
  }
  if (state.get("mode") === "batch") {
    mountBatch(view);
  } else {
    mountSingle(view);
  }
}

// ---- Empty state -------------------------------------------------------

function mountEmpty(view) {
  const node = renderEmptyState(handleFiles, { mode: state.get("mode") });
  view.appendChild(node);
  layout = { kind: "empty" };
}

// ---- Single mode -------------------------------------------------------

function mountSingle(view) {
  const wrap = document.createElement("div");
  wrap.className = "edit-working";
  view.appendChild(wrap);

  const ribbon = createAnalysisRibbon();
  ribbon.mount(wrap);

  const stage = createImageStage();
  wrap.appendChild(stage.el);

  // Floating "Adjust" pill on the stage — direct-manipulation entry point
  // that complements the agent rail. Magnetic hover for that creative-site
  // signature.
  const adjustBtn = document.createElement("button");
  adjustBtn.className = "stage-adjust-btn";
  adjustBtn.type = "button";
  adjustBtn.innerHTML = `<i class="bi bi-sliders2-vertical"></i><span>Adjust</span>`;
  adjustBtn.title = "Open direct controls";
  adjustBtn.addEventListener("click", () => openSlidersPanel());
  stage.el.appendChild(adjustBtn);
  const unmagnet = magneticHover(adjustBtn, { strength: 0.3, max: 8 });

  const hist = createHistogramStrip();
  hist.attach(wrap);

  // OpenCV-backed histogram dropdown (multi-channel + contextual). Sits with the
  // other collapsible side panels.
  const histogramPanel = createHistogramPanel();
  wrap.appendChild(histogramPanel.el);
  histogramPanel.bind();

  let exifPanel = null;
  if (window.__kuonixConfig?.modules?.cameraFeedback) {
    exifPanel = createExifPanel();
    wrap.appendChild(exifPanel.el);
    exifPanel.bind();
  }

  let styleProfilePanel = null;
  if (window.__kuonixConfig?.modules?.styleProfiles) {
    styleProfilePanel = createStyleProfilePanel();
    wrap.appendChild(styleProfilePanel.el);
    styleProfilePanel.bind();
  }

  layout = { kind: "single", ribbon, stage, hist, histogramPanel, adjustBtn, adjustUnmagnet: unmagnet, exifPanel, styleProfilePanel };

  if (!isReduced) {
    gsap.from([stage.el, hist.el], {
      opacity: 0, y: 12, duration: 0.4, ease: "expo.out", stagger: 0.06,
      clearProps: "transform",
    });
  }

  const url = state.get("currentImageUrl");
  if (url) {
    stage.setImage(url);
    hist.updateFromImageSrc(url);
  } else {
    stage.setPlaceholder("Loading…");
  }
  if (state.get("currentFeatures")) hist.setMetrics(state.get("currentFeatures"));
  const issues = state.get("currentIssues");
  const st = state.get("analysisState");
  if (st === "ready") ribbon.setIssues(issues || []);
  else if (st === "error") ribbon.setError("Analysis failed.");
  else ribbon.setStatus({ kind: st || "info", text: humanState(st), progress: progressFor(st) });

  // Re-render histogram & ribbon when the active image changes.
  layout.activeUnsub = state.on("activeIndex", () => {
    const u = state.get("currentImageUrl");
    if (u) { stage.setImage(u); hist.updateFromImageSrc(u); }
    if (state.get("currentFeatures")) hist.setMetrics(state.get("currentFeatures"));
    const newIssues = state.get("currentIssues");
    if (state.get("analysisState") === "ready") ribbon.setIssues(newIssues || []);
  });
  layout.issuesUnsub = state.on("currentIssues", (newIssues) => {
    if (state.get("analysisState") === "ready") ribbon.setIssues(newIssues || []);
  });
  layout.featuresUnsub = state.on("currentFeatures", (f) => hist.setMetrics(f || {}));
  layout.stateUnsub = state.on("analysisState", (s) => {
    if (s === "ready") ribbon.setIssues(state.get("currentIssues") || []);
    else if (s === "error") ribbon.setError("Analysis failed.");
    else ribbon.setStatus({ kind: s, text: humanState(s), progress: progressFor(s) });
  });
  // Belt-and-suspenders — any URL change (including in-place renameImage)
  // updates the stage. Tracks what the stage was last told to show; the bus
  // handler updates this same ref when it pushes a src directly, so this
  // listener won't double-crossfade preview flows.
  layout._stageSrcSetter = (s) => { layout._stageSrc = s; };
  layout._stageSrc = url || null;
  layout.urlUnsub = state.on("currentImageUrl", (u) => {
    if (!u || u === layout._stageSrc) return;
    layout._stageSrc = u;
    stage.setImage(u);
    hist.updateFromImageSrc(u);
  });
}

// ---- Batch mode --------------------------------------------------------

function mountBatch(view) {
  const wrap = document.createElement("div");
  wrap.className = "edit-batch";
  view.appendChild(wrap);

  const groupFilter = createGroupFilter();
  wrap.appendChild(groupFilter.el);

  const banner = document.createElement("div");
  banner.className = "batch-banner";
  banner.hidden = true;     // shown only during a batch agent run (Phase 3 hook)
  banner.innerHTML = `
    <span><i class="bi bi-stars"></i> Batch run</span>
    <span class="batch-banner__count" data-count></span>
    <div class="batch-banner__progress"><div class="batch-banner__bar" data-bar></div></div>
  `;
  wrap.appendChild(banner);

  const sheet = createContactSheet({
    onAddMore: () => promptForMoreFiles(),
  });
  wrap.appendChild(sheet.el);
  sheet.render();
  const contactUnsub = sheet.bind();

  // Drag-drop zone for adding more files when the batch view is populated.
  const dropOverlay = document.createElement("div");
  dropOverlay.setAttribute("aria-hidden", "true");
  dropOverlay.style.cssText = [
    "position:absolute;inset:0;z-index:20;display:none",
    "align-items:center;justify-content:center;gap:10px",
    "background:rgba(0,0,0,0.55);font-size:1.05rem;color:#fff",
    "pointer-events:none;border-radius:var(--radius-lg,12px)",
    "backdrop-filter:blur(4px);letter-spacing:.01em",
  ].join(";");
  dropOverlay.innerHTML = `<i class="bi bi-images" style="font-size:1.6rem"></i><span>Drop to add images</span>`;
  wrap.style.position = "relative";
  wrap.appendChild(dropOverlay);

  let batchDragDepth = 0;
  const setBatchDragOver = (on) => {
    wrap.classList.toggle("is-dragover", on);
    dropOverlay.style.display = on ? "flex" : "none";
    dropAreaPulse(wrap, on);
  };
  wrap.addEventListener("dragenter", (e) => {
    e.preventDefault();
    batchDragDepth++;
    if (batchDragDepth === 1) setBatchDragOver(true);
  });
  wrap.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  wrap.addEventListener("dragleave", () => {
    batchDragDepth = Math.max(0, batchDragDepth - 1);
    if (batchDragDepth === 0) setBatchDragOver(false);
  });
  wrap.addEventListener("drop", (e) => {
    e.preventDefault();
    batchDragDepth = 0;
    setBatchDragOver(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length) handleFiles(dropped);
  });

  layout = { kind: "batch", groupFilter, sheet, banner, contactUnsub };

  // If a batch is already analysing when this view (re)mounts, show its progress.
  if (analysisQueue) updateBatchBanner(analysisQueue.stats());

  if (!isReduced) {
    gsap.from([groupFilter.el, sheet.el], {
      opacity: 0, y: 8, duration: 0.35, ease: "expo.out", stagger: 0.06,
      clearProps: "transform",
    });
  }
}

// ---- Bus wiring (stage events from the agent rail) ---------------------

function bindStageBus() {
  unbindBus();

  busUnsubs.push(on(EVENTS.STAGE_SET_IMAGE, async ({ src }) => {
    if (!src) return;
    const path = state.get("currentImagePath");
    if (layout?.kind === "single" && layout.stage) {
      // Mark the stage's src BEFORE updating state — the urlUnsub listener
      // will see them equal and skip its own crossfade.
      if (layout._stageSrcSetter) layout._stageSrcSetter(src);
      await layout.stage.setImage(src);
      layout.hist?.updateFromImageSrc?.(src);
    }
    if (path) state.updateImage(path, { url: src });
  }));

  busUnsubs.push(on(EVENTS.STAGE_RIPPLE, () => {
    if (layout?.kind === "single" && layout.stage?.el) {
      layout.stage.el.classList.add("image-stage--ripple");
      accentRipple(layout.stage.el);
    }
  }));

  busUnsubs.push(on(EVENTS.STAGE_RESTORE, async ({ src, path }) => {
    if (path) state.updateImage(path, { url: src || undefined });
    if (path) state.setActiveByPath(path);
    if (layout?.kind === "single" && layout.stage && src) {
      await layout.stage.setImage(src);
      layout.hist?.updateFromImageSrc?.(src);
    }
  }));
}

// ---- File pipeline -----------------------------------------------------

async function handleFiles(files) {
  const arr = Array.from(files || []).filter(Boolean);
  if (!arr.length) return;

  const hasImages = state.get("images").length > 0;

  if (!hasImages) {
    // Auto-detect mode: 1 file → single, 2+ files → batch.
    const targetMode = arr.length === 1 ? "single" : "batch";
    if (state.get("mode") !== targetMode) state.set("mode", targetMode);
  }

  // Each file uploads + decodes independently and enqueues itself for analysis
  // the moment it is ready. The analysis pool drains the queue concurrently, so
  // decoding and analysis overlap — fast files don't wait on the slowest RAW.
  if (state.get("mode") === "single") {
    state.clearImages();
    await processFile(arr[0]);
  } else {
    await Promise.all(arr.map((f) => processFile(f)));
  }
}

async function processFile(file) {
  // The "logical slot" for this file before we know its backend path. We use a
  // tmp key so the contact card can render its uploading state immediately,
  // then rekey to the real path once upload returns.
  const tmpPath = `__pending__/${file.name}_${Math.random().toString(36).slice(2, 8)}`;
  // Track the live path so the catch block can mark the correct slot as errored
  // even after one or more in-place renames (tmpPath → previewPath → fullPath).
  let activePath = tmpPath;
  const setActivePath = (p) => { activePath = p; };

  state.addImage({
    path: tmpPath,
    url: null,
    name: file.name,
    state: "uploading",
    issues: [],
    features: null,
    selected: true,
  });

  try {
    // Each pipeline enqueues the decoded path for analysis as soon as it's ready.
    if (isRawFile(file)) {
      await pipelineRaw(file, tmpPath, setActivePath);
    } else {
      await pipelineJpegLike(file, tmpPath, setActivePath);
    }
  } catch (err) {
    console.error(err);
    state.updateImage(activePath, { state: "error" });
    toast.error(err?.message || "Upload failed.");
    if (layout?.kind === "single") layout.ribbon?.setError("Upload failed.");
  }
}

async function pipelineJpegLike(file, tmpPath, setActivePath) {
  const res = await uploadJpeg([file]);
  const path = res?.paths?.[0];
  if (!path) throw new Error("Upload returned no path.");

  // Rekey the slot from tmp → real path. In-place rename avoids the empty→single
  // layout flicker that remove+add would trigger.
  state.renameImage(tmpPath, path, { state: "uploading", exif: res.exifList?.[0] ?? null });
  setActivePath?.(path);

  reportProgress(path, "uploading", 0.5, `Loading ${file.name}…`);

  const url = await fetchDataUrl(path);
  if (!url) throw new Error("Could not fetch image.");
  // Pre-mark _stageSrc so urlUnsub deduplication skips the reactive call —
  // prevents two competing setImage calls on the same element.
  if (layout?.kind === "single" && layout._stageSrcSetter) layout._stageSrcSetter(url);
  state.updateImage(path, { url });

  if (layout?.kind === "single") {
    await layout.stage?.setImage?.(url);
    layout.hist?.updateFromImageSrc?.(url);
  }

  analysisQueue?.enqueue(path);
}

async function pipelineRaw(file, tmpPath, setActivePath) {
  const res = await uploadRaw([file]);
  const info = res?.images?.[0];
  if (!info?.previewPath) throw new Error("RAW upload returned no preview.");

  // Use the previewPath as the immediate identity. We'll swap to fullPath when
  // decode completes. In-place rename avoids layout flicker.
  state.renameImage(tmpPath, info.previewPath, {
    taskId: info.taskId, state: "decoding", exif: info.exif ?? null,
  });
  setActivePath?.(info.previewPath);

  reportProgress(info.previewPath, "decoding", 0.15, "Decoding RAW…");

  const previewUrl = await fetchDataUrl(info.previewPath);
  if (previewUrl) {
    if (layout?.kind === "single" && layout._stageSrcSetter) layout._stageSrcSetter(previewUrl);
    state.updateImage(info.previewPath, { url: previewUrl });
    if (layout?.kind === "single") {
      await layout.stage?.setImage?.(previewUrl);
      layout.hist?.updateFromImageSrc?.(previewUrl);
    }
  }

  let activeFinalPath = info.previewPath;

  // Shared poller — one short-lived request per second covers every in-flight
  // decode, so a long decode-queue wait can't expire a connection or starve
  // the classify/upload fetches (Chromium allows only 6 sockets per origin).
  const ev = await watchDecode(info.taskId, {
    onProgress: (e) => {
      const pct = (e?.progress ?? 0) / 100;
      reportProgress(activeFinalPath, "decoding", 0.15 + pct * 0.5, "Decoding RAW…");
    },
  });

  if (ev?.status === "complete") {
    const fullPath = ev.fullPath;
    if (fullPath && fullPath !== activeFinalPath) {
      // Rekey the slot to the full-resolution path in place.
      state.renameImage(activeFinalPath, fullPath, { state: "decoding" });
      activeFinalPath = fullPath;
      setActivePath?.(fullPath);

      const fullUrl = await fetchDataUrl(fullPath);
      if (fullUrl) {
        if (layout?.kind === "single" && layout._stageSrcSetter) layout._stageSrcSetter(fullUrl);
        state.updateImage(fullPath, { url: fullUrl });
        if (layout?.kind === "single") {
          await layout.stage?.setImage?.(fullUrl);
          layout.hist?.updateFromImageSrc?.(fullUrl);
        }
      }
    }
  } else if (ev?.status === "error") {
    toast.warning("Decode error: " + (ev.error || "unknown"));
  }
  // "missing" / "cancelled" fall through: analyse whatever we have (preview).

  // Decoded (full-res, or preview if the full decode failed) → ready to analyse.
  analysisQueue?.enqueue(activeFinalPath);
}

// Per-image analysis result from the queue. State is already patched by the
// queue; here we only drive the single-mode ribbon/histogram for the active
// image and surface failures.
function onAnalysisResult({ path, ok, error }) {
  if (layout?.kind === "single" && state.get("currentImagePath") === path) {
    const img = state.get("images").find((r) => r.path === path);
    if (ok) {
      layout.ribbon?.setIssues?.(img?.issues || []);
      layout.hist?.setMetrics?.(img?.features || {});
    } else {
      layout.ribbon?.setError?.(error?.name === "AbortError" ? "Analysis timed out." : "Analysis failed.");
    }
  }
  if (!ok && error?.name !== "AbortError") {
    // Keep it quiet for single failures in a large batch; a console note is enough.
    console.warn("analysis failed for", path, error);
  }
}

// Aggregate progress → the batch banner ("X / N analysed"). Hidden once idle.
function updateBatchBanner({ total, done, failed } = {}) {
  if (layout?.kind !== "batch" || !layout.banner) return;
  const banner = layout.banner;
  const processed = (done || 0) + (failed || 0);
  const remaining = (total || 0) - processed;
  banner.hidden = remaining <= 0;
  const label = banner.querySelector(".batch-banner__label") || banner.querySelector("span");
  if (label) label.innerHTML = `<i class="bi bi-stars"></i> Analyzing images`;
  const countEl = banner.querySelector("[data-count]");
  if (countEl) countEl.textContent = total ? `${processed} / ${total} analyzed` : "";
  const barEl = banner.querySelector("[data-bar]");
  if (barEl) barEl.style.width = total ? `${Math.round((processed / total) * 100)}%` : "0%";
}

function reportProgress(path, kind, progress, text) {
  if (layout?.kind === "batch") {
    // Drive the contact-card progress bar directly — no state mutation needed,
    // avoids full sheet re-renders on every decode/analyze progress tick.
    layout.sheet?.updateProgress?.(path, progress);
    return;
  }
  if (layout?.kind !== "single") return;
  if (state.get("currentImagePath") !== path) return;
  layout.ribbon?.setStatus?.({ kind, text, progress });
}

function humanState(s) {
  switch (s) {
    case "uploading": return "Uploading…";
    case "decoding":  return "Decoding RAW…";
    case "queued":    return "Queued…";
    case "analyzing": return "Analyzing…";
    case "ready":     return "Ready.";
    case "error":     return "Error.";
    default:          return "Ready.";
  }
}
function progressFor(s) {
  return ({ uploading: 0.3, decoding: 0.5, analyzing: 0.85, ready: 1, error: 1 })[s] ?? null;
}

async function fetchDataUrl(path) {
  try {
    const res = await getUrls([path]);
    return res?.images?.[0]?.dataUrl || null;
  } catch (err) {
    console.error("getUrls", err);
    return null;
  }
}

// ---- Add-more (batch only) --------------------------------------------

function promptForMoreFiles() {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff,.cr2,.cr3,.nef,.arw,.dng,.raf,.orf,.raw,.rw2,.srw,.pef";
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    input.remove();
    if (files.length) handleFiles(files);
  });
  input.click();
}
