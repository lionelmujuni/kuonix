// Empty state — the first thing a user sees on Edit. Drop zone with corner
// brackets, accent radial atmosphere, and a single inviting CTA.
//
// Usage: const node = renderEmptyState(onFiles, { mode }); parent.appendChild(node);
// onFiles is called with an array of File objects.
// `mode` controls copy + the file input's `multiple` attribute.

import { gsap } from "../../../node_modules/gsap/index.js";
import { dropAreaPulse, isReduced } from "../../motion.js";

const ACCEPT = ".jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff,.cr2,.cr3,.nef,.arw,.dng,.raf,.orf,.raw,.rw2,.srw,.pef";

export function renderEmptyState(onFiles, { mode = "single" } = {}) {
  const isBatch = mode === "batch";
  const wrap = document.createElement("section");
  wrap.className = "empty-state";
  wrap.innerHTML = `
    <div class="empty-state__hero reveal">
      <p class="eyebrow empty-state__eyebrow">
        <i class="bi bi-stars" aria-hidden="true"></i> A conversational darkroom
      </p>
      <h1>${isBatch ? "Drop a set. Tell me what they need." : "Drop an image. Tell me what you want."}</h1>
      <p>
        ${isBatch
          ? "Kuonix reads each image, groups them by issue, and applies your direction across the whole selection."
          : "Kuonix reads your image, picks the right tools, and walks you through every adjustment. No sliders — just describe it."}
      </p>
    </div>

    <div class="drop-zone reveal" tabindex="0" role="button"
         aria-label="${isBatch ? "Drop images or browse" : "Drop image or browse"}">
      <span class="drop-zone__corner drop-zone__corner--tl" aria-hidden="true"></span>
      <span class="drop-zone__corner drop-zone__corner--tr" aria-hidden="true"></span>
      <span class="drop-zone__corner drop-zone__corner--bl" aria-hidden="true"></span>
      <span class="drop-zone__corner drop-zone__corner--br" aria-hidden="true"></span>

      <i class="bi bi-images drop-zone__icon" aria-hidden="true"></i>
      <div class="drop-zone__title">${isBatch ? "Drop images or click to browse" : "Drop image or click to browse"}</div>
      <div class="drop-zone__subtitle">JPEG, PNG, WEBP, TIFF, BMP, RAW (CR2/3, NEF, ARW, DNG…)</div>
      <div class="drop-zone__formats">${isBatch ? "many images · batch edit mode" : "single image · single edit mode"}</div>

      <input type="file" accept="${ACCEPT}" ${isBatch ? "multiple" : ""} />
    </div>
  `;

  const zone = wrap.querySelector(".drop-zone");
  const input = zone.querySelector("input[type=file]");

  const handleFiles = (files) => {
    const arr = Array.from(files || []).filter(Boolean);
    if (!arr.length) return;
    onFiles(arr);
  };

  zone.addEventListener("click", (e) => {
    if (e.target === input) return;
    input.click();
  });
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
  });
  input.addEventListener("change", () => handleFiles(input.files));

  // Drag & drop
  let dragDepth = 0;
  const setDragOver = (on) => {
    zone.classList.toggle("is-dragover", on);
    dropAreaPulse(zone, on);
  };
  zone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth++;
    if (dragDepth === 1) setDragOver(true);
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  zone.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDragOver(false);
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  });

  // Subtle ambient pulse on the corner brackets so they feel alive while empty.
  if (!isReduced) {
    gsap.to(wrap.querySelectorAll(".drop-zone__corner"), {
      opacity: 0.7,
      duration: 1.6,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
      stagger: { each: 0.15, from: "start" },
    });
  }

  return wrap;
}

export const RAW_EXTENSIONS = new Set([
  "cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "raw", "rw2", "srw", "pef",
]);

export function isRawFile(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return RAW_EXTENSIONS.has(ext);
}
