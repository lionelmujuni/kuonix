// History strip — horizontal row of commit thumbnails. Lives sticky-top
// inside the agent stream, hidden until the first commit lands.
// Clicking a node emits STAGE_RESTORE so the stage swaps in that commit.

import { gsap } from "../../../node_modules/gsap/index.js";
import { isReduced } from "../../motion.js";
import { emit, EVENTS } from "../../bus.js";

export function createHistoryStrip() {
  const root = document.createElement("div");
  root.className = "history-strip";
  root.hidden = true;
  root.innerHTML = `
    <span class="history-strip__label">
      <i class="bi bi-clock-history"></i> Edits
    </span>
  `;

  let nodes = [];   // [{ el, path, base64, method }, ...]
  let currentPath = null;

  function addCommit({ workingPath, base64, method }) {
    if (!workingPath) return;
    // De-dupe — if the agent retries a commit at the same path, replace.
    const existing = nodes.findIndex((n) => n.path === workingPath);
    if (existing >= 0) {
      nodes[existing].el.remove();
      nodes.splice(existing, 1);
    }

    const el = document.createElement("button");
    el.className = "history-strip__node";
    el.type = "button";
    el.title = `${prettyMethod(method)} · ${filenameOf(workingPath)}`;
    el.innerHTML = `
      <span class="step-num">${nodes.length + 1}</span>
      ${base64 ? `<img alt="" />` : ""}
    `;
    if (base64) el.querySelector("img").src = base64;
    el.addEventListener("click", () => {
      setCurrent(workingPath);
      emit(EVENTS.STAGE_RESTORE, { src: base64, path: workingPath });
    });

    root.appendChild(el);
    nodes.push({ el, path: workingPath, base64, method });
    setCurrent(workingPath);

    if (root.hidden) {
      root.hidden = false;
      if (!isReduced) {
        gsap.fromTo(root,
          { opacity: 0, y: -6 },
          { opacity: 1, y: 0, duration: 0.35, ease: "expo.out" });
      }
    }
    if (!isReduced) {
      gsap.fromTo(el,
        { opacity: 0, scale: 0.8 },
        { opacity: 1, scale: 1, duration: 0.35, ease: "expo.out" });
    }
    // Auto-scroll the new node into view.
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: isReduced ? "auto" : "smooth", inline: "end", block: "nearest" });
    });
  }

  function setCurrent(path) {
    currentPath = path;
    for (const n of nodes) n.el.classList.toggle("is-current", n.path === path);
  }

  function clear() {
    nodes.forEach((n) => n.el.remove());
    nodes = [];
    currentPath = null;
    root.hidden = true;
  }

  return { el: root, addCommit, setCurrent, clear, get count() { return nodes.length; } };
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
