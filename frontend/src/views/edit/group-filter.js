// Group-by-issue filter chips. Counts are computed from state.images and
// re-rendered when issues change. Click selects all images with that issue.

import { gsap } from "../../../node_modules/gsap/index.js";
import { isReduced } from "../../motion.js";
import * as state from "../../state.js";

const ISSUE_LABELS = {
  UNDEREXPOSED: "Underexposed",
  OVEREXPOSED: "Overexposed",
  LOW_CONTRAST: "Low contrast",
  HIGH_CONTRAST: "High contrast",
  LOW_SATURATION: "Low saturation",
  HIGH_SATURATION: "High saturation",
  COLOR_CAST_WARM: "Warm cast",
  COLOR_CAST_COOL: "Cool cast",
  COLOR_CAST_GREEN: "Green cast",
  COLOR_CAST_MAGENTA: "Magenta cast",
  SHADOW_NOISE: "Shadow noise",
  HIGHLIGHT_CLIP: "Highlights clipped",
  SOFT_FOCUS: "Soft focus",
};

export function createGroupFilter() {
  const root = document.createElement("div");
  root.className = "group-filter";
  root.setAttribute("aria-label", "Filter by issue");

  function render() {
    const images = state.get("images");
    const counts = new Map();
    for (const img of images) {
      const arr = Array.isArray(img.issues) ? img.issues : [];
      for (const issue of arr) counts.set(issue, (counts.get(issue) || 0) + 1);
    }
    const total = images.length;
    const filter = state.get("filterIssue");

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const chips = [
      { id: null, label: "All", count: total },
      ...sorted.map(([id, count]) => ({ id, label: ISSUE_LABELS[id] || prettify(id), count })),
    ];

    root.innerHTML = "";
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
          for (const img of images) state.toggleSelected(img.path, (img.issues || []).includes(chip.id));
        }
      });
      root.appendChild(el);
    });

    if (!isReduced) {
      gsap.from(root.querySelectorAll(".group-chip"), {
        opacity: 0, y: 4, duration: 0.25, ease: "expo.out",
        stagger: 0.03, clearProps: "transform",
      });
    }
  }

  const unsubs = [
    state.on("images", render),
    state.on("filterIssue", render),
  ];

  render();

  return {
    el: root,
    destroy() { for (const u of unsubs) u(); },
  };
}

function prettify(s) {
  return String(s || "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
