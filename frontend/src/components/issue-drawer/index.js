// Issue insight panel — a floating panel that opens when the user clicks an
// issue chip (ribbon) or issue dot (contact sheet). Progressive disclosure:
//   1. Issue label + icon + severity (always)
//   2. "Your shot" — EXIF chips the advice is reasoning from (if EXIF available)
//   3. "Why this happened" — the camera tip, AI-toned when configured
//      (if cameraFeedback module on and EXIF available)
//   4. Recommended reading — curated resource links (opened externally)
//   5. Search for tutorials — editable EXIF-seeded query → Google / YouTube
//   6. Relevant style-gap bar (if styleProfiles module on and activeProfileId set)
//   7. "Ask AI" button (if aiAssistant module on)
//
// External links open via the Electron shell (separate window) so a broken or
// closed page never affects the app. Singleton — one panel visible at a time.
// Exported: openIssueDrawer(issue, anchorEl, { imagePath })

import { gsap } from "../../../node_modules/gsap/index.js";
import { isReduced } from "../../motion.js";
import * as state from "../../state.js";
import { getCameraFeedback } from "../../api/endpoints/images.js";
import { getStyleGap } from "../../api/endpoints/styleProfiles.js";
import { injectPrompt } from "../agent-rail/index.js";
import { getIssueMeta, GAP_MAX, prettify } from "../issue-meta.js";
import { partitionResources, searchQueryFromResources, googleUrl, youtubeUrl } from "./links.js";

