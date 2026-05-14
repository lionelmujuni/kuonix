// Library — session-wide gallery. Shows every image the user has uploaded so
// far this session, grouped by issue, with multiselect + "Open in Edit" jump.
//
// Persistence: in-memory only for v1 (matches the Phase 0 spec). When the app
// restarts, the library starts empty.

import { gsap } from "../../../node_modules/gsap/index.js";
import { enterView, isReduced } from "../../motion.js";
import * as state from "../../state.js";
import { navigate } from "../../router.js";
import { toast } from "../../components/toast/index.js";
import { openLightbox } from "../../components/image-lightbox/index.js";

let ctx = null;
let imagesUnsub = null;
let outletRef = null;
let particleCleanup = null;
let emptyAnimated = false;

const ISSUE_LABELS = {
  ColorCast_Cool:        { label: "Cool cast",        color: "180, 200, 255" },
  ColorCast_Warm:        { label: "Warm cast",        color: "255, 190, 140" },
  Underexposed:          { label: "Underexposed",     color: "120, 130, 150" },
  Overexposed:           { label: "Overexposed",      color: "255, 230, 150" },
  LowContrast:           { label: "Low contrast",     color: "150, 160, 170" },
  HighContrast:          { label: "High contrast",    color: "70, 80, 90"   },
  LowSaturation:         { label: "Low saturation",   color: "180, 180, 200" },
  HighSaturation:        { label: "Oversaturated",    color: "255, 100, 200" },
  Noisy:                 { label: "Noisy",            color: "180, 130, 110" },
  Blurry:                { label: "Blurry",           color: "120, 110, 180" },
  SkinTone_Off:          { label: "Skin tone off",    color: "230, 170, 150" },
};

function labelFor(id) { return ISSUE_LABELS[id]?.label || id; }
function colorFor(id) { return ISSUE_LABELS[id]?.color || "var(--accent-color-rgb)"; }

