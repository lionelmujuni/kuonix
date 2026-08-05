// Histogram panel — collapsible OpenCV histogram readout, mounted inside the
// Adjust (sliders) panel so the curves sit next to the editing algorithms and
// update as edits are previewed and committed.
//
// Renders OpenCV-computed histograms (fetched from the backend) instead of a
// browser-side luminance estimate, so the curves match what the analysis /
// correction pipeline actually sees. The core trio (Luma, RGB, Saturation) is
// always available; contextual channels (Hue, Haze) appear only when the active
// image carries a matching issue.
//
// Hybrid real-time: while an edit is being previewed the active image's data URL
// changes faster than a round-trip — we redraw quick client-side estimates for
// every channel live, then reconcile to the accurate OpenCV data once the edit
// is applied (the active path changes) and we refetch. Because previews AND the
// Compare baseline swap both ride STAGE_SET_IMAGE, the histogram tracks whatever
// the stage shows — drag a slider and the curve moves, hold Compare and it
// snaps back to the original.
//
// setChannel(id) lets the Adjust panel pin the channel its active algorithm
// manipulates (saturation methods → Sat, tone → Luma, dehaze → Haze, …).

import { gsap } from "../../../node_modules/gsap/index.js";
import { isReduced } from "../../motion.js";
import * as state from "../../state.js";
import { on, EVENTS } from "../../bus.js";
import { getHistogram } from "../../api/endpoints/images.js";

const LS_KEY = "kuonix.histogramPanelOpen";
const BINS = 128;

// Channel colours drawn on the canvas. Luma uses the live theme accent; R/G/B
// and Sat reuse the app's accent presets so they stay on-palette.
const CH = {
  red:   "227, 87, 71",
  green: "76, 175, 80",
  blue:  "59, 130, 246",
  sat:   "139, 92, 246",
};

// Which issues unlock which contextual channel.
const HUE_ISSUE = /^(ColorCast_|Oversaturated_|SkinTone_)/;
const HAZE_ISSUE = /^Hazy$/;