const PANEL_WIDTH = 384;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    .issue-drawer {
      position: fixed; z-index: 9100;
      width: ${PANEL_WIDTH}px; max-height: 82vh;
      display: flex; flex-direction: column;
      background: var(--color-surface);
      border: 1px solid var(--color-card-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg), 0 0 0 1px rgba(var(--accent-color-rgb), 0.04);
      overflow: hidden; outline: none;
    }
    .issue-drawer__header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px 12px; flex-shrink: 0;
      border-bottom: 1px solid var(--color-card-border-inner, var(--color-border));
    }
    .issue-drawer__icon { font-size: 16px; color: var(--color-text-secondary); }
    .issue-drawer__title {
      font-size: var(--font-size-lg, 16px); font-weight: var(--font-weight-semibold, 550);
      letter-spacing: var(--letter-spacing-tight, -0.01em); flex: 1; min-width: 0;
    }
    .issue-drawer__sev {
      display: inline-flex; align-items: center; padding: 3px 9px;
      border-radius: var(--radius-full); font-size: 10px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.04em; flex-shrink: 0;
    }
    .issue-drawer__sev--high   { background: rgba(var(--color-error-rgb), 0.15);   color: var(--color-error);   border: 1px solid rgba(var(--color-error-rgb), 0.25); }
    .issue-drawer__sev--medium { background: rgba(var(--color-warning-rgb), 0.15); color: var(--color-warning); border: 1px solid rgba(var(--color-warning-rgb), 0.25); }
    .issue-drawer__sev--low    { background: rgba(var(--color-success-rgb), 0.13); color: var(--color-success); border: 1px solid rgba(var(--color-success-rgb), 0.25); }
    .issue-drawer__close {
      width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center;
      border-radius: var(--radius-base); border: 0; background: transparent;
      color: var(--color-text-secondary); font-size: 13px; cursor: pointer; flex-shrink: 0;
      transition: background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard);
    }
    .issue-drawer__close:hover { background: var(--color-secondary); color: var(--color-text); }

    .issue-drawer__body {
      padding: 14px 16px; display: flex; flex-direction: column; gap: 16px;
      overflow-y: auto;
    }
    .issue-drawer__section:empty { display: none; }

    .issue-drawer__section-label {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--color-text-secondary); margin-bottom: 8px;
      display: flex; align-items: center; gap: 6px;
    }

    .issue-drawer__chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .issue-drawer__chip {
      font-size: var(--font-size-sm, 12px); padding: 3px 9px;
      border-radius: var(--radius-sm); background: var(--color-secondary);
      color: var(--color-text-secondary); white-space: nowrap;
    }

    .issue-drawer__tip { font-size: var(--font-size-base, 14px); line-height: 1.6; color: var(--color-text); margin: 0; }
    .issue-drawer__no-tip { font-size: var(--font-size-sm, 12px); color: var(--color-text-secondary); font-style: italic; margin: 0; }
    .issue-drawer__spinner {
      display: flex; align-items: center; gap: 8px; font-size: var(--font-size-sm, 12px); color: var(--color-text-secondary);
    }
    .issue-drawer__spin {
      width: 13px; height: 13px; border-radius: 50%;
      border: 2px solid var(--color-border); border-top-color: rgba(var(--accent-color-rgb), .85);
      animation: idSpin 0.7s linear infinite;
    }
    @keyframes idSpin { to { transform: rotate(360deg); } }

    .issue-drawer__links { display: flex; flex-direction: column; gap: 7px; }
    .issue-drawer__link {
      display: flex; align-items: center; gap: 10px; padding: 9px 11px; width: 100%;
      border: 1px solid var(--color-border); border-radius: var(--radius-base);
      background: transparent; color: var(--color-text); font-size: var(--font-size-sm, 12px);
      text-align: left; cursor: pointer;
      transition: background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
    }
    .issue-drawer__link:hover {
      background: rgba(var(--accent-color-rgb), 0.06);
      border-color: rgba(var(--accent-color-rgb), 0.3);
    }
    .issue-drawer__link-icon { font-size: 15px; color: var(--color-text-secondary); flex-shrink: 0; }
    .issue-drawer__link-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .issue-drawer__link-ext { font-size: 13px; color: var(--color-text-secondary); flex-shrink: 0; }

    .issue-drawer__search-input {
      width: 100%; padding: 9px 12px; margin-bottom: 8px;
      border-radius: var(--radius-base); border: 1px solid var(--color-border);
      background: var(--color-surface); color: var(--color-text); font-size: var(--font-size-sm, 12px);
      transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
    }
    .issue-drawer__search-input:focus {
      outline: 0; border-color: rgba(var(--accent-color-rgb), 0.5);
      box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb), 0.15);
    }
    .issue-drawer__search-row { display: flex; gap: 8px; }
    .issue-drawer__search-btn {
      flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 8px; border-radius: var(--radius-base); cursor: pointer;
      font-size: var(--font-size-sm, 12px); font-weight: var(--font-weight-medium, 500);
      background: rgba(var(--accent-color-rgb), 0.08);
      border: 1px solid rgba(var(--accent-color-rgb), 0.18);
      color: var(--accent-color);
      transition: background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
    }
    .issue-drawer__search-btn:hover {
      background: rgba(var(--accent-color-rgb), 0.16);
      border-color: rgba(var(--accent-color-rgb), 0.3);
    }

    .issue-drawer__gap-row { display: flex; align-items: center; gap: 8px; }
    .issue-drawer__gap-label { font-size: var(--font-size-xs, 11px); color: var(--color-text-secondary); width: 72px; flex-shrink: 0; }
    .issue-drawer__gap-bar-wrap {
      flex: 1; height: 6px; border-radius: 3px;
      background: var(--color-secondary); position: relative; overflow: hidden;
    }
    .issue-drawer__gap-bar { position: absolute; top: 0; height: 100%; border-radius: 3px; }
    .issue-drawer__gap-bar--pos { background: rgba(var(--accent-color-rgb), 0.7); left: 50%; }
    .issue-drawer__gap-bar--neg { background: rgba(var(--color-error-rgb), 0.7); right: 50%; }
    .issue-drawer__gap-delta { font-size: var(--font-size-xs, 11px); color: var(--color-text-secondary); width: 42px; text-align: right; font-variant-numeric: tabular-nums; }

    .issue-drawer__ask {
      width: 100%; padding: 10px; border-radius: var(--radius-base);
      background: var(--accent-color); border: 1px solid transparent;
      color: #fff; font-size: var(--font-size-sm, 12px); font-weight: var(--font-weight-medium, 500);
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: filter var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
    }
    .issue-drawer__ask:hover { filter: brightness(1.05); box-shadow: 0 4px 16px rgba(var(--accent-color-rgb), 0.3); }
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
    gsap.to(el, { opacity: 0, scale: 0.97, duration: 0.15, ease: "power2.in",
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
      <span class="issue-drawer__title">${escHtml(meta.label)}</span>
      <button class="issue-drawer__close" aria-label="Close"><i class="bi bi-x-lg"></i></button>
    </div>
    <div class="issue-drawer__body" id="idb-body"></div>
  `;

  el.querySelector(".issue-drawer__close").addEventListener("click", close);
  document.body.appendChild(el);
  positionNear(el, anchorEl);

  if (!isReduced) {
    gsap.fromTo(el, { opacity: 0, scale: 0.95, y: -4 },
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

function renderBody(body, issue, meta, imagePath, modules) {
  const alive = () => drawerEl && drawerEl.contains(body);

  // ---- "Your shot" EXIF chips (synchronous, from state) ----
  const chips = exifChips(exifFor(imagePath));
  if (chips.length) {
    const sec = makeSection();
    sec.innerHTML = `
      <div class="issue-drawer__section-label"><i class="bi bi-camera2"></i> Your shot</div>
      <div class="issue-drawer__chips">${chips.map(c => `<span class="issue-drawer__chip">${escHtml(c)}</span>`).join("")}</div>`;
    body.appendChild(sec);
  }

  // ---- Camera tip + resource links (single fetch fills three sections) ----
  if (modules.cameraFeedback && imagePath) {
    const tipSec = makeSection();
    tipSec.innerHTML = `
      <div class="issue-drawer__section-label"><i class="bi bi-stars"></i> Why this happened</div>
      <div class="issue-drawer__spinner"><div class="issue-drawer__spin"></div>Reading your settings…</div>`;
    body.appendChild(tipSec);

    const readingSec = makeSection();
    const searchSec = makeSection();
    body.appendChild(readingSec);
    body.appendChild(searchSec);

    getCameraFeedback([imagePath], { enableSkin: true }).then((res) => {
      if (!alive()) return;
      const tips = res?.[imagePath] || [];
      const match = tips.find(t => t.issue === issue) || tips[0];
      if (match) {
        const sevClass = `issue-drawer__sev--${(match.severity || "medium").toLowerCase()}`;
        tipSec.innerHTML = `
          <div class="issue-drawer__section-label">
            <i class="bi bi-stars"></i> Why this happened
            ${match.severity ? `<span class="issue-drawer__sev ${sevClass}">${escHtml(match.severity)}</span>` : ""}
          </div>
          <p class="issue-drawer__tip">${escHtml(match.tip)}</p>`;
        renderResources(readingSec, searchSec, match.resources, meta);
      } else {
        tipSec.innerHTML = `
          <div class="issue-drawer__section-label"><i class="bi bi-stars"></i> Why this happened</div>
          <p class="issue-drawer__no-tip">No camera-setting tip for this issue.</p>`;
      }
      positionNear(drawerEl, null);
    }).catch(() => {
      if (!alive()) return;
      tipSec.innerHTML = `
        <div class="issue-drawer__section-label"><i class="bi bi-stars"></i> Why this happened</div>
        <p class="issue-drawer__no-tip">Could not load tip.</p>`;
      positionNear(drawerEl, null);
    });
  }

  // ---- Style gap section ----
  if (modules.styleProfiles && meta.gap && state.get("activeProfileId") && imagePath) {
    const gapSec = makeSection();
    gapSec.innerHTML = `
      <div class="issue-drawer__section-label"><i class="bi bi-rulers"></i> Gap to style target</div>
      <div class="issue-drawer__spinner"><div class="issue-drawer__spin"></div>Loading…</div>`;
    body.appendChild(gapSec);

    getStyleGap(imagePath, state.get("activeProfileId")).then((res) => {
      if (!alive()) return;
      renderGap(gapSec, res?.gap, meta);
      positionNear(drawerEl, null);
    }).catch(() => {
      if (!alive()) return;
      gapSec.innerHTML = `<div class="issue-drawer__section-label"><i class="bi bi-rulers"></i> Gap to style target</div><p class="issue-drawer__no-tip">Could not load gap.</p>`;
      positionNear(drawerEl, null);
    });
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

// Fill the recommended-reading + editable-search sections from the tip's
// resource links. Both are no-ops (left empty, hidden via :empty) when absent.
function renderResources(readingSec, searchSec, resources, meta) {
  const { curated, search } = partitionResources(resources);

  if (curated.length) {
    readingSec.innerHTML = `
      <div class="issue-drawer__section-label"><i class="bi bi-book"></i> Recommended reading</div>
      <div class="issue-drawer__links"></div>`;
    const wrap = readingSec.querySelector(".issue-drawer__links");
    for (const r of curated) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "issue-drawer__link";
      const icon = r.type === "video" ? "bi-play-circle" : "bi-book";
      btn.innerHTML = `
        <i class="bi ${icon} issue-drawer__link-icon"></i>
        <span class="issue-drawer__link-label">${escHtml(r.label)}</span>
        <i class="bi bi-box-arrow-up-right issue-drawer__link-ext"></i>`;
      btn.addEventListener("click", () => openExternal(r.url));
      wrap.appendChild(btn);
    }
  }

  if (search.length) {
    const seed = searchQueryFromResources(resources);
    searchSec.innerHTML = `
      <div class="issue-drawer__section-label"><i class="bi bi-search"></i> Search for tutorials</div>
      <input class="issue-drawer__search-input" type="text" aria-label="Search query" />
      <div class="issue-drawer__search-row">
        <button class="issue-drawer__search-btn" data-engine="google" type="button"><i class="bi bi-google"></i> Google</button>
        <button class="issue-drawer__search-btn" data-engine="youtube" type="button"><i class="bi bi-youtube"></i> YouTube</button>
      </div>`;
    const input = searchSec.querySelector(".issue-drawer__search-input");
    input.value = seed;
    searchSec.querySelector('[data-engine="google"]')
      .addEventListener("click", () => openExternal(googleUrl(input.value.trim())));
    searchSec.querySelector('[data-engine="youtube"]')
      .addEventListener("click", () => openExternal(youtubeUrl(input.value.trim())));
  }
}

function renderGap(gapSec, gap, meta) {
  const headerLabel = `<div class="issue-drawer__section-label"><i class="bi bi-rulers"></i> Gap to style target</div>`;
  if (!gap) {
    gapSec.innerHTML = `${headerLabel}<p class="issue-drawer__no-tip">No style profile gap available.</p>`;
    return;
  }
  const dim = meta.gap;
  const delta = gap[dim + "Delta"];
  if (typeof delta !== "number") {
    gapSec.innerHTML = `${headerLabel}<p class="issue-drawer__no-tip">No data for this dimension.</p>`;
    return;
  }
  const max = GAP_MAX[dim] || 1;
  const pct = Math.min(Math.abs(delta) / max * 50, 50);
  const pos = delta > 0;
  const sign = delta > 0 ? "+" : "";
  const dimLabel = dim === "castAngle" ? "Cast angle" : dim.charAt(0).toUpperCase() + dim.slice(1);
  gapSec.innerHTML = `
    ${headerLabel}
    <div class="issue-drawer__gap-row">
      <span class="issue-drawer__gap-label">${dimLabel}</span>
      <div class="issue-drawer__gap-bar-wrap">
        <div class="issue-drawer__gap-bar ${pos ? "issue-drawer__gap-bar--pos" : "issue-drawer__gap-bar--neg"}" style="width:${pct}%"></div>
      </div>
      <span class="issue-drawer__gap-delta">${sign}${delta.toFixed(2)}</span>
    </div>`;
}

// ---- EXIF helpers ----

function exifFor(imagePath) {
  if (!imagePath) return null;
  const img = state.get("images")?.find((r) => r.path === imagePath);
  return img?.exif || null;
}

function exifChips(exif) {
  if (!exif) return [];
  const chips = [];
  if (exif.iso != null) chips.push(`ISO ${exif.iso}`);
  if (exif.shutterSpeed) chips.push(String(exif.shutterSpeed));
  if (exif.aperture != null) chips.push(`f/${Number(exif.aperture).toFixed(1)}`);
  if (exif.focalLength != null) chips.push(`${Number(exif.focalLength).toFixed(0)} mm`);
  if (exif.wbMode) chips.push(`${exif.wbMode} WB`);
  return chips;
}

// Open an http/https URL outside the app (Electron shell), falling back to a
// new browser tab when the bridge isn't present (e.g. in a plain browser).
function openExternal(url) {
  if (!url) return;
  if (window.shellOpen && typeof window.shellOpen.external === "function") {
    window.shellOpen.external(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function makeSection() {
  const sec = document.createElement("div");
  sec.className = "issue-drawer__section";
  return sec;
}

// Position the panel below (or above) an anchor element.
// Called initially and after async content loads to reflow.
function positionNear(el, anchor) {
  if (!el) return;
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = el.getBoundingClientRect();
  const w = rect.width || PANEL_WIDTH;
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
