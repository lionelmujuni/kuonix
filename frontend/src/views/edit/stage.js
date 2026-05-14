// Image stage — single-image canvas with crossfade on update.
// Phase 1 just shows the image; Phase 2 layers preview/before-after over it.

import { gsap } from "../../../node_modules/gsap/index.js";
import { isReduced } from "../../motion.js";

export function createImageStage() {
  const root = document.createElement("div");
  root.className = "image-stage";
  root.innerHTML = `
    <div class="image-stage__canvas">
      <img class="image-stage__img image-stage__img--a" alt="" />
      <img class="image-stage__img image-stage__img--b" alt="" />
      <p class="image-stage__placeholder">Loading…</p>
    </div>
  `;

  const placeholder = root.querySelector(".image-stage__placeholder");
  const layers = [
    root.querySelector(".image-stage__img--a"),
    root.querySelector(".image-stage__img--b"),
  ];
  let active = 0;

  function setImage(src) {
    if (!src) return;
    const next = layers[1 - active];
    const prev = layers[active];

    return new Promise((resolve) => {
      const onLoad = () => {
        placeholder.style.display = "none";
        if (isReduced) {
          gsap.set(next, { opacity: 1 });
          gsap.set(prev, { opacity: 0 });
        } else {
          gsap.to(next, { opacity: 1, duration: 0.5, ease: "power2.out" });
          gsap.to(prev, { opacity: 0, duration: 0.5, ease: "power2.out" });
        }
        active = 1 - active;
        next.removeEventListener("load", onLoad);
        next.removeEventListener("error", onErr);
        resolve();
      };
      const onErr = () => {
        placeholder.textContent = "Couldn’t load image.";
        placeholder.style.display = "";
        next.removeEventListener("load", onLoad);
        next.removeEventListener("error", onErr);
        resolve();
      };
      next.addEventListener("load", onLoad);
      next.addEventListener("error", onErr);
      next.src = src;
    });
  }

  function setPlaceholder(text) {
    placeholder.textContent = text;
    placeholder.style.display = "";
  }

  function clear() {
    layers.forEach((l) => { l.removeAttribute("src"); l.style.opacity = 0; });
    setPlaceholder("Loading…");
  }

  return { el: root, setImage, setPlaceholder, clear };
}