const CHANNEL_LABELS = { luma: "Luma", rgb: "RGB", sat: "Sat", hue: "Hue", haze: "Haze" };

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    .histogram-panel {
      border-top: 1px solid var(--color-border); background: var(--color-surface);
      flex-shrink: 0;
    }
    .histogram-panel__toggle {
      width: 100%; display: flex; align-items: center; gap: 8px;
      padding: 8px 16px; background: transparent; border: 0;
      color: var(--color-text-secondary); font-size: var(--font-size-sm); font-weight: 500;
      cursor: pointer; text-align: left;
      transition: color var(--duration-fast) var(--ease-standard);
    }
    .histogram-panel__toggle:hover { color: var(--color-text); }
    .histogram-panel__toggle span { flex: 1; }
    .histogram-panel__chev { font-size: 10px; transition: transform var(--duration-normal) var(--ease-standard); }
    .histogram-panel__body { padding: 4px 16px 14px; }
    .histogram-panel__channels {
      display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap;
    }
    .histogram-panel__chan {
      font-size: var(--font-size-xs); font-weight: 500; line-height: 1;
      padding: 4px 9px; border-radius: var(--radius-full);
      background: transparent; color: var(--color-text-secondary);
      border: 1px solid var(--color-border); cursor: pointer;
      transition: all var(--duration-fast) var(--ease-standard);
    }
    .histogram-panel__chan:hover {
      color: var(--color-text);
      border-color: rgba(var(--accent-color-rgb), 0.4);
    }
    .histogram-panel__chan.is-active {
      color: var(--accent-color);
      background: rgba(var(--accent-color-rgb), 0.08);
      border-color: rgba(var(--accent-color-rgb), 0.3);
    }
    .histogram-panel__plot {
      position: relative; width: 100%; height: 96px;
      border-radius: var(--radius-base);
      background: rgba(var(--accent-color-rgb), 0.03);
      border: 1px solid var(--color-border);
      overflow: hidden;
    }
    .histogram-panel__canvas { display: block; width: 100%; height: 100%; }
    .histogram-panel__empty {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      font-size: var(--font-size-sm); color: var(--color-text-secondary); font-style: italic;
    }
    @media (prefers-color-scheme: dark) {
      .histogram-panel__plot { background: rgba(255,255,255,0.03); }
    }
    [data-color-scheme="dark"] .histogram-panel__plot { background: rgba(255,255,255,0.03); }
    [data-color-scheme="light"] .histogram-panel__plot { background: rgba(var(--accent-color-rgb), 0.03); }
  `;
  document.head.appendChild(s);
}

export function createHistogramPanel({ defaultOpen = false } = {}) {
  injectStyles();
  const root = document.createElement("div");
  root.className = "histogram-panel";

  const stored = localStorage.getItem(LS_KEY);
  let expanded = stored === null ? defaultOpen : stored === "true";
  let channel = "luma";
  let data = null;            // last OpenCV histogram payload
  let live = null;            // client-side estimates during live edits (all channels)
  let liveSeq = 0;            // invalidates stale in-flight estimates
  let unsubs = [];
  let busUnsubs = [];
  let fetchAbort = null;
  let fetchTimer = null;

  root.innerHTML = `
    <button class="histogram-panel__toggle" aria-expanded="${expanded}" aria-controls="histogram-panel-body">
      <i class="bi bi-bar-chart-line"></i>
      <span>Histogram</span>
      <i class="bi bi-chevron-down histogram-panel__chev"></i>
    </button>
    <div class="histogram-panel__body" id="histogram-panel-body" ${expanded ? "" : "hidden"}>
      <div class="histogram-panel__channels" role="tablist"></div>
      <div class="histogram-panel__plot">
        <canvas class="histogram-panel__canvas" width="600" height="192" aria-hidden="true"></canvas>
        <div class="histogram-panel__empty" data-empty hidden>No image.</div>
      </div>
    </div>
  `;

  const toggle  = root.querySelector(".histogram-panel__toggle");
  const body    = root.querySelector(".histogram-panel__body");
  const chev    = root.querySelector(".histogram-panel__chev");
  const chanRow = root.querySelector(".histogram-panel__channels");
  const canvas  = root.querySelector(".histogram-panel__canvas");
  const emptyEl = root.querySelector("[data-empty]");
  const ctx     = canvas.getContext("2d");

  function setExpanded(on) {
    expanded = on;
    toggle.setAttribute("aria-expanded", String(on));
    body.hidden = !on;
    chev.style.transform = on ? "rotate(180deg)" : "";
    localStorage.setItem(LS_KEY, String(on));
    if (on) refetch();   // only hit the backend while the panel is visible
  }
  toggle.addEventListener("click", () => setExpanded(!expanded));

  // ---- channel buttons --------------------------------------------------

  function activeIssues() {
    const path = state.get("currentImagePath");
    const img = path ? state.get("images").find((r) => r.path === path) : null;
    return Array.isArray(img?.issues) ? img.issues : [];
  }
  function wantsHue(issues)  { return issues.some((i) => HUE_ISSUE.test(i)); }
  function wantsHaze(issues) { return issues.some((i) => HAZE_ISSUE.test(i)); }

  function renderChannels() {
    const issues = activeIssues();
    const chans = [
      { id: "luma", label: "Luma" },
      { id: "rgb",  label: "RGB" },
      { id: "sat",  label: "Sat" },
    ];
    if (wantsHue(issues))  chans.push({ id: "hue",  label: "Hue" });
    if (wantsHaze(issues)) chans.push({ id: "haze", label: "Haze" });

    // A channel pinned by the active editing algorithm stays visible even
    // when no issue would surface it.
    if (!chans.some((c) => c.id === channel)) {
      if (CHANNEL_LABELS[channel]) chans.push({ id: channel, label: CHANNEL_LABELS[channel] });
      else channel = "luma";
    }

    chanRow.innerHTML = "";
    for (const c of chans) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "histogram-panel__chan" + (c.id === channel ? " is-active" : "");
      b.textContent = c.label;
      b.setAttribute("role", "tab");
      b.addEventListener("click", () => { channel = c.id; renderChannels(); draw(); });
      chanRow.appendChild(b);
    }
  }

  // ---- data fetch -------------------------------------------------------

  function refetch() {
    if (!expanded) return;
    const path = state.get("currentImagePath");
    if (!path) { data = null; draw(); return; }
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => doFetch(path), 150);
  }

  async function doFetch(path) {
    fetchAbort?.abort();
    fetchAbort = new AbortController();
    const advanced = wantsHue(activeIssues()) || wantsHaze(activeIssues())
      || channel === "hue" || channel === "haze";
    try {
      data = await getHistogram(path, { bins: BINS, advanced, signal: fetchAbort.signal });
      live = null;            // accurate data supersedes the live estimates
      liveSeq++;              // drop any estimate still decoding
      renderChannels();
      draw();
    } catch (err) {
      if (err?.name !== "AbortError") console.warn("histogram fetch", err);
    }
  }

  // Quick client-side estimates for live preview feedback (every channel).
  async function pushLive(src) {
    if (!expanded || !src) return;
    const seq = ++liveSeq;
    const est = await clientHistograms(src, BINS);
    if (est && seq === liveSeq) { live = est; draw(); }
  }

  // ---- drawing ----------------------------------------------------------

  function accentRgb() {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--accent-color-rgb");
    return (v || "59, 130, 246").trim();
  }

  function draw() {
    if (!ctx) return;   // jsdom / headless — no 2d context
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 300;
    const cssH = canvas.clientHeight || 96;
    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const hasData = !!(data || live);
    emptyEl.hidden = hasData;
    if (!hasData) return;

    // Live estimates win while an edit is being previewed; accurate OpenCV
    // data takes over once it lands (doFetch clears `live`).
    if (channel === "luma") {
      drawArea(ctx, cssW, cssH, live?.luma || data?.luma, accentRgb());
    } else if (channel === "rgb") {
      const src = live || data;
      drawOverlay(ctx, cssW, cssH, [
        { bins: src.red,   rgb: CH.red },
        { bins: src.green, rgb: CH.green },
        { bins: src.blue,  rgb: CH.blue },
      ]);
    } else if (channel === "sat") {
      drawArea(ctx, cssW, cssH, live?.saturation || data?.saturation, CH.sat);
    } else if (channel === "hue") {
      drawHue(ctx, cssW, cssH, live?.hue || data?.hue);
    } else if (channel === "haze") {
      drawArea(ctx, cssW, cssH, live?.darkChannel || data?.darkChannel, "150, 150, 150");
    }
  }

  // ---- state wiring -----------------------------------------------------

  function bind() {
    renderChannels();
    unsubs = [
      // New active image or applied edit (path changes) → accurate refetch.
      state.on("currentImagePath", () => { renderChannels(); refetch(); }),
      // Issues arriving may unlock contextual channels.
      state.on("currentIssues", () => { renderChannels(); refetch(); }),
      // Live preview during editing → quick luma estimate.
      state.on("currentImageUrl", (u) => pushLive(u)),
    ];
    busUnsubs = [
      on(EVENTS.STAGE_SET_IMAGE, ({ src }) => pushLive(src)),
    ];
    if (expanded) refetch();
  }

  function destroy() {
    clearTimeout(fetchTimer);
    fetchAbort?.abort();
    for (const u of unsubs) u();
    for (const u of busUnsubs) u();
    unsubs = []; busUnsubs = [];
    if (root.parentElement) root.parentElement.removeChild(root);
  }

  // Pin the channel the active editing algorithm manipulates.
  function setChannel(id) {
    if (!CHANNEL_LABELS[id] || id === channel) return;
    channel = id;
    renderChannels();
    if ((id === "hue" || id === "haze") && data && !data[id === "hue" ? "hue" : "darkChannel"]) {
      refetch();   // core-only payload lacks the advanced channels
    }
    draw();
  }

  return { el: root, bind, destroy, setChannel };
}

// ---- canvas primitives --------------------------------------------------

function normalize(bins, height) {
  const max = Math.max(1, ...bins);
  return bins.map((v) => (v / max) * (height - 6));
}

function drawArea(ctx, w, h, bins, rgb) {
  if (!bins || !bins.length) return;
  const heights = normalize(bins, h);
  const step = w / bins.length;
  const final = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(0, h);
    heights.forEach((bh, i) => ctx.lineTo(i * step + step / 2, h - bh - 2));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = `rgba(${rgb}, 0.55)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${rgb}, 0.9)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  animate(ctx, w, h, heights, final);
}

