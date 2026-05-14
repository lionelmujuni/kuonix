// Analysis ribbon — slides down at the top of the working stage during
// upload/decode/analysis, then settles into a row of issue chips.
//
// Lifecycle:
//   const ribbon = createAnalysisRibbon();
//   ribbon.mount(parent);
//   ribbon.setStatus({ kind: "uploading", text: "Uploading 1 image…" });
//   ribbon.setStatus({ kind: "analyzing", text: "Reading exposure", progress: 0.4 });
//   ribbon.setIssues(["UNDEREXPOSED", "COLOR_CAST_COOL"]);
//   ribbon.destroy();

import { gsap } from "../../../node_modules/gsap/index.js";
import { streamingDots, stopStreamingDots, progressTo, isReduced } from "../../motion.js";

const ISSUE_META = {
  UNDEREXPOSED:    { label: "Underexposed",    family: "exposure", icon: "bi-moon-stars" },
  OVEREXPOSED:     { label: "Overexposed",     family: "exposure", icon: "bi-brightness-high" },
  LOW_CONTRAST:    { label: "Low contrast",    family: "exposure", icon: "bi-circle-half" },
  HIGH_CONTRAST:   { label: "High contrast",   family: "exposure", icon: "bi-circle-half" },
  LOW_SATURATION:  { label: "Low saturation",  family: "cast",     icon: "bi-droplet" },
  HIGH_SATURATION: { label: "High saturation", family: "cast",     icon: "bi-droplet-fill" },
  COLOR_CAST_WARM: { label: "Warm cast",       family: "cast",     icon: "bi-sun" },
  COLOR_CAST_COOL: { label: "Cool cast",       family: "cast",     icon: "bi-cloud" },
  COLOR_CAST_GREEN:{ label: "Green cast",      family: "cast",     icon: "bi-tree" },
  COLOR_CAST_MAGENTA:{ label: "Magenta cast",  family: "cast",     icon: "bi-flower1" },
  SHADOW_NOISE:    { label: "Shadow noise",    family: "noise",    icon: "bi-grid-3x3" },
  HIGHLIGHT_CLIP:  { label: "Highlights clipped", family: "noise",  icon: "bi-exclamation-triangle" },
  SOFT_FOCUS:      { label: "Soft focus",      family: "noise",    icon: "bi-eye-slash" },
};

export function createAnalysisRibbon() {
  const root = document.createElement("div");
  root.className = "analysis-ribbon";
  root.innerHTML = `
    <i class="bi bi-soundwave analysis-ribbon__icon" aria-hidden="true"></i>
    <div class="analysis-ribbon__status">
      <span class="streaming-dots" aria-hidden="true">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </span>
      <span class="status-text">Preparing…</span>
    </div>
    <div class="analysis-ribbon__chips" aria-live="polite"></div>
    <div class="analysis-ribbon__progress" aria-hidden="true"></div>
  `;
  const statusText = root.querySelector(".status-text");
  const dotsEl = root.querySelector(".streaming-dots");
  const chipsEl = root.querySelector(".analysis-ribbon__chips");
  const progressEl = root.querySelector(".analysis-ribbon__progress");

  let dotsAnim = null;
  let mounted = false;
  let lastProgress = 0;

  function startDots() {
    if (dotsAnim) return;
    dotsEl.style.display = "inline-flex";
    dotsAnim = streamingDots(dotsEl);
  }

  function stopDots() {
    if (!dotsAnim) return;
    stopStreamingDots(dotsAnim, dotsEl);
    dotsAnim = null;
    dotsEl.style.display = "none";
  }

  return {
    mount(parent) {
      if (mounted) return;
      parent.appendChild(root);
      mounted = true;
      if (!isReduced) {
        gsap.fromTo(root,
          { y: -8, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.35, ease: "expo.out" });
      }
    },

    setStatus({ kind = "info", text = "", progress = null }) {
      statusText.textContent = text;
      root.classList.toggle("is-analyzing", kind === "analyzing" || kind === "uploading" || kind === "decoding");
      if (kind === "analyzing" || kind === "uploading" || kind === "decoding") startDots();
      else stopDots();

      if (typeof progress === "number") {
        const pct = Math.max(0, Math.min(1, progress)) * 100;
        progressTo(progressEl, lastProgress * 100, pct, 0.4);
        lastProgress = progress;
      }
    },

    setIssues(issues) {
      stopDots();
      root.classList.remove("is-analyzing");
      progressTo(progressEl, lastProgress * 100, 100, 0.3);

      chipsEl.innerHTML = "";
      const list = Array.isArray(issues) ? issues : [];
      if (!list.length) {
        statusText.textContent = "Looks clean.";
        const chip = document.createElement("span");
        chip.className = "issue-chip issue-chip--success";
        chip.innerHTML = `<i class="bi bi-check2"></i> No issues detected`;
        chipsEl.appendChild(chip);
        if (!isReduced) gsap.from(chip, { opacity: 0, y: 4, scale: 0.96, duration: 0.3, ease: "expo.out" });
        return;
      }

      statusText.textContent = `${list.length} issue${list.length === 1 ? "" : "s"}`;
      const chips = list.map((issue) => {
        const meta = ISSUE_META[issue] || { label: prettify(issue), family: "other", icon: "bi-circle" };
        const chip = document.createElement("span");
        chip.className = `issue-chip issue-chip--${meta.family}`;
        chip.innerHTML = `<i class="bi ${meta.icon}"></i> ${meta.label}`;
        chipsEl.appendChild(chip);
        return chip;
      });
      if (!isReduced) {
        gsap.from(chips, {
          opacity: 0, y: 4, scale: 0.96,
          duration: 0.28, ease: "expo.out",
          stagger: 0.06,
          clearProps: "transform",
        });
      }
    },

    setError(message) {
      stopDots();
      root.classList.remove("is-analyzing");
      statusText.textContent = message;
      chipsEl.innerHTML = "";
      const chip = document.createElement("span");
      chip.className = "issue-chip issue-chip--noise";
      chip.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Error`;
      chipsEl.appendChild(chip);
    },

    destroy() {
      stopDots();
      if (root.parentElement) root.parentElement.removeChild(root);
      mounted = false;
    },

    el: root,
  };
}

function prettify(s) {
  return String(s).toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
