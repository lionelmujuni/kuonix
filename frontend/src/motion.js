// Kuonix motion vocabulary. One module, one grammar.
//
// The two-speed rule: entries are slow + eased-out (300–800ms, asymmetric
// cubic-béziers favouring late deceleration); exits are fast + eased-in
// (180–280ms). Pointer-driven motion goes through `quickTo` so frames stay
// GPU-cheap. Scale deltas stay tiny (0.96–1.04); motion comes from translate
// and clip-path, not scale. Stagger lives between 60–90ms.
//
// `prefers-reduced-motion` collapses every tween to instant while preserving
// callbacks so flow logic still works.

import { gsap } from "../node_modules/gsap/index.js";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Asymmetric cubic-béziers — the project's "house" eases. GSAP 3 accepts
// cubic-bezier strings directly as ease values, so no registration step is
// needed. Late-decelerate signature on entries; sharp-start on exits.
const EASE_ENTER = "cubic-bezier(.16, 1, .3, 1)";
const EASE_EXIT  = "cubic-bezier(.7, 0, .84, 0)";
const EASE_SWAP  = "cubic-bezier(.65, .05, .36, 1)";

export const ease = {
  enter:  EASE_ENTER,
  exit:   EASE_EXIT,
  swap:   EASE_SWAP,
  linear: "none",
  pulse:  "sine.inOut",
  // Legacy aliases — kept so existing call sites don't break.
  legacyEnter: "expo.out",
  legacyExit:  "power2.in",
};

export const dur = {
  fast:    0.15,
  normal:  0.25,
  enter:   0.38,    // panel/popover entry
  exit:    0.22,    // panel/popover exit
  reveal:  0.5,
  panel:   0.42,
  backdrop:0.22,
};

function instant(opts = {}) {
  // Collapse a tween config to instant when reduce-motion is on.
  return { ...opts, duration: 0, delay: 0, stagger: 0, repeat: 0 };
}

export function enterView(scopeEl) {
  if (!scopeEl) return null;
  const ctx = gsap.context(() => {
    const tl = gsap.timeline();
    const header = scopeEl.querySelector(".view-header");
    if (header) {
      tl.from(header, reduced
        ? instant({ opacity: 0 })
        : { opacity: 0, y: -12, duration: dur.enter, ease: ease.enter });
    }
    const cards = scopeEl.querySelectorAll(".reveal, .card, .tool-card, .image-card");
    if (cards.length) {
      tl.from(cards, reduced
        ? instant({ opacity: 0 })
        : { opacity: 0, y: 16, scale: 0.98, duration: dur.reveal, ease: ease.enter,
            stagger: { amount: Math.min(0.4, cards.length * 0.06), from: "start" },
            clearProps: "all" }, "-=0.18");
    }
  }, scopeEl);
  return ctx;
}

export function leaveView(scopeEl, onComplete) {
  if (!scopeEl) { onComplete?.(); return; }
  if (reduced) { onComplete?.(); return; }
  gsap.to(scopeEl, {
    opacity: 0, y: -6,
    duration: dur.exit, ease: ease.exit,
    onComplete,
  });
}

export function revealPanel(el) {
  if (!el) return;
  if (reduced) { gsap.set(el, { opacity: 1, x: 0, scale: 1 }); return; }
  gsap.fromTo(el,
    { opacity: 0, x: 24, scale: 0.98 },
    { opacity: 1, x: 0, scale: 1, duration: dur.reveal, ease: ease.enter });
}

export function hidePanel(el, onComplete) {
  if (!el) { onComplete?.(); return; }
  if (reduced) { onComplete?.(); return; }
  gsap.to(el, {
    opacity: 0, x: 16, scale: 0.97,
    duration: dur.exit, ease: ease.exit, onComplete,
  });
}

export function revealToolCard(el) {
  if (!el) return;
  if (reduced) { gsap.set(el, { opacity: 1, y: 0 }); return; }
  gsap.fromTo(el,
    { opacity: 0, y: 12, scale: 0.98 },
    { opacity: 1, y: 0, scale: 1, duration: dur.reveal, ease: ease.enter, clearProps: "transform" });
}

export function pulseHistoryNode(el) {
  if (!el || reduced) return;
  gsap.timeline()
    .fromTo(el, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: ease.enter })
    .to(el, { boxShadow: "0 0 0 6px rgba(var(--accent-color-rgb), 0)", duration: 0.6, ease: ease.exit }, "<");
}