function drawOverlay(ctx, w, h, channels) {
  // Shared max so the three channels are height-comparable.
  const max = Math.max(1, ...channels.flatMap((c) => c.bins || [0]));
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (const c of channels) {
      const bins = c.bins || [];
      const step = w / bins.length;
      ctx.beginPath();
      ctx.moveTo(0, h);
      bins.forEach((v, i) => ctx.lineTo(i * step + step / 2, h - (v / max) * (h - 6) - 2));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = `rgba(${c.rgb}, 0.4)`;
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  };
  draw();
}

function drawHue(ctx, w, h, bins) {
  if (!bins || !bins.length) return;
  const heights = normalize(bins, h);
  const step = w / bins.length;
  ctx.clearRect(0, 0, w, h);
  heights.forEach((bh, i) => {
    const hue = (i / bins.length) * 360;   // hue bins map to the colour wheel
    ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;
    ctx.fillRect(i * step, h - bh - 2, Math.max(1, step - 0.5), bh);
  });
}

function animate(ctx, w, h, heights, finalDraw) {
  if (isReduced) { finalDraw(); return; }
  const t = { v: 0 };
  const scaled = (k) => heights.map((x) => x * k);
  gsap.to(t, {
    v: 1, duration: 0.5, ease: "expo.out",
    onUpdate: () => {
      const hs = scaled(t.v);
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      ctx.moveTo(0, h);
      const step = w / hs.length;
      hs.forEach((bh, i) => ctx.lineTo(i * step + step / 2, h - bh - 2));
      ctx.lineTo(w, h);
      ctx.closePath();
      // Colour is applied by finalDraw on completion; mid-tween use a neutral fill.
      ctx.fillStyle = "rgba(127,127,127,0.25)";
      ctx.fill();
    },
    onComplete: finalDraw,
  });
}

