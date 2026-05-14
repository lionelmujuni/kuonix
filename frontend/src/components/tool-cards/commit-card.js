// Commit tool card — emitted when the agent calls commitCorrection.
//   { workingPath, base64, method, params }
//
// A "checkmark" card showing the new working baseline. Clicking it restores
// the stage to this commit (delegated via the bus).

import { gsap } from "../../../node_modules/gsap/index.js";
import { isReduced } from "../../motion.js";
import { paramsToChips } from "./preview-card.js";
import { emit, EVENTS } from "../../bus.js";

export function renderCommitCard({ workingPath, base64, method, params }) {
  const card = document.createElement("article");
  card.className = "tool-card tool-card--commit";
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", `Committed: ${method}`);
  card.innerHTML = `
    <div class="tool-card__thumb"></div>
    <div class="tool-card__body">
      <div class="tool-card__heading">
        <i class="bi bi-check2-circle"></i> Committed
      </div>
      <div class="tool-card__title">${escapeHtml(prettyMethod(method))}</div>
      <div class="tool-card__params"></div>
      <div class="tool-card__path" title="${escapeAttr(workingPath || "")}">${escapeHtml(filenameOf(workingPath))}</div>
    </div>
  `;

  const thumb = card.querySelector(".tool-card__thumb");
  if (base64) {
    const img = new Image();
    img.alt = `${method} committed`;
    img.src = base64;
    thumb.appendChild(img);
  }

  const paramsEl = card.querySelector(".tool-card__params");
  for (const chip of paramsToChips(params)) paramsEl.appendChild(chip);

  // Click to restore — restoring to a past commit re-points the stage.
  card.addEventListener("click", () => {
    if (base64) emit(EVENTS.STAGE_RESTORE, { src: base64, path: workingPath });
  });
  card.style.cursor = "pointer";

  if (!isReduced) {
    gsap.fromTo(card,
      { opacity: 0, y: 8, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "expo.out" });
  }
  return card;
}

function prettyMethod(id) {
  if (!id) return "Correction";
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function filenameOf(p) {
  if (!p) return "";
  const seg = String(p).split(/[\\/]/);
  return seg[seg.length - 1] || p;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
function escapeAttr(s) { return escapeHtml(s); }
