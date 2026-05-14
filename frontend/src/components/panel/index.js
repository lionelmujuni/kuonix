// Unified panel system — the canonical "side-anchored panel" pattern for
// Kuonix. All sliding panels and modals are built on this so they share one
// motion grammar, one focus model, one dismissal contract.
//
// Lifecycle:
//   const panel = createPanel({ side: "right", title: "Adjust", render });
//   await panel.open();
//   // ...interaction...
//   await panel.close();
//
// Behaviour (cohesive principle):
//   • Backdrop fades in on its own track (200ms power2.out), then panel
//     slides in from `side` (380ms cubic-bezier(.16,1,.3,1)) — entries are
//     slow and eased-out. Backdrop never gates the panel.
//   • Exit reverses with the symmetric exit ease (.7,0,.84,0) at 220ms — fast
//     and eased-in. Two-speed rule.
//   • Body content gets a stagger-reveal once the panel settles so list rows
//     "land" rather than appearing flat.
//   • Esc closes. Backdrop click closes (unless dismissOnBackdrop=false).
//   • Focus moves into the panel on open (close button or first focusable),
//     restored to previous element on close. Tab is naturally trapped because
//     the overlay sits on top of the rest of the DOM.
//   • Multiple panels stack (z-indexed by mount order). Each registers its
//     own keydown so Esc only closes the topmost.
//
// Place exactly one #panel-host in the DOM at app boot — createPanel will
// create one lazily if missing.

import { gsap } from "../../../node_modules/gsap/index.js";
import {
  openPanel as motionOpenPanel,
  closePanel as motionClosePanel,
  fadeBackdrop,
  staggerReveal,
  isReduced,
} from "../../motion.js";

let panelStack = [];   // currently open panels (top of stack handles Esc)

export function createPanel({
  side = "right",
  width = 380,
  title = "",
  subtitle = "",
  render = null,
  onClose = null,
  dismissOnBackdrop = true,
  className = "",
} = {}) {
  const host = ensureHost();

  const overlay = document.createElement("div");
  overlay.className = "panel-overlay";

  const backdrop = document.createElement("div");
  backdrop.className = "panel-backdrop";
  backdrop.style.opacity = "0";

  const panel = document.createElement("aside");
  panel.className = `panel panel--${side} ${className}`.trim();
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  if (title) panel.setAttribute("aria-label", title);
  panel.style.setProperty(
    "--panel-width",
    typeof width === "number" ? `${width}px` : width,
  );

  panel.innerHTML = `
    <header class="panel__head">
      <div class="panel__head-text">
        <h3 class="panel__title">${escapeHtml(title)}</h3>
        ${subtitle ? `<p class="panel__subtitle">${escapeHtml(subtitle)}</p>` : ""}
      </div>
      <button class="panel__close icon-btn" aria-label="Close panel" type="button">
        <i class="bi bi-x-lg"></i>
      </button>
    </header>
    <div class="panel__body" data-panel-body></div>
  `;

  const body = panel.querySelector("[data-panel-body]");

  overlay.appendChild(backdrop);
  overlay.appendChild(panel);

  // ---- Lifecycle ----
  let isOpen = false;
  let prevFocus = null;

  function onKeydown(e) {
    // Only the topmost panel handles Esc.
    if (panelStack[panelStack.length - 1] !== api) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  async function open() {
    if (isOpen) return;
    isOpen = true;
    prevFocus = document.activeElement;

    // Render lazily so the consumer can see `body` after createPanel() but
    // before open() if they want.
    if (typeof render === "function") {
      const out = render(body);
      if (out instanceof Node) body.appendChild(out);
      else if (typeof out === "string") body.innerHTML = out;
    }

    host.appendChild(overlay);
    panelStack.push(api);

    // Animate backdrop and panel on independent tracks. Don't await fade —
    // panel motion shouldn't be gated on it.
    fadeBackdrop(backdrop, true);
    await motionOpenPanel(panel, { side });

    // Stagger-reveal first-level body children once panel has settled.
    const targets = collectStaggerTargets(body);
    if (targets.length) staggerReveal(targets);

    // Focus management.
    const firstFocusable =
      body.querySelector(
        'input, select, textarea, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || panel.querySelector(".panel__close");
    firstFocusable?.focus({ preventScroll: true });

    document.addEventListener("keydown", onKeydown, true);
  }

  async function close() {
    if (!isOpen) return;
    isOpen = false;
    document.removeEventListener("keydown", onKeydown, true);
    fadeBackdrop(backdrop, false);
    await motionClosePanel(panel, { side });
    overlay.remove();
    panelStack = panelStack.filter((p) => p !== api);
    if (prevFocus?.focus) prevFocus.focus({ preventScroll: true });
    onClose?.();
  }

  // Wire close button + backdrop.
  panel.querySelector(".panel__close").addEventListener("click", close);
  if (dismissOnBackdrop) backdrop.addEventListener("click", close);

  const api = {
    el: panel,
    overlay,
    body,
    open,
    close,
    get isOpen() { return isOpen; },
  };
  return api;
}

// ---------------------------------------------------------------------------

function ensureHost() {
  let host = document.getElementById("panel-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "panel-host";
    document.body.appendChild(host);
  }
  return host;
}

// First-level children that should stagger in after panel entry settles.
// We pick semantic blocks (sections, footers, top-level nav) over individual
// inputs to keep the reveal calm.
function collectStaggerTargets(body) {
  const direct = Array.from(body.children);
  // If the consumer rendered a single wrapper, look one level deeper.
  if (direct.length === 1 && direct[0].children.length > 1) {
    return Array.from(direct[0].children);
  }
  return direct;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
