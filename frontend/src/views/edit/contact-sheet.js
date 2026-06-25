// Contact sheet — masonry grid of all uploaded images. Selection-aware,
// click toggles selection, double-click sets active. Per-card states cover
// uploading / decoding / analyzing / ready / error so progress stays visible.

import { gsap } from "../../../node_modules/gsap/index.js";
import { isReduced } from "../../motion.js";
import * as state from "../../state.js";
import { openLightbox } from "../../components/image-lightbox/index.js";
import { openIssueDrawer } from "../../components/issue-drawer/index.js";
import { getIssueMeta } from "../../components/issue-meta.js";

export function createContactSheet({ onAddMore } = {}) {
  const root = document.createElement("div");
  root.className = "contact-sheet";
  root.innerHTML = `
    <div class="contact-sheet__grid" role="list"></div>
    <footer class="contact-sheet__footer">
      <span class="contact-sheet__count" aria-live="polite">0 selected</span>
      <div class="contact-sheet__actions">
        <button class="btn-glass" data-action="select-all"><i class="bi bi-check-all"></i> Select all</button>
        <button class="btn-glass" data-action="select-none"><i class="bi bi-x-square"></i> Clear</button>
        <button class="btn-glass" data-action="add-more"><i class="bi bi-plus-lg"></i> Add more</button>
      </div>
    </footer>
  `;
  const grid = root.querySelector(".contact-sheet__grid");
  const countEl = root.querySelector(".contact-sheet__count");

  let cardByPath = new Map();

  function render() {
    const images = state.visibleImages();
    grid.innerHTML = "";
    cardByPath = new Map();
    if (!images.length) {
      grid.innerHTML = `
        <div class="contact-sheet__empty">
          <i class="bi bi-images"></i>
          <p>No images match this filter.</p>
        </div>`;
    } else {
      images.forEach((img) => {
        const card = makeCard(img);
        grid.appendChild(card);
        cardByPath.set(img.path, card);
      });
      if (!isReduced) {
        gsap.from([...grid.querySelectorAll(".contact-card")], {
          opacity: 0, y: 8, scale: 0.97,
          duration: 0.35, ease: "expo.out",
          stagger: { each: 0.04, from: "start" },
          clearProps: "transform",
        });
      }
    }
    syncCount();
  }

  function makeCard(img) {
    const card = document.createElement("article");
    card.className = "contact-card";
    card.setAttribute("role", "listitem");
    card.tabIndex = 0;
    card.dataset.path = img.path;
    card.classList.toggle("is-selected", !!img.selected);
    card.classList.toggle("is-active", img.path === state.get("currentImagePath"));
    card.classList.toggle(`is-state-${img.state || "ready"}`, true);

    card.innerHTML = `
      <div class="contact-card__thumb"></div>
      <div class="contact-card__overlay"></div>
      <div class="contact-card__check" aria-hidden="true"><i class="bi bi-check-lg"></i></div>
      <div class="contact-card__progress"><div class="bar"></div></div>
      <footer class="contact-card__meta">
        <span class="contact-card__name" title=""></span>
        <span class="contact-card__issues"></span>
      </footer>
    `;
    if (img.url) {
      const im = new Image();
      im.alt = img.name || "";
      im.src = img.url;
      card.querySelector(".contact-card__thumb").appendChild(im);
    }
    const nameEl = card.querySelector(".contact-card__name");
    nameEl.textContent = img.name || filenameOf(img.path);
    nameEl.title = img.name || filenameOf(img.path);

    renderCardMeta(card, img);

    card.addEventListener("click", (e) => {
      // Ctrl/Cmd-click → toggle selection without opening preview.
      if (e.metaKey || e.ctrlKey) {
        state.toggleSelected(img.path);
        return;
      }
      // Plain click → open fullscreen preview. Also set as active so the
      // agent rail and analysis ribbon track this image.
      state.setActiveByPath(img.path);
      const current = state.get("images").find((r) => r.path === img.path);
      const src = current?.url || img.url;
      if (src) {
        openLightbox({ src, name: img.name || filenameOf(img.path) });
      }
    });
    card.addEventListener("dblclick", () => {
      state.setActiveByPath(img.path);
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); state.setActiveByPath(img.path); }
      else if (e.key === " ") { e.preventDefault(); state.toggleSelected(img.path); }
    });

    return card;
  }

  function syncCount() {
    const total = state.get("images").length;
    const selected = state.getSelectedPaths().length;
    countEl.textContent = `${selected} selected · ${total} total`;
  }

  // ---- Public API: incremental updates so we don't rebuild on every event ---

  function patchCard(path) {
    const img = state.get("images").find((r) => r.path === path);
    if (!img) return;
    const card = cardByPath.get(path);
    if (!card) { render(); return; }   // fall back to full re-render if filter changed
    card.classList.toggle("is-selected", !!img.selected);
    card.classList.toggle("is-active", img.path === state.get("currentImagePath"));
    // State class swap
    card.className = card.className.replace(/\bis-state-\S+/g, "").trim();
    card.classList.add(`is-state-${img.state || "ready"}`);
    if (img.url && !card.querySelector(".contact-card__thumb img")) {
      const im = new Image();
      im.alt = img.name || "";
      im.src = img.url;
      card.querySelector(".contact-card__thumb").appendChild(im);
    } else if (img.url) {
      const im = card.querySelector(".contact-card__thumb img");
      if (im && im.src !== img.url) im.src = img.url;
    }
    renderCardMeta(card, img);
  }

  function bind() {
    const unsubs = [
      state.on("images", render),
      state.on("filterIssue", render),
      state.on("activeIndex", () => {
        for (const card of cardByPath.values()) {
          card.classList.toggle("is-active", card.dataset.path === state.get("currentImagePath"));
        }
      }),
      state.on("selectedPaths", () => {
        for (const card of cardByPath.values()) {
          const img = state.get("images").find((r) => r.path === card.dataset.path);
          if (img) card.classList.toggle("is-selected", !!img.selected);
        }
        syncCount();
      }),
    ];
    return () => { for (const u of unsubs) u(); };
  }

  function renderCardMeta(card, img) {
    const isBusy = img.state === "uploading" || img.state === "decoding" || img.state === "analyzing";
    card.classList.toggle("is-busy", isBusy);
    const issuesEl = card.querySelector(".contact-card__issues");
    if (isBusy) {
      const labels = { uploading: "Uploading…", decoding: "Decoding…", analyzing: "Analyzing…" };
      issuesEl.innerHTML = `<span class="contact-card__state-label">${labels[img.state] || ""}</span>`;
    } else {
      issuesEl.innerHTML = "";
      if (Array.isArray(img.issues) && img.issues.length) {
        const shown = img.issues.slice(0, 4);
        for (const issue of shown) {
          const meta = getIssueMeta(issue);
          const dot = document.createElement("button");
          dot.type = "button";
          dot.className = `issue-dot issue-dot--${meta.family}`;
          dot.title = meta.label;
          dot.addEventListener("click", (e) => {
            e.stopPropagation();
            openIssueDrawer(issue, dot, { imagePath: img.path });
          });
          issuesEl.appendChild(dot);
        }
        if (img.issues.length > 4) {
          const more = document.createElement("span");
          more.className = "issue-dot issue-dot--more";
          more.textContent = `+${img.issues.length - 4}`;
          issuesEl.appendChild(more);
        }
      }
    }
    const bar = card.querySelector(".contact-card__progress .bar");
    if (bar && !isBusy) bar.style.width = "";
  }

  function updateProgress(path, progress) {
    const card = cardByPath.get(path);
    if (!card) return;
    const bar = card.querySelector(".contact-card__progress .bar");
    if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
  }

  // Footer actions
  root.querySelector('[data-action="select-all"]').addEventListener("click", () => state.selectAll(true));
  root.querySelector('[data-action="select-none"]').addEventListener("click", () => state.selectAll(false));
  root.querySelector('[data-action="add-more"]').addEventListener("click", () => onAddMore?.());

  return {
    el: root,
    render,
    patchCard,
    updateProgress,
    bind,
    destroy() {/* unsub returned from bind() */},
  };
}

function filenameOf(p) {
  if (!p) return "";
  const seg = String(p).split(/[\\/]/);
  return seg[seg.length - 1] || p;
}