export function progressTo(barEl, fromPct, toPct, duration = 0.6) {
  if (!barEl) return;
  if (reduced) { gsap.set(barEl, { width: toPct + "%" }); return; }
  gsap.fromTo(barEl,
    { width: (fromPct ?? 0) + "%" },
    { width: toPct + "%", duration, ease: ease.linear });
}

export function indeterminateProgress(barEl) {
  if (!barEl || reduced) return null;
  return gsap.fromTo(barEl,
    { x: "-100%", opacity: 0.6 },
    { x: "200%", opacity: 1, duration: 1.2, ease: "power1.inOut", repeat: -1 });
}

export function streamingDots(containerEl) {
  if (!containerEl || reduced) return { kill() {} };
  const dots = containerEl.querySelectorAll(".dot");
  if (!dots.length) return { kill() {} };
  return gsap.to(dots, {
    y: -6, opacity: 1,
    duration: 0.4, ease: ease.pulse,
    yoyo: true, repeat: -1,
    stagger: { each: 0.15, from: "start" },
  });
}

export function stopStreamingDots(anim, containerEl) {
  anim?.kill?.();
  if (!containerEl) return;
  const dots = containerEl.querySelectorAll(".dot");
  gsap.to(dots, { y: 0, opacity: 0.3, duration: 0.2, ease: "power2.out" });
}

export function crossfadeStage(prevEl, nextEl, duration = 0.5) {
  if (!nextEl) return;
  if (reduced) {
    if (prevEl) gsap.set(prevEl, { opacity: 0 });
    gsap.set(nextEl, { opacity: 1 });
    return;
  }
  const tl = gsap.timeline();
  tl.to(nextEl, { opacity: 1, duration, ease: "power2.inOut" });
  if (prevEl) tl.to(prevEl, { opacity: 0, duration, ease: "power2.inOut" }, "<");
  return tl;
}

export function accentRipple(el) {
  if (!el || reduced) return;
  const ripple = document.createElement("div");
  ripple.className = "accent-ripple";
  Object.assign(ripple.style, {
    position: "absolute", inset: "0", pointerEvents: "none",
    border: "2px solid rgba(var(--accent-color-rgb), 0.6)",
    borderRadius: "inherit", opacity: "0",
  });
  // Caller is responsible for ensuring el has position: relative and an inheriting border-radius.
  el.appendChild(ripple);
  gsap.fromTo(ripple,
    { opacity: 0.7, scale: 0.96 },
    { opacity: 0, scale: 1.04, duration: 0.5, ease: ease.exit, onComplete: () => ripple.remove() });
}

export function dropAreaPulse(el, on) {
  if (!el) return;
  if (reduced) return;
  if (on) {
    gsap.to(el, {
      scale: 1.01,
      boxShadow: "0 12px 40px rgba(var(--accent-color-rgb), 0.22)",
      duration: 0.3, ease: ease.enter,
    });
  } else {
    gsap.to(el, { scale: 1, boxShadow: "0 4px 12px rgba(var(--accent-color-rgb), 0.12)", duration: 0.2, ease: ease.exit });
  }
}

export function buttonPulse(btnEl) {
  if (!btnEl || reduced) return;
  gsap.timeline()
    .to(btnEl, { scale: 0.95, duration: 0.08, ease: "power2.in" })
    .to(btnEl, { scale: 1, duration: dur.normal, ease: ease.enter });
}

// Animate the mode-toggle indicator under the active option.
export function moveModeIndicator(indicatorEl, targetEl) {
  if (!indicatorEl || !targetEl) return;
  const parent = indicatorEl.parentElement;
  if (!parent) return;
  const tRect = targetEl.getBoundingClientRect();
  const pRect = parent.getBoundingClientRect();
  const left = tRect.left - pRect.left;
  const width = tRect.width;
  if (reduced) {
    gsap.set(indicatorEl, { x: left, width });
    return;
  }
  gsap.to(indicatorEl, { x: left, width, duration: 0.3, ease: ease.enter });
}

// Reveal nav items with a small stagger on first paint.
export function revealNav(navEl) {
  if (!navEl) return;
  const items = navEl.querySelectorAll(".nav-btn, .nav-section-title");
  if (!items.length) return;
  if (reduced) { gsap.set(items, { opacity: 1, x: 0 }); return; }
  gsap.from(items, {
    opacity: 0, x: -8,
    duration: 0.3, ease: ease.enter,
    stagger: 0.04,
  });
}

// ---- Panel grammar -----------------------------------------------------
//
// The canonical motion for any side-anchored panel (sliders, future modals).
// Entry is slower than exit. Backdrop fades on its own track so the panel
// motion isn't gated on it.

