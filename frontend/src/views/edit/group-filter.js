// Group-by-issue filter chips. Counts are computed from state.images and
// re-rendered when issues change. Click selects all images with that issue.

import { gsap } from "../../../node_modules/gsap/index.js";
import { isReduced } from "../../motion.js";
import * as state from "../../state.js";
import { getIssueMeta } from "../../components/issue-meta.js";

export function createGroupFilter() {
  const root = document.createElement("div");
  root.className = "group-filter";
  root.setAttribute("aria-label", "Filter by issue");

  // id ("" === All) → { el, countEl }
  let chipEls = new Map();

  function computeChips() {
    const images = state.get("images");
    const counts = new Map();
    for (const img of images) {
      const arr = Array.isArray(img.issues) ? img.issues : [];
      for (const issue of arr) counts.set(issue, (counts.get(issue) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return [
      { id: null, label: "All", count: images.length },
      ...sorted.map(([id, count]) => ({ id, label: getIssueMeta(id).label, count })),
    ];
  }

  // Full rebuild — only when the *set* of chips changes (an issue appears or
  // disappears). Animates the chips in.
  function rebuild(chips) {
    const filter = state.get("filterIssue");
    root.innerHTML = "";
    chipEls = new Map();
    chips.forEach((chip) => {
      const el = document.createElement("button");
      el.className = "group-chip" + (chip.id === filter ? " is-active" : "");
      el.type = "button";
      el.dataset.id = chip.id ?? "";
      el.innerHTML = `
        <span class="group-chip__label">${escapeHtml(chip.label)}</span>
        <span class="group-chip__count">${chip.count}</span>
      `;
      el.addEventListener("click", () => {
        state.setFilterIssue(chip.id);
        if (chip.id) {
          // Quality of life: clicking a chip selects the matching set.
          for (const img of state.get("images")) {
            state.toggleSelected(img.path, (img.issues || []).includes(chip.id));
          }
        }
      });
      root.appendChild(el);
      chipEls.set(chip.id ?? "", { el, countEl: el.querySelector(".group-chip__count") });
    });

    if (!isReduced) {
      gsap.from([...root.querySelectorAll(".group-chip")], {
        opacity: 0, y: 4, duration: 0.25, ease: "expo.out",
        stagger: 0.03, clearProps: "transform",
      });
    }
  }

  // Cheap update — same chips, just refreshed counts + active highlight. No DOM
  // teardown, no animation, so analysis ticks don't make the chips flicker.
  function patch(chips) {
    const filter = state.get("filterIssue");
    for (const chip of chips) {
      const ref = chipEls.get(chip.id ?? "");
      if (!ref) return;
      if (ref.countEl.textContent !== String(chip.count)) ref.countEl.textContent = chip.count;
      ref.el.classList.toggle("is-active", chip.id === filter);
    }
  }

  function render() {
    const chips = computeChips();
    const ids = chips.map((c) => c.id ?? "");
    const sameSet = ids.length === chipEls.size && ids.every((id) => chipEls.has(id));
    if (sameSet) patch(chips);
    else rebuild(chips);
  }

  const unsubs = [
    state.on("images", render),       // membership: chip set may change
    state.on("image", render),        // a card's issues changed → counts
    state.on("filterIssue", render),  // active highlight
  ];

  render();

  return {
    el: root,
    destroy() { for (const u of unsubs) u(); },
  };
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