export function mount(outlet) {
  outletRef = outlet;
  outlet.innerHTML = "";

  const view = document.createElement("section");
  view.className = "view library-view";
  view.dataset.view = "library";
  outlet.appendChild(view);

  view.innerHTML = `
    <header class="view-header library__header">
      <div>
        <p class="eyebrow">Library</p>
        <h1 class="display-heading">Session gallery</h1>
        <p class="muted library__subtitle"></p>
      </div>
      <div class="library__actions">
        <button class="btn btn--ghost" data-action="select-all">
          <i class="bi bi-check2-square"></i> Select all
        </button>
        <button class="btn btn--ghost" data-action="clear">
          <i class="bi bi-trash3"></i> Clear session
        </button>
        <button class="btn btn--accent" data-action="open" disabled>
          <i class="bi bi-arrow-up-right-square"></i> Open in Edit
        </button>
      </div>
    </header>

    <div class="library__filters reveal" data-filters></div>
    <div class="library__grid reveal" data-grid></div>
    <div class="library__empty" data-empty hidden>
      <div class="empty-stage">
        <canvas class="empty-particles" aria-hidden="true"></canvas>
        <img class="empty-illustration" src="src/assets/empty-library.svg"
             alt="" draggable="false" />
      </div>
      <p class="empty-headline">No Pictures</p>
      <p class="empty-sub">Drop RAW files onto the Edit view to begin.</p>
      <button class="btn btn--accent" data-action="goto-edit">
        <i class="bi bi-images"></i> Go to Edit
      </button>
    </div>

    <style>
      .library-view { padding: 28px 32px 80px; min-height: 100%; }
      .library__header {
        display: flex; align-items: flex-end; justify-content: space-between;
        gap: 24px; margin-bottom: 24px; flex-wrap: wrap;
      }
      .library__subtitle { margin-top: 6px; }
      .library__actions { display: flex; gap: 8px; }

      .library__filters {
        display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;
        min-height: 36px;
      }
      .library__chip {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 12px; border-radius: 999px;
        background: var(--color-secondary); border: 1px solid var(--color-border);
        color: var(--color-text); font-size: 12px; cursor: pointer;
        transition: background var(--duration-fast) var(--ease-standard);
      }
      .library__chip:hover { background: var(--color-secondary-hover); }
      .library__chip.is-active {
        background: var(--accent-color); color: #fff; border-color: transparent;
        box-shadow: 0 2px 8px rgba(var(--accent-color-rgb), 0.3);
      }
      .library__chip__dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: rgb(var(--chip-rgb, 120, 120, 120));
      }
      .library__chip.is-active .library__chip__dot { background: #fff; }
      .library__chip__count { opacity: 0.7; font-variant-numeric: tabular-nums; }

      .library__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 16px;
      }

      .lib-card {
        position: relative; aspect-ratio: 1 / 1; border-radius: 14px;
        overflow: hidden; cursor: pointer; isolation: isolate;
        background: var(--color-secondary); border: 1px solid var(--color-border);
        transition: transform var(--duration-fast) var(--ease-standard),
                    box-shadow var(--duration-fast) var(--ease-standard);
      }
      .lib-card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(0,0,0,0.18); }
      .lib-card.is-selected { box-shadow: 0 0 0 2px var(--accent-color), 0 8px 24px rgba(var(--accent-color-rgb), 0.3); }
      .lib-card.is-active { box-shadow: 0 0 0 2px var(--accent-color), 0 0 0 5px rgba(var(--accent-color-rgb), 0.25); }
      .lib-card__img {
        width: 100%; height: 100%; object-fit: cover; display: block;
        transition: transform 0.4s var(--ease-standard);
      }
      .lib-card:hover .lib-card__img { transform: scale(1.04); }
      .lib-card__placeholder {
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        color: var(--color-text-secondary); font-size: 22px;
      }

      .lib-card__check {
        position: absolute; top: 8px; left: 8px;
        width: 22px; height: 22px; border-radius: 6px;
        background: rgba(0,0,0,0.55); color: #fff;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; backdrop-filter: blur(8px);
      }
      .lib-card.is-selected .lib-card__check {
        background: var(--accent-color);
      }

      .lib-card__state {
        position: absolute; top: 8px; right: 8px;
        padding: 4px 8px; border-radius: 6px; font-size: 10px;
        text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;
        background: rgba(0,0,0,0.65); color: #fff; backdrop-filter: blur(8px);
      }
      .lib-card__state.is-ready { background: rgba(76, 175, 80, 0.9); }
      .lib-card__state.is-error { background: rgba(227, 87, 71, 0.9); }
      .lib-card__state.is-busy  { background: rgba(33, 128, 141, 0.9); }

      .lib-card__meta {
        position: absolute; left: 0; right: 0; bottom: 0;
        padding: 10px 10px 8px;
        background: linear-gradient(transparent, rgba(0,0,0,0.7));
        color: #fff; font-size: 11px; line-height: 1.3;
      }
      .lib-card__name {
        font-weight: 600; white-space: nowrap; overflow: hidden;
        text-overflow: ellipsis;
      }
      .lib-card__issues {
        display: flex; gap: 4px; margin-top: 5px; flex-wrap: wrap;
      }
      .lib-card__dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: rgb(var(--issue-rgb));
        box-shadow: 0 0 0 1.5px rgba(0,0,0,0.4);
      }

      .library__empty {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; padding: 60px 24px; gap: 16px;
        text-align: center; color: var(--color-text-secondary);
      }
      .empty-stage {
        position: relative; width: 560px; max-width: 92vw;
        aspect-ratio: 16 / 9;
      }
      .empty-illustration {
        position: absolute; inset: 0; width: 100%; height: 100%;
        object-fit: contain; opacity: 0.55;
        filter: saturate(0);
      }
      .empty-particles {
        position: absolute; inset: 0; width: 100%; height: 100%;
        pointer-events: none;
      }
      .empty-headline {
        font-size: 28px; font-weight: 600; letter-spacing: -0.02em;
        color: var(--color-text);
      }
      .empty-sub { font-size: 14px; max-width: 280px; line-height: 1.6; }
    </style>
  `;

  bindActions(view);
  render(view);

  imagesUnsub = state.on("images", () => render(view));
  state.on("filterIssue", () => render(view));
  state.on("activeIndex", () => render(view));

  ctx = enterView(outlet);
}

export function unmount() {
  imagesUnsub?.(); imagesUnsub = null;
  particleCleanup?.(); particleCleanup = null;
  emptyAnimated = false;
  ctx?.revert?.();
  ctx = null;
  outletRef = null;
}