// Browser-side histograms for instant live feedback — one pixel pass computes
// every channel (Rec.709 luma, R/G/B, HSV saturation + hue, dark channel) so
// whichever curve the algorithm pinned moves with the preview.
function clientHistograms(src, binCount) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const sample = 256;
      const ratio = Math.min(1, sample / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const w = Math.max(1, Math.floor((img.naturalWidth || 1) * ratio));
      const hh = Math.max(1, Math.floor((img.naturalHeight || 1) * ratio));
      const off = document.createElement("canvas");
      off.width = w; off.height = hh;
      const oc = off.getContext("2d", { willReadFrequently: true });
      if (!oc) { resolve(null); return; }
      oc.drawImage(img, 0, 0, w, hh);
      let pix;
      try { pix = oc.getImageData(0, 0, w, hh).data; } catch { resolve(null); return; }

      const zeros = () => new Array(binCount).fill(0);
      const luma = zeros(), red = zeros(), green = zeros(), blue = zeros();
      const saturation = zeros(), hue = zeros(), darkChannel = zeros();
      const bin = (v) => Math.min(binCount - 1, Math.floor((v / 256) * binCount));

      for (let i = 0; i < pix.length; i += 4) {
        const r = pix[i], g = pix[i + 1], b = pix[i + 2];
        luma[bin(0.2126 * r + 0.7152 * g + 0.0722 * b)]++;
        red[bin(r)]++; green[bin(g)]++; blue[bin(b)]++;

        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const s = max === 0 ? 0 : (max - min) / max;
        saturation[Math.min(binCount - 1, Math.floor(s * binCount))]++;
        darkChannel[bin(min)]++;

        // Hue is undefined for grays — skip them so they don't spike bin 0.
        if (max > min) {
          const d = max - min;
          let h;
          if (max === r)      h = 60 * (((g - b) / d) % 6);
          else if (max === g) h = 60 * ((b - r) / d + 2);
          else                h = 60 * ((r - g) / d + 4);
          if (h < 0) h += 360;
          hue[Math.min(binCount - 1, Math.floor((h / 360) * binCount))]++;
        }
      }
      resolve({ luma, red, green, blue, saturation, hue, darkChannel });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
