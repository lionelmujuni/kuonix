// Preview tool card — emitted when the agent calls previewCorrection.
//   { base64, method, params, beforeSrc }
//
// Shows a 64px thumbnail (the preview itself), the algorithm name, and any
// non-default parameters as compact chips.
// When beforeSrc is provided (the stage image captured just before this
// correction fired), a press-and-hold Compare button lets the user see the
// before state on the stage for as long as they hold.

import { gsap } from "../../../node_modules/gsap/index.js";
import { isReduced } from "../../motion.js";
import { emit, EVENTS } from "../../bus.js";

export function renderPreviewCard({ base64, method, params, beforeSrc }) {
  const hasCompare = !!(beforeSrc && base64);

  const card = document.createElement("article");
  card.className = "tool-card tool-card--preview";
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", `Preview: ${method}`);
  card.innerHTML = `
    <div class="tool-card__thumb"></div>
    <div class="tool-card__body">
      <div class="tool-card__heading">
        <i class="bi bi-eye"></i> Preview
      </div>
      <div class="tool-card__title">${escapeHtml(prettyMethod(method))}</div>
      <div class="tool-card__params"></div>
      ${hasCompare ? `
        <button class="tool-card__compare" type="button"
                aria-label="Hold to compare with original"
                aria-pressed="false">
          <i class="bi bi-eye-slash"></i> Compare
        </button>
      ` : ""}
    </div>
  `;

  const thumb = card.querySelector(".tool-card__thumb");
  if (base64) {
    const img = new Image();
    img.alt = `${method} preview`;
    img.src = base64;
    thumb.appendChild(img);
  }

  const paramsEl = card.querySelector(".tool-card__params");
  for (const chip of paramsToChips(params)) paramsEl.appendChild(chip);

  if (hasCompare) {
    const btn = card.querySelector(".tool-card__compare");

    const showBefore = () => {
      btn.classList.add("is-active");
      btn.setAttribute("aria-pressed", "true");
      emit(EVENTS.STAGE_SET_IMAGE, { src: beforeSrc });
    };

    const showAfter = () => {
      if (!btn.classList.contains("is-active")) return;
      btn.classList.remove("is-active");
      btn.setAttribute("aria-pressed", "false");
      emit(EVENTS.STAGE_SET_IMAGE, { src: base64 });
    };

    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      showBefore();
      window.addEventListener("pointerup", showAfter, { once: true });
    });

    btn.addEventListener("pointerleave", showAfter);

    btn.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); showBefore(); }
    });
    btn.addEventListener("keyup", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); showAfter(); }
    });
  }

  if (!isReduced) {
    gsap.fromTo(card,
      { opacity: 0, y: 8, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "expo.out" });
  }
  return card;
}

function prettyMethod(id) {
  if (!id) return "Correction";
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function paramsToChips(params) {
  const chips = [];
  if (!params || typeof params !== "object") return chips;
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    const chip = document.createElement("span");
    chip.className = "tool-card__param";
    chip.innerHTML = `<b>${escapeHtml(k)}</b> ${escapeHtml(formatValue(v))}`;
    chips.push(chip);
  }
  return chips;
}

function formatValue(v) {
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(2);
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") return "{…}";
  return String(v);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