const SIDE_OFFSETS = {
  right:  { x: 32,  y: 0  },
  left:   { x: -32, y: 0  },
  top:    { x: 0,   y: -24 },
  bottom: { x: 0,   y: 24  },
};

export function openPanel(el, { side = "right", duration = dur.panel } = {}) {
  if (!el) return Promise.resolve();
  const offset = SIDE_OFFSETS[side] || SIDE_OFFSETS.right;
  if (reduced) {
    gsap.set(el, { opacity: 1, x: 0, y: 0, scale: 1 });
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    gsap.fromTo(el,
      { opacity: 0, x: offset.x, y: offset.y, scale: 0.985 },
      { opacity: 1, x: 0, y: 0, scale: 1, duration, ease: ease.enter,
        onComplete: resolve, clearProps: "transform" });
  });
}

export function closePanel(el, { side = "right", duration = dur.exit } = {}) {
  if (!el) return Promise.resolve();
  const offset = SIDE_OFFSETS[side] || SIDE_OFFSETS.right;
  if (reduced) return Promise.resolve();
  return new Promise((resolve) => {
    gsap.to(el, {
      opacity: 0,
      x: offset.x * 0.6, y: offset.y * 0.6, scale: 0.985,
      duration, ease: ease.exit, onComplete: resolve,
    });
  });
}

export function fadeBackdrop(el, on, duration = dur.backdrop) {
  if (!el) return;
  if (reduced) { el.style.opacity = on ? "1" : "0"; return; }
  gsap.to(el, { opacity: on ? 1 : 0, duration, ease: on ? "power2.out" : "power2.in" });
}

// Stagger reveal of any list of children. Use after a panel's entry settles
// to give body content the same late-decelerate signature.
export function staggerReveal(els, { from = "start", each = 0.07, duration = 0.5, y = 14 } = {}) {
  if (!els || !els.length) return;
  if (reduced) { gsap.set(els, { opacity: 1, y: 0 }); return; }
  gsap.from(els, {
    opacity: 0, y, duration, ease: ease.enter,
    stagger: { each, from }, clearProps: "transform",
  });
}

// ---- Pointer interactions ---------------------------------------------

// Magnetic hover — pulls the element a fraction of the way toward the cursor.
// Returns a destroy fn so callers can unbind on unmount.
//
// Applied selectively to high-signal CTAs (primary buttons, the Adjust pill,
// floating toggles). Don't slap it on everything — over-use makes the UI
// feel jittery rather than alive.
export function magneticHover(el, { strength = 0.25, max = 10 } = {}) {
  if (!el || reduced) return () => {};
  const qx = gsap.quickTo(el, "x", { duration: 0.45, ease: "power3.out" });
  const qy = gsap.quickTo(el, "y", { duration: 0.45, ease: "power3.out" });
  const move = (e) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = (e.clientX - cx) * strength;
    const dy = (e.clientY - cy) * strength;
    qx(Math.max(-max, Math.min(max, dx)));
    qy(Math.max(-max, Math.min(max, dy)));
  };
  const leave = () => { qx(0); qy(0); };
  el.addEventListener("mousemove", move);
  el.addEventListener("mouseleave", leave);
  return () => {
    el.removeEventListener("mousemove", move);
    el.removeEventListener("mouseleave", leave);
    gsap.set(el, { x: 0, y: 0 });
  };
}

// Fluid number tween — for slider value readouts so they don't snap on each
// keystroke / drag tick. Calls onUpdate(value) every frame.
export function tweenNumber(from, to, onUpdate, { duration = 0.25, decimals = 2 } = {}) {
  if (reduced) {
    onUpdate(Number(Number(to).toFixed(decimals)));
    return null;
  }
  const obj = { v: Number(from) };
  return gsap.to(obj, {
    v: Number(to), duration, ease: "power2.out",
    onUpdate: () => onUpdate(Number(obj.v.toFixed(decimals))),
  });
}

// Clip-path wipe — used for live preview reveal so big corrections feel
// weightier than nudges. Direction is "horizontal" or "vertical".
export function clipReveal(el, { direction = "horizontal", duration = 0.55 } = {}) {
  if (!el) return;
  if (reduced) { gsap.set(el, { clipPath: "inset(0 0 0 0)" }); return; }
  const from = direction === "horizontal" ? "inset(0 100% 0 0)" : "inset(100% 0 0 0)";
  gsap.fromTo(el,
    { clipPath: from },
    { clipPath: "inset(0 0 0 0)", duration, ease: ease.enter });
}

export const isReduced = reduced;
export { gsap };
