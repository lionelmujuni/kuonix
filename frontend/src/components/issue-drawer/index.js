// Issue drawer — a floating card that opens when the user clicks an issue chip
// (ribbon) or issue dot (contact sheet). Progressive disclosure:
//   1. Issue label + icon (always)
//   2. Camera tip (if cameraFeedback module on and EXIF available)
//   3. Relevant style-gap bar (if styleProfiles module on and activeProfileId set)
//   4. "Ask AI" button (if ai module on)
//
// Singleton — only one drawer is visible at a time.
// Exported: openIssueDrawer(issue, anchorEl, { imagePath })

import { gsap } from "../../../node_modules/gsap/index.js";
import { isReduced } from "../../motion.js";
import * as state from "../../state.js";
import { getCameraFeedback } from "../../api/endpoints/images.js";
import { getStyleGap } from "../../api/endpoints/styleProfiles.js";
import { injectPrompt } from "../agent-rail/index.js";
import { getIssueMeta, GAP_MAX, prettify } from "../issue-meta.js";

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    .issue-drawer {
      position: fixed; z-index: 9100;
      width: 272px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.14);
      overflow: hidden;
      outline: none;
    }
    .issue-drawer__header {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 14px 10px;
      border-bottom: 1px solid var(--color-border);
    }
    .issue-drawer__icon { font-size: 14px; }
    .issue-drawer__title { font-size: 13px; font-weight: 600; flex: 1; }
    .issue-drawer__close {
      padding: 2px 6px; border-radius: 6px; border: 0;
      background: transparent; color: var(--color-text-secondary); font-size: 12px;
      cursor: pointer; transition: color 0.15s;
    }
    .issue-drawer__close:hover { color: var(--color-text); }

    .issue-drawer__body { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }

    .issue-drawer__section-label {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.06em; color: var(--color-text-secondary); margin-bottom: 4px;
    }
    .issue-drawer__tip { font-size: 12px; line-height: 1.5; color: var(--color-text); }
    .issue-drawer__tip-sev {
      display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px;
      font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
      margin-left: 6px; vertical-align: middle;
    }
    .issue-drawer__tip-sev--high   { background: rgba(220,80,60,.15);  color: #e05252; }
    .issue-drawer__tip-sev--medium { background: rgba(232,140,46,.15); color: #e88c2e; }
    .issue-drawer__tip-sev--low    { background: rgba(76,175,80,.13);  color: #4caf50; }
    .issue-drawer__no-tip { font-size: 12px; color: var(--color-text-secondary); font-style: italic; }
    .issue-drawer__spinner {
      display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-text-secondary);
    }
    .issue-drawer__spin {
      width: 12px; height: 12px; border-radius: 50%;
      border: 2px solid var(--color-border); border-top-color: rgba(var(--accent-color-rgb),.8);
      animation: idSpin 0.7s linear infinite;
    }
    @keyframes idSpin { to { transform: rotate(360deg); } }

    .issue-drawer__gap-row { display: flex; align-items: center; gap: 8px; }
    .issue-drawer__gap-label { font-size: 11px; color: var(--color-text-secondary); width: 72px; flex-shrink: 0; }
    .issue-drawer__gap-bar-wrap {
      flex: 1; height: 6px; border-radius: 3px;
      background: var(--color-secondary); position: relative; overflow: hidden;
    }
    .issue-drawer__gap-bar {
      position: absolute; top: 0; height: 100%; border-radius: 3px;
    }
    .issue-drawer__gap-bar--pos { background: rgba(var(--accent-color-rgb), 0.7); left: 50%; }
    .issue-drawer__gap-bar--neg { background: rgba(220, 100, 80, 0.7); right: 50%; }
    .issue-drawer__gap-delta { font-size: 11px; color: var(--color-text-secondary); width: 42px; text-align: right; font-variant-numeric: tabular-nums; }

    .issue-drawer__ask {
      width: 100%; padding: 8px; border-radius: 8px;
      background: rgba(var(--accent-color-rgb), 0.12);
      border: 1px solid rgba(var(--accent-color-rgb), 0.22);
      color: var(--color-text); font-size: 12px; font-weight: 500;
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: background 0.15s, border-color 0.15s;
    }
    .issue-drawer__ask:hover { background: rgba(var(--accent-color-rgb), 0.2); }
  `;
  document.head.appendChild(s);
}

// ---- Singleton state ----

let drawerEl = null;
let outsideHandler = null;
let keyHandler = null;

function close() {
  if (!drawerEl) return;
  const el = drawerEl;
  drawerEl = null;
  document.removeEventListener("mousedown", outsideHandler, true);
  document.removeEventListener("keydown", keyHandler, true);
  outsideHandler = null;
  keyHandler = null;
  if (!isReduced) {
    gsap.to(el, { opacity: 0, scale: 0.95, duration: 0.15, ease: "power2.in",
      onComplete: () => el.remove() });
  } else {
    el.remove();
  }
}

export function openIssueDrawer(issue, anchorEl, { imagePath } = {}) {
  injectStyles();
  close();

  const meta = getIssueMeta(issue);
  const modules = window.__kuonixConfig?.modules || {};

  const el = document.createElement("div");
  el.className = "issue-drawer";
  el.setAttribute("tabindex", "-1");
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", `Issue: ${meta.label}`);
  drawerEl = el;

  el.innerHTML = `
    <div class="issue-drawer__header">
      <i class="bi ${meta.icon} issue-drawer__icon"></i>
      <span class="issue-drawer__title">${meta.label}</span>
      <button class="issue-drawer__close" aria-label="Close"><i class="bi bi-x-lg"></i></button>
    </div>
    <div class="issue-drawer__body" id="idb-body"></div>
  `;

  el.querySelector(".issue-drawer__close").addEventListener("click", close);
  document.body.appendChild(el);
  positionNear(el, anchorEl);

  if (!isReduced) {
    gsap.fromTo(el, { opacity: 0, scale: 0.93, y: -4 },
      { opacity: 1, scale: 1, y: 0, duration: 0.2, ease: "expo.out" });
  }

  el.focus();

  outsideHandler = (e) => { if (!el.contains(e.target)) close(); };
  keyHandler = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  setTimeout(() => {
    document.addEventListener("mousedown", outsideHandler, true);
    document.addEventListener("keydown", keyHandler, true);
  }, 50);

  const body = el.querySelector("#idb-body");
  renderBody(body, issue, meta, imagePath, modules);
}

async function renderBody(body, issue, meta, imagePath, modules) {
  const sections = [];
  const alive = () => drawerEl && drawerEl.contains(body);

  // ---- Camera tip section ----
  if (modules.cameraFeedback && imagePath) {
    const tipSection = document.createElement("div");
    tipSection.innerHTML = `
      <div class="issue-drawer__section-label">Camera tip</div>
      <div class="issue-drawer__spinner"><div class="issue-drawer__spin"></div>Loading…</div>
    `;
    body.appendChild(tipSection);

    try {
      const res = await getCameraFeedback([imagePath], { enableSkin: true });
      if (!alive()) return;
      const tips = res?.[imagePath] || [];
      const match = tips.find(t => t.issue === issue) || tips[0];
      if (match) {
        const sevClass = `issue-drawer__tip-sev--${(match.severity || "medium").toLowerCase()}`;
        tipSection.innerHTML = `
          <div class="issue-drawer__section-label">Camera tip</div>
          <div class="issue-drawer__tip">
            ${escHtml(match.tip)}
            <span class="issue-drawer__tip-sev ${sevClass}">${match.severity || ""}</span>
          </div>`;
      } else {
        tipSection.innerHTML = `
          <div class="issue-drawer__section-label">Camera tip</div>
          <p class="issue-drawer__no-tip">No camera-setting tip for this issue.</p>`;
      }
    } catch {
      tipSection.innerHTML = `
        <div class="issue-drawer__section-label">Camera tip</div>
        <p class="issue-drawer__no-tip">Could not load tip.</p>`;
    }

    positionNear(drawerEl, null);
    sections.push(tipSection);
  }

  // ---- Style gap section ----
  if (modules.styleProfiles && meta.gap && state.get("activeProfileId") && imagePath) {
    const gapSection = document.createElement("div");
    gapSection.innerHTML = `
      <div class="issue-drawer__section-label">Gap to style target</div>
      <div class="issue-drawer__spinner"><div class="issue-drawer__spin"></div>Loading…</div>
    `;
    body.appendChild(gapSection);

    try {
      const res = await getStyleGap(imagePath, state.get("activeProfileId"));
      if (!alive()) return;
      const gap = res?.gap;
      if (gap) {
        const dim = meta.gap;
        const deltaKey = dim + "Delta";
        const delta = gap[deltaKey];
        if (typeof delta === "number") {
          const max = GAP_MAX[dim] || 1;
          const pct = Math.min(Math.abs(delta) / max * 50, 50);
          const pos = delta > 0;
          const sign = delta > 0 ? "+" : "";
          const dimLabel = dim === "castAngle" ? "Cast angle" : dim.charAt(0).toUpperCase() + dim.slice(1);
          gapSection.innerHTML = `
            <div class="issue-drawer__section-label">Gap to style target</div>
            <div class="issue-drawer__gap-row">
              <span class="issue-drawer__gap-label">${dimLabel}</span>
              <div class="issue-drawer__gap-bar-wrap">
                <div class="issue-drawer__gap-bar ${pos ? "issue-drawer__gap-bar--pos" : "issue-drawer__gap-bar--neg"}"
                     style="width:${pct}%"></div>
              </div>
              <span class="issue-drawer__gap-delta">${sign}${delta.toFixed(2)}</span>
            </div>`;
        } else {
          gapSection.innerHTML = `<div class="issue-drawer__section-label">Gap to style target</div><p class="issue-drawer__no-tip">No data for this dimension.</p>`;
        }
      } else {
        gapSection.innerHTML = `<div class="issue-drawer__section-label">Gap to style target</div><p class="issue-drawer__no-tip">No style profile gap available.</p>`;
      }
    } catch {
      gapSection.innerHTML = `<div class="issue-drawer__section-label">Gap to style target</div><p class="issue-drawer__no-tip">Could not load gap.</p>`;
    }

    positionNear(drawerEl, null);
    sections.push(gapSection);
  }

  // ---- Ask AI button ----
  if (modules.aiAssistant) {
    const label = meta.label || prettify(issue);
    const askBtn = document.createElement("button");
    askBtn.className = "issue-drawer__ask";
    askBtn.innerHTML = `<i class="bi bi-stars"></i> Ask AI about this`;
    askBtn.addEventListener("click", () => {
      injectPrompt(`Explain the "${label}" issue in this image — what caused it and how can I fix it?`);
      close();
    });
    body.appendChild(askBtn);
  }
}

// Position the drawer below (or above) an anchor element.
// Called initially and after async content loads to reflow.
function positionNear(el, anchor) {
  if (!el) return;
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = el.getBoundingClientRect();
  const w = rect.width || 272;
  const h = rect.height;

  let top, left;

  if (anchor) {
    el._anchor = anchor;
    const ar = anchor.getBoundingClientRect();
    left = Math.min(ar.left, vw - w - margin);
    left = Math.max(margin, left);
    if (ar.bottom + h + margin < vh) {
      top = ar.bottom + margin;
    } else {
      top = Math.max(margin, ar.top - h - margin);
    }
    el._anchorTop = top;
    el._anchorLeft = left;
  } else if (el._anchorTop != null) {
    top = el._anchorTop;
    left = el._anchorLeft;
    // Re-check vertical fit after content resize.
    const newH = el.getBoundingClientRect().height;
    if (top + newH > vh - margin) {
      top = Math.max(margin, vh - newH - margin);
    }
  } else {
    return;
  }

  el.style.top  = `${top}px`;
  el.style.left = `${left}px`;
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
