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
import { enterView, isReduced, accentRipple, magneticHover } from "../../motion.js";
import * as state from "../../state.js";

import { renderEmptyState, isRawFile } from "./empty-state.js";
import { createAnalysisRibbon } from "./ribbon.js";
import { createImageStage } from "./stage.js";
import { createHistogramStrip } from "./histogram.js";
import { createContactSheet } from "./contact-sheet.js";
import { createGroupFilter } from "./group-filter.js";
import { openSlidersPanel } from "../../components/sliders-panel/index.js";

import { uploadJpeg, uploadRaw, decodeStream, classifyStream, getUrls } from "../../api/endpoints/images.js";
import { toast } from "../../components/toast/index.js";
import { on, EVENTS } from "../../bus.js";

let ctx = null;
let outletRef = null;
let modeUnsub = null;
let imagesUnsub = null;

// Active layout (only one set is non-null at a time)
let layout = null;          // { kind: "empty"|"single"|"batch", ...refs }
let busUnsubs = [];

let activeHandles = [];     // [{ cancel() }] in-flight per-file SSE handles

function trackHandle(h) { if (h) activeHandles.push(h); return h; }
function killHandles() {
  for (const h of activeHandles) { try { h.cancel?.(); } catch {} }
  activeHandles = [];
}
function unbindBus() {
  for (const off of busUnsubs) { try { off(); } catch {} }
  busUnsubs = [];
}

// ---------------------------------------------------------------------------

export function mount(outlet) {
  outletRef = outlet;
  outlet.innerHTML = "";

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
  killHandles();
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

  layout = { kind: "single", ribbon, stage, hist, adjustBtn, adjustUnmagnet: unmagnet };

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

  layout = { kind: "batch", groupFilter, sheet, banner, contactUnsub };

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

  const mode = state.get("mode");
  if (mode === "single") {
    if (arr.length > 1) toast.info(`Single mode: keeping the first of ${arr.length} files.`);
    state.clearImages();
    await processFile(arr[0]);
  } else {
    // Batch — process every dropped file in parallel pipelines.
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
  state.renameImage(tmpPath, path, { state: "uploading" });
  setActivePath?.(path);

  reportProgress(path, "uploading", 0.5, `Loading ${file.name}…`);

  const url = await fetchDataUrl(path);
  if (!url) throw new Error("Could not fetch image.");
  state.updateImage(path, { url });

  if (layout?.kind === "single") {
    await layout.stage?.setImage?.(url);
    layout.hist?.updateFromImageSrc?.(url);
  }

  await analyze(path);
}

async function pipelineRaw(file, tmpPath, setActivePath) {
  const res = await uploadRaw([file]);
  const info = res?.images?.[0];
  if (!info?.previewPath) throw new Error("RAW upload returned no preview.");

  // Use the previewPath as the immediate identity. We'll swap to fullPath when
  // decode completes. In-place rename avoids layout flicker.
  state.renameImage(tmpPath, info.previewPath, {
    taskId: info.taskId, state: "decoding",
  });
  setActivePath?.(info.previewPath);

  reportProgress(info.previewPath, "decoding", 0.15, "Decoding RAW…");

  const previewUrl = await fetchDataUrl(info.previewPath);
  if (previewUrl) {
    state.updateImage(info.previewPath, { url: previewUrl });
    if (layout?.kind === "single") {
      await layout.stage?.setImage?.(previewUrl);
      layout.hist?.updateFromImageSrc?.(previewUrl);
    }
  }

  let activeFinalPath = info.previewPath;

  await new Promise((resolve) => {
    let resolved = false;
    const finish = () => { if (!resolved) { resolved = true; resolve(); } };
    const handle = trackHandle(decodeStream([info.taskId], {
      onEvent: async ({ event, data }) => {
        if (event === "progress") {
          const pct = (data?.progress ?? 0) / 100;
          reportProgress(activeFinalPath, "decoding", 0.15 + pct * 0.5, "Decoding RAW…");
        } else if (event === "complete") {
          const fullPath = data?.fullPath;
          if (fullPath && fullPath !== activeFinalPath) {
            // Rekey the slot to the full-resolution path in place.
            state.renameImage(activeFinalPath, fullPath, { state: "decoding" });
            activeFinalPath = fullPath;
            setActivePath?.(fullPath);

            const fullUrl = await fetchDataUrl(fullPath);
            if (fullUrl) {
              state.updateImage(fullPath, { url: fullUrl });
              if (layout?.kind === "single") {
                await layout.stage?.setImage?.(fullUrl);
                layout.hist?.updateFromImageSrc?.(fullUrl);
              }
            }
          }
        } else if (event === "summary" || event === "done") {
          handle.cancel?.();
          finish();
        } else if (event === "error") {
          toast.warning("Decode error: " + (data?.error || "unknown"));
        }
      },
      onError: (err) => { console.error("decode SSE", err); finish(); },
      onComplete: finish,
    }));
  });

  await analyze(activeFinalPath);
}

async function analyze(path) {
  state.updateImage(path, { state: "analyzing" });
  reportProgress(path, "analyzing", 0.78, "Analyzing…");

  await new Promise((resolve) => {
    let resolved = false;
    const finish = () => { if (!resolved) { resolved = true; resolve(); } };
    const handle = trackHandle(classifyStream([path], {
      onEvent: ({ event, data }) => {
        if (event === "progress") {
          const pct = (data?.percentage ?? 0) / 100;
          reportProgress(path, "analyzing", 0.78 + pct * 0.18, "Reading exposure, color, noise…");
        } else if (event === "complete") {
          const result = Array.isArray(data?.results) ? data.results[0] : null;
          state.updateImage(path, {
            state: "ready",
            issues: result?.issues || [],
            features: result?.features || null,
          });
          if (layout?.kind === "single") {
            layout.ribbon?.setIssues?.(result?.issues || []);
            layout.hist?.setMetrics?.(result?.features || {});
          }
          handle.cancel?.();
          finish();
        } else if (event === "error") {
          state.updateImage(path, { state: "error" });
          if (layout?.kind === "single") layout.ribbon?.setError?.("Analysis failed.");
          finish();
        }
      },
      onError: (err) => {
        console.error("classify SSE", err);
        state.updateImage(path, { state: "error" });
        if (layout?.kind === "single") layout.ribbon?.setError?.("Analysis failed.");
        finish();
      },
      onComplete: () => {
        // Stream ended without a 'complete' or 'error' event (backend error or
        // silent timeout). Clear the spinner so the card doesn't hang forever.
        const img = state.get("images").find((r) => r.path === path);
        if (img?.state === "analyzing") {
          state.updateImage(path, { state: "error" });
          if (layout?.kind === "single") layout.ribbon?.setError?.("Analysis failed.");
          toast.error("Analysis failed — try again.");
        }
        finish();
      },
    }, { enableSkin: true }));
  });
}

function reportProgress(path, kind, progress, text) {
  // In single mode the ribbon shows progress for the active image.
  if (layout?.kind !== "single") return;
  if (state.get("currentImagePath") !== path) return;
  layout.ribbon?.setStatus?.({ kind, text, progress });
}

function humanState(s) {
  switch (s) {
    case "uploading": return "Uploading…";
    case "decoding":  return "Decoding RAW…";
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