// ---------------------------------------------------------------------------

function animateEmptyIn(emptyEl) {
  if (isReduced) {
    gsap.set(emptyEl, { opacity: 1 });
    return;
  }
  const illus  = emptyEl.querySelector(".empty-illustration");
  const hdline = emptyEl.querySelector(".empty-headline");
  const sub    = emptyEl.querySelector(".empty-sub");
  const btn    = emptyEl.querySelector(".btn");

  // Fade in the container first, then stagger the children.
  gsap.from(emptyEl, { opacity: 0, duration: dur.enter, ease: ease.enter });

  gsap.from([illus, hdline, sub, btn], {
    opacity: 0, y: 18, duration: dur.reveal, ease: ease.enter,
    stagger: 0.08, delay: 0.2,
  });

  // Idle breathing loop on illustration.
  gsap.to(illus, {
    y: -7, duration: 3.2, ease: "sine.inOut",
    yoyo: true, repeat: -1, delay: 0.6,
  });
}

function mountParticles(canvas) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width  = canvas.offsetWidth  || 420;
  const H = canvas.height = canvas.offsetHeight || 236;
  const COUNT = 38;

  const particles = Array.from({ length: COUNT }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: 1 + Math.random() * 2.5,
    speed: 0.18 + Math.random() * 0.28,
    sway: (Math.random() - 0.5) * 0.4,
    alpha: 0.1 + Math.random() * 0.35,
    phase: Math.random() * Math.PI * 2,
  }));

  let raf;
  let t = 0;

  function tick() {
    const accentRgb = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent-color-rgb").trim() || "199, 200, 201";
    ctx.clearRect(0, 0, W, H);
    t += 0.012;
    for (const p of particles) {
      p.y -= p.speed;
      p.x += Math.sin(t + p.phase) * p.sway;
      if (p.y < -p.r) {
        p.y = H + p.r;
        p.x = Math.random() * W;
      }
      const edgeDist = Math.min(p.x / W, 1 - p.x / W, p.y / H, 1 - p.y / H);
      const a = p.alpha * Math.min(1, edgeDist * 10);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${accentRgb}, ${a})`;
      ctx.fill();
    }
    raf = requestAnimationFrame(tick);
  }

  tick();
  return () => cancelAnimationFrame(raf);
}

function bindActions(view) {
  view.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "select-all") {
      const all = state.get("images");
      const allSelected = all.length > 0 && all.every((r) => r.selected);
      state.selectAll(!allSelected);
    } else if (action === "clear") {
      if (state.get("images").length === 0) return;
      if (!confirm("Clear all images from this session?")) return;
      state.clearImages();
      toast.info("Library cleared.");
    } else if (action === "open") {
      const sel = state.getSelectedPaths();
      if (!sel.length) return;
      // Make the first selected image active, then jump to Edit.
      state.setActiveByPath(sel[0]);
      navigate("edit");
    } else if (action === "goto-edit") {
      navigate("edit");
    }
  });
}

function render(view) {
  const images = state.get("images");
  const filter = state.get("filterIssue");
  const activePath = state.get("currentImagePath");

  // Subtitle + open-in-edit affordance.
  const subtitle = view.querySelector(".library__subtitle");
  const total = images.length;
  const ready = images.filter((r) => r.state === "ready").length;
  const sel = images.filter((r) => r.selected).length;
  subtitle.textContent = total === 0
    ? "Nothing yet — drop images on Edit to populate the library."
    : `${total} image${total === 1 ? "" : "s"} · ${ready} analysed · ${sel} selected`;

  const openBtn = view.querySelector("[data-action='open']");
  openBtn.disabled = sel === 0;

  // Empty state.
  const empty = view.querySelector("[data-empty]");
  const grid = view.querySelector("[data-grid]");
  const filters = view.querySelector("[data-filters]");
  const wasHidden = empty.hidden;
  empty.hidden = total > 0;
  grid.hidden = total === 0;
  filters.hidden = total === 0;

  if (total === 0) {
    if (wasHidden && !empty.hidden) {
      // Empty state just became visible — kick off animation + particles.
      animateEmptyIn(empty);
      const canvas = empty.querySelector(".empty-particles");
      if (canvas) {
        particleCleanup?.();
        let cancelled = false;
        particleCleanup = () => { cancelled = true; };
        requestAnimationFrame(() => {
          if (!cancelled) particleCleanup = mountParticles(canvas);
        });
      }
    } else if (!emptyAnimated) {
      // First render already empty (e.g. on mount).
      emptyAnimated = true;
      animateEmptyIn(empty);
      const canvas = empty.querySelector(".empty-particles");
      if (canvas) {
        particleCleanup?.();
        let cancelled = false;
        particleCleanup = () => { cancelled = true; };
        requestAnimationFrame(() => {
          if (!cancelled) particleCleanup = mountParticles(canvas);
        });
      }
    }
    return;
  }

  // Images present — stop particles to save resources.
  particleCleanup?.(); particleCleanup = null;
  emptyAnimated = false;

  // Filter chips.
  renderFilters(filters, images, filter);

  // Visible images (respect filter).
  const visible = filter
    ? images.filter((r) => Array.isArray(r.issues) && r.issues.includes(filter))
    : images;

  // Cards.
  grid.innerHTML = visible.map((r) => cardHtml(r, r.path === activePath)).join("");

  // Click handlers.
  grid.querySelectorAll(".lib-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      const path = card.dataset.path;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        state.toggleSelected(path);
      } else if (e.target.closest(".lib-card__check")) {
        state.toggleSelected(path);
      } else {
        // Plain click: open fullscreen preview without leaving the Library.
        const current = state.get("images").find((r) => r.path === path);
        const src = current?.url;
        if (src) {
          openLightbox({ src, name: current?.name || path.split(/[\\/]/).pop() });
        }
      }
    });
  });

  // Subtle stagger on first paint after a render.
  if (!isReduced) {
    gsap.from(grid.querySelectorAll(".lib-card"), {
      opacity: 0, y: 8, duration: 0.3, ease: "expo.out",
      stagger: { each: 0.02, from: "start" },
      clearProps: "all",
    });
  }
}

function renderFilters(filtersEl, images, filter) {
  const counts = {};
  for (const img of images) {
    for (const iss of (img.issues || [])) counts[iss] = (counts[iss] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = images.length;

  filtersEl.innerHTML = `
    <button class="library__chip ${!filter ? "is-active" : ""}" data-filter="">
      <span class="library__chip__dot" style="--chip-rgb: var(--accent-color-rgb);"></span>
      All <span class="library__chip__count">${total}</span>
    </button>
    ${entries.map(([id, n]) => `
      <button class="library__chip ${filter === id ? "is-active" : ""}"
              data-filter="${id}" style="--chip-rgb: ${colorFor(id)};">
        <span class="library__chip__dot"></span>
        ${labelFor(id)} <span class="library__chip__count">${n}</span>
      </button>
    `).join("")}
  `;

  filtersEl.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.filter || null;
      state.setFilterIssue(id);
    });
  });
}

function cardHtml(img, isActive) {
  const stateClass =
    img.state === "ready" ? "is-ready" :
    img.state === "error" ? "is-error" :
    "is-busy";
  const issueDots = (img.issues || []).slice(0, 6).map((iss) =>
    `<span class="lib-card__dot" style="--issue-rgb: ${colorFor(iss)};" title="${labelFor(iss)}"></span>`
  ).join("");
  const thumb = img.url
    ? `<img class="lib-card__img" src="${img.url}" alt="${img.name || ""}">`
    : `<div class="lib-card__placeholder"><i class="bi bi-image"></i></div>`;

  return `
    <div class="lib-card ${img.selected ? "is-selected" : ""} ${isActive ? "is-active" : ""}"
         data-path="${img.path}">
      ${thumb}
      <div class="lib-card__check">${img.selected ? '<i class="bi bi-check"></i>' : ""}</div>
      <div class="lib-card__state ${stateClass}">${img.state || "idle"}</div>
      <div class="lib-card__meta">
        <div class="lib-card__name">${img.name || img.path.split(/[\\/]/).pop()}</div>
        ${issueDots ? `<div class="lib-card__issues">${issueDots}</div>` : ""}
      </div>
    </div>
  `;
}
