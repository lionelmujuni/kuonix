// Histogram strip — luminance histogram + a few key features beside it.
// Computes bins client-side from the displayed image (small thumbnail is enough).

import { gsap } from "../../../node_modules/gsap/index.js";
import { isReduced } from "../../motion.js";

export function createHistogramStrip() {
  const root = document.createElement("div");
  root.className = "histogram-strip";
  root.innerHTML = `
    <canvas class="histogram-strip__canvas" width="600" height="56" aria-hidden="true"></canvas>
    <div class="histogram-strip__metrics" aria-label="Image features">
      <div class="histogram-strip__metric"><span class="label">Brightness</span><span class="value" data-metric="brightness">—</span></div>
      <div class="histogram-strip__metric"><span class="label">Contrast</span><span class="value" data-metric="contrast">—</span></div>
      <div class="histogram-strip__metric"><span class="label">Saturation</span><span class="value" data-metric="saturation">—</span></div>
    </div>
  `;
  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");

  // Devicepixel scale once attached & sized.
  let resizeObs = null;
  function syncCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 600;
    const cssH = canvas.clientHeight || 56;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clear() {
    syncCanvasSize();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
  }

  function setMetrics(features) {
    const f = features || {};
    setVal(root, "brightness", fmt(f.brightness));
    setVal(root, "contrast",   fmt(f.contrast));
    setVal(root, "saturation", fmt(f.saturation));
  }

  // Compute luminance histogram from an image src and animate the bars in.
  async function updateFromImageSrc(src) {
    if (!src) return;
    syncCanvasSize();
    const bins = await computeLuminanceHistogram(src);
    drawBars(ctx, canvas.clientWidth, canvas.clientHeight, bins);
  }

  function attach(parent) {
    parent.appendChild(root);
    syncCanvasSize();
    if (typeof ResizeObserver !== "undefined") {
      resizeObs = new ResizeObserver(syncCanvasSize);
      resizeObs.observe(canvas);
    }
  }

  function destroy() {
    resizeObs?.disconnect?.();
    resizeObs = null;
    if (root.parentElement) root.parentElement.removeChild(root);
  }

  return { el: root, attach, destroy, setMetrics, updateFromImageSrc, clear };
}

function setVal(root, name, text) {
  const el = root.querySelector(`[data-metric="${name}"]`);
  if (el) el.textContent = text;
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) < 1) return n.toFixed(2);
  if (Math.abs(n) < 10) return n.toFixed(1);
  return Math.round(n).toString();
}

async function computeLuminanceHistogram(src, binCount = 64, sampleSize = 320) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Downsample into an offscreen canvas to keep histogram cheap.
      const ratio = Math.min(1, sampleSize / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.floor(img.naturalWidth * ratio));
      const h = Math.max(1, Math.floor(img.naturalHeight * ratio));
      const off = document.createElement("canvas");
      off.width = w; off.height = h;
      const oc = off.getContext("2d", { willReadFrequently: true });
      oc.drawImage(img, 0, 0, w, h);
      let data;
      try { data = oc.getImageData(0, 0, w, h).data; }
      catch { resolve(new Array(binCount).fill(0)); return; }

      const bins = new Array(binCount).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        // Rec. 709 luma
        const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        const idx = Math.min(binCount - 1, Math.floor((y / 256) * binCount));
        bins[idx]++;
      }
      resolve(bins);
    };
    img.onerror = () => resolve(new Array(binCount).fill(0));
    img.src = src;
  });
}

function drawBars(ctx, w, h, bins) {
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(1, ...bins);
  const gap = 1;
  const barWidth = Math.max(1, (w - gap * (bins.length - 1)) / bins.length);

  // Read accent rgb from CSS for theme awareness.
  const root = getComputedStyle(document.documentElement);
  const rgb = (root.getPropertyValue("--accent-color-rgb") || "59, 130, 246").trim();

  // Animate each bar growing from 0 → final via a virtual progress var.
  const final = bins.map((v) => (v / max) * (h - 6));

  const bars = bins.map(() => ({ height: 0 }));
  const tween = { t: 0 };
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    bars.forEach((b, i) => {
      const x = i * (barWidth + gap);
      const barH = final[i] * tween.t;
      const y = h - barH - 2;
      // Subtle tonal gradient: shadows → midtones → highlights along x.
      const opacity = 0.25 + 0.55 * (i / bins.length);
      ctx.fillStyle = `rgba(${rgb}, ${opacity.toFixed(3)})`;
      ctx.fillRect(x, y, barWidth, barH);
    });
  };

  if (isReduced) { tween.t = 1; draw(); return; }
  gsap.to(tween, { t: 1, duration: 0.7, ease: "expo.out", onUpdate: draw });
}
