// Fullscreen image lightbox.
//
// Usage:
//   import { openLightbox } from "../../components/image-lightbox/index.js";
//   openLightbox({ src, name });
//
// Opens a backdrop overlay with the image scaled to viewport. Closes on
// backdrop click, close button, or Escape key.

import { gsap } from "../../../node_modules/gsap/index.js";
import { isReduced } from "../../motion.js";

let overlay = null;
let imgEl = null;
let nameEl = null;
let closeBtn = null;
let keyHandler = null;

function ensureDom() {
  if (overlay) return;

  overlay = document.createElement("div");
  overlay.className = "image-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Image preview");

  overlay.innerHTML = `
    <button class="image-lightbox__close" aria-label="Close preview">
      <i class="bi bi-x-lg"></i>
    </button>
    <img class="image-lightbox__img" alt="" />
    <p class="image-lightbox__name"></p>
    <p class="image-lightbox__hint">ESC or click outside to close</p>
  `;

  imgEl    = overlay.querySelector(".image-lightbox__img");
  nameEl   = overlay.querySelector(".image-lightbox__name");
  closeBtn = overlay.querySelector(".image-lightbox__close");

  closeBtn.addEventListener("click", closeLightbox);

  // Backdrop click (but NOT on the image itself)
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeLightbox();
  });

  document.body.appendChild(overlay);
}

export function openLightbox({ src, name = "" }) {
  ensureDom();

  imgEl.src = "";
  nameEl.textContent = name;
  overlay.classList.add("is-open");

  gsap.to(overlay, { opacity: 1, duration: isReduced ? 0 : 0.22, ease: "power2.out" });

  imgEl.onload = () => {
    gsap.fromTo(imgEl,
      { opacity: 0, scale: isReduced ? 1 : 0.96 },
      { opacity: 1, scale: 1, duration: isReduced ? 0 : 0.3, ease: "expo.out" }
    );
  };
  imgEl.src = src;

  keyHandler = (e) => {
    if (e.key === "Escape") closeLightbox();
  };
  document.addEventListener("keydown", keyHandler);

  closeBtn.focus();
}

export function closeLightbox() {
  if (!overlay) return;
  if (keyHandler) {
    document.removeEventListener("keydown", keyHandler);
    keyHandler = null;
  }
  gsap.to(overlay, {
    opacity: 0,
    duration: isReduced ? 0 : 0.18,
    ease: "power2.in",
    onComplete: () => {
      overlay.classList.remove("is-open");
      imgEl.src = "";
    },
  });
}
