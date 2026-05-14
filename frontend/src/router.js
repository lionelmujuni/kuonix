// Hash router with view lifecycle.
//
// Each view module exports { mount(el, params), unmount() }.
// On hash change we call current.unmount() (which should ctx.revert() its GSAP
// context) before mounting the next. Outlet element is opacity-faded between
// transitions for a clean visual swap.

import { gsap } from "../node_modules/gsap/index.js";
import { isReduced } from "./motion.js";

const routes = new Map();
let outletEl = null;
let current = null;
let currentRoute = null;

export function defineRoute(name, loader) {
  // loader is `() => Promise<{ mount, unmount }>` so views can be code-split.
  routes.set(name, loader);
}

export function init(outlet, defaultRoute) {
  outletEl = outlet;
  window.addEventListener("hashchange", handleChange);
  if (!window.location.hash) window.location.hash = `#/${defaultRoute}`;
  else handleChange();
}

export function navigate(name, params = {}) {
  const qs = new URLSearchParams(params).toString();
  window.location.hash = `#/${name}${qs ? "?" + qs : ""}`;
}

export function getCurrentRoute() { return currentRoute; }

async function handleChange() {
  const { name, params } = parseHash(window.location.hash);
  const loader = routes.get(name);
  if (!loader) {
    console.warn("[router] no route", name);
    return;
  }

  // Tear down current view.
  if (current) {
    try { await Promise.resolve(current.unmount?.()); } catch (e) { console.error(e); }
    current = null;
  }

  // Quick fade out → swap → fade in. Skip when reduce-motion is on.
  await fadeOutlet(0);
  outletEl.innerHTML = "";

  const module = await loader();
  current = module;
  currentRoute = name;
  document.dispatchEvent(new CustomEvent("kuonix:route", { detail: { name, params } }));
  try {
    await Promise.resolve(module.mount?.(outletEl, params));
  } catch (e) {
    console.error("[router] mount failed", e);
  }
  await fadeOutlet(1);
}

function parseHash(hash) {
  const raw = (hash || "").replace(/^#\/?/, "");
  const [name, query] = raw.split("?");
  const params = Object.fromEntries(new URLSearchParams(query || ""));
  return { name: name || "edit", params };
}

function fadeOutlet(to) {
  if (!outletEl || isReduced) {
    if (outletEl) outletEl.style.opacity = String(to);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    gsap.to(outletEl, { opacity: to, duration: 0.18, ease: to ? "power2.out" : "power2.in", onComplete: resolve });
  });
}
