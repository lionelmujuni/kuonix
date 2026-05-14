// Toast — tiny singleton. GSAP slide in/out, auto-dismiss.

import { gsap } from "../../../node_modules/gsap/index.js";
import { isReduced } from "../../motion.js";

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement("div");
  container.className = "toast-container";
  document.body.appendChild(container);
  return container;
}

const ICONS = {
  info:    "bi-info-circle-fill",
  success: "bi-check-circle-fill",
  warning: "bi-exclamation-circle-fill",
  error:   "bi-exclamation-triangle-fill",
};

export function show(message, kind = "info", durationMs = 4200) {
  const root = ensureContainer();
  const el = document.createElement("div");
  el.className = `toast toast--${kind} glass-panel`;
  el.innerHTML = `
    <i class="bi ${ICONS[kind] || ICONS.info}" aria-hidden="true"></i>
    <span class="toast__message"></span>
    <button class="toast__close icon-btn" aria-label="Dismiss"><i class="bi bi-x"></i></button>
  `;
  el.querySelector(".toast__message").textContent = message;
  root.appendChild(el);

  if (isReduced) {
    gsap.set(el, { opacity: 1, x: 0 });
  } else {
    gsap.fromTo(el, { x: 24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "expo.out" });
  }

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    if (isReduced) { el.remove(); return; }
    gsap.to(el, {
      x: 24, opacity: 0, duration: 0.2, ease: "power2.in",
      onComplete: () => el.remove(),
    });
  };

  el.querySelector(".toast__close").addEventListener("click", dismiss);
  if (durationMs > 0) setTimeout(dismiss, durationMs);

  return { dismiss };
}

export const toast = {
  info:    (m, d) => show(m, "info", d),
  success: (m, d) => show(m, "success", d),
  warning: (m, d) => show(m, "warning", d),
  error:   (m, d) => show(m, "error", d),
};
