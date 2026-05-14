// Right-side sliders panel for direct manipulation of color
// correction algorithms. Complements the agent: when you want a knob, you
// reach for this; when you want intent, you talk to the rail.
//
// Architecture:
//   • Built on the unified panel controller (see components/panel) so it
//     shares the project's panel motion grammar.
//   • Fetches /color-correct/methods once, groups them into 4 tabs.
//   • Active method renders a column of slider widgets; every input fires a
//     debounced /color-correct/preview that streams through the bus to the
//     edit-view stage.
//   • Compare = press-and-hold to swap to the un-edited baseline.
//   • Commit = call /color-correct/commit, rename the active image to the
//     new step file, and close.
//   • Discard / X / Esc / backdrop click = revert the stage and bail.
//
// Slider widget: native <input type=range> for a11y/keyboard, plus a custom
// visual track + value bubble layered on top. The value display tweens with
// a fluid number ease so dragging feels weighty rather than digital.

import { gsap } from "../../../node_modules/gsap/index.js";
import {
  isReduced, magneticHover, tweenNumber, ease, dur,
} from "../../motion.js";
import * as state from "../../state.js";
import { listMethods, preview, commit } from "../../api/endpoints/correction.js";
import { emit, EVENTS } from "../../bus.js";
import { toast } from "../toast/index.js";
import { createPanel } from "../panel/index.js";
import { GROUPS } from "./groups.js";

let openInstance = null;

export function isOpen() { return !!openInstance; }

export async function openSlidersPanel() {
  if (openInstance) return openInstance;

  const path = state.get("currentImagePath");
  if (!path) {
    toast.warning("Drop an image first.");
    return null;
  }

  const baselineUrl = state.get("currentImageUrl");
  let methods = [];
  let activeMethodId = null;
  let params = {};
  let pendingPreview = null;
  let previewSeq = 0;
  let previewing = false;     // flight indicator
  let comparing = false;
  let lastPreviewUrl = null;
  let dirty = false;          // any slider movement = dirty
  let cleanupFns = [];

  const appBody = document.querySelector(".app-body");

  const panel = createPanel({
    side: "right",
    width: 400,
    title: "Adjust",
    subtitle: "Direct controls — every move previews live.",
    className: "panel--sliders",
    onClose: () => {
      // Restore left nav.
      appBody?.classList.remove("nav-collapsed");
      // Tear down listeners.
      for (const fn of cleanupFns) try { fn(); } catch {}
      cleanupFns = [];
      // If we're closing without a commit, restore the baseline so the user
      // doesn't see a stale preview lingering on the stage.
      if (!committed && (lastPreviewUrl || comparing)) {
        emit(EVENTS.STAGE_SET_IMAGE, { src: baselineUrl });
      }
      openInstance = null;
    },
  });
  openInstance = panel;
  let committed = false;

  // Collapse left nav so the full image is visible during adjustments.
  appBody?.classList.add("nav-collapsed");
  // Remove backdrop blur so color corrections can be previewed clearly.
  panel.overlay.querySelector(".panel-backdrop")?.classList.add("panel-backdrop--clear");

  panel.body.innerHTML = template();
  panel.open();

  // Tabs are clickable immediately; method list + sliders fill in once
  // /methods responds.
  bindTabs(panel.body, (tabId) => switchTab(tabId));
  bindFooter(panel.body, {
    onReset:    handleReset,
    onCompareDown: handleCompareDown,
    onCompareUp:   handleCompareUp,
    onCommit:    handleCommit,
    onDiscard:   () => panel.close(),
  });

  try {
    methods = await listMethods();
  } catch (err) {
    console.error("listMethods", err);
    toast.error("Couldn't load color methods.");
    panel.close();
    return null;
  }

  // Default tab is the first that has at least one available method.
  const firstTab = GROUPS.find((g) =>
    g.methods.some((id) => methods.find((m) => m.id === id))
  )?.id || GROUPS[0].id;
  switchTab(firstTab);

  // ----- Tab / method switching -----------------------------------------

  function switchTab(tabId) {
    const group = GROUPS.find((g) => g.id === tabId);
    if (!group) return;
    panel.body.querySelectorAll("[data-tab]").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.tab === tabId));
    if (!isReduced) {
      const indicator = panel.body.querySelector(".sliders__tab-indicator");
      const active = panel.body.querySelector(`[data-tab="${tabId}"]`);
      if (indicator && active) {
        const r = active.getBoundingClientRect();
        const pr = active.parentElement.getBoundingClientRect();
        gsap.to(indicator, {
          x: r.left - pr.left,
          width: r.width,
          duration: dur.normal, ease: ease.swap,
        });
      }
    }

    const methodList = panel.body.querySelector("[data-methods]");
    const available = group.methods
      .map((id) => methods.find((m) => m.id === id))
      .filter(Boolean);

    methodList.innerHTML = available.map((m) => `
      <button class="sliders__method" data-method="${m.id}">
        <strong>${m.name}</strong>
        <span>${escapeAttr(m.description || "")}</span>
      </button>
    `).join("");

    methodList.querySelectorAll("[data-method]").forEach((btn) => {
      btn.addEventListener("click", () => selectMethod(btn.dataset.method));
    });

    if (!isReduced) {
      gsap.from(methodList.children, {
        opacity: 0, y: 10, duration: 0.4, ease: ease.enter,
        stagger: { each: 0.05, from: "start" }, clearProps: "transform",
      });
    }

    if (!available.length) {
      activeMethodId = null;
      panel.body.querySelector("[data-params]").innerHTML = `
        <div class="sliders__no-methods">
          <i class="bi bi-box-seam"></i>
          <p>No methods available in this build.</p>
        </div>
      `;
    } else {
      activeMethodId = null;
      panel.body.querySelector("[data-params]").innerHTML = `
        <div class="sliders__no-methods">
          <i class="bi bi-hand-index"></i>
          <p>Select a method to begin.</p>
        </div>
      `;
    }
    setFooterEnabled();
  }

  function selectMethod(id) {
    const m = methods.find((mm) => mm.id === id);
    if (!m) return;
    activeMethodId = id;
    params = {};
    for (const p of m.parameters || []) {
      // Path-style params (e.g. referenceImagePath) have all-zero numeric
      // range and a non-numeric default — skip; the user picks them via UI.
      if (p.name === "referenceImagePath") continue;
      params[p.name] = p.defaultValue;
    }

    panel.body.querySelectorAll("[data-method]").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.method === id));

    renderParams(m);
    setFooterEnabled();
    // Auto-preview with defaults so Compare is available immediately.
    if (!methodNeedsReference()) scheduleSafePreview();
  }

  function renderParams(method) {
    const wrap = panel.body.querySelector("[data-params]");
    const all = method.parameters || [];
    const refParam = all.find((p) => p.name === "referenceImagePath");
    // Numeric sliders — skip non-numeric (all-zero range) entries.
    const numericParams = all.filter(
      (p) => !(p.min === 0 && p.max === 0 && p.step === 0),
    );

    if (numericParams.length === 0 && !refParam) {
      wrap.innerHTML = `
        <div class="sliders__no-params">
          <i class="bi bi-magic"></i>
          <strong>${escapeAttr(method.name)}</strong>
          <p>${escapeAttr(method.description || "")}</p>
          <small class="muted">Auto-tunes from the image — hit Commit to apply.</small>
        </div>
      `;
      return;
    }

    let html = "";
    if (refParam) html += referencePickerHtml();
    if (numericParams.length) html += numericParams.map(sliderHtml).join("");
    wrap.innerHTML = html;

    if (refParam) bindReferencePicker(wrap);
    if (numericParams.length) bindSliders(wrap);

    if (!isReduced) {
      const targets = wrap.querySelectorAll(".slider, .ref-picker");
      gsap.from(targets, {
        opacity: 0, y: 14, duration: 0.5, ease: ease.enter,
        stagger: { each: 0.07, from: "start" }, clearProps: "transform",
      });
    }
  }

  // ----- Reference picker (color_distribution_alignment) ---------------

  function bindReferencePicker(root) {
    const strip = root.querySelector("[data-ref-strip]");
    const hint = root.querySelector("[data-ref-hint]");
    const browseBtn = root.querySelector("[data-ref-browse]");

    if (browseBtn && window.dialog?.selectReferenceImage) {
      browseBtn.addEventListener("click", async () => {
        const result = await window.dialog.selectReferenceImage();
        if (!result?.filePath) return;
        const refPath = result.filePath;
        strip.querySelectorAll("[data-ref]").forEach((b) => b.classList.remove("is-selected"));
        params.referenceImagePath = refPath;
        hint.textContent = `Matching: ${refPath.split(/[/\\]/).pop()}`;
        dirty = true;
        setFooterEnabled();
        scheduleSafePreview();
      });
    }

    // Source: every ready session image except the one we're editing.
    const candidates = state.get("images")
      .filter((i) => i.state === "ready" && i.url && i.path !== path);

    if (candidates.length === 0) {
      strip.innerHTML = `
        <div class="ref-picker__empty">
          <i class="bi bi-images"></i>
          <span>Or load another image into the session to pick it here.</span>
        </div>
      `;
      return;
    }

    strip.innerHTML = candidates.map((img) => `
      <button class="ref-picker__card" data-ref="${escapeAttr(img.path)}" type="button">
        <img src="${img.url}" alt="" loading="lazy" />
        <span class="ref-picker__card-name">${escapeAttr(img.name || img.path.split(/[/\\]/).pop())}</span>
      </button>
    `).join("");

    strip.querySelectorAll("[data-ref]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const refPath = btn.dataset.ref;
        const wasSelected = btn.classList.contains("is-selected");
        strip.querySelectorAll("[data-ref]").forEach((b) => b.classList.remove("is-selected"));
        if (wasSelected) {
          delete params.referenceImagePath;
          hint.textContent = "Pick the look you want to match";
        } else {
          btn.classList.add("is-selected");
          params.referenceImagePath = refPath;
          const name = btn.querySelector(".ref-picker__card-name").textContent;
          hint.textContent = `Matching: ${name}`;
        }
        dirty = true;
        setFooterEnabled();
        scheduleSafePreview();
      });
    });

    // Re-select if a reference was already chosen (e.g. switching tabs back).
    if (params.referenceImagePath) {
      const sel = Array.from(strip.querySelectorAll("[data-ref]"))
        .find((b) => b.dataset.ref === params.referenceImagePath);
      sel?.classList.add("is-selected");
    }
  }

  // ----- Slider widget ---------------------------------------------------

  function bindSliders(root) {
    root.querySelectorAll("[data-slider]").forEach((wrap) => {
      const key = wrap.dataset.key;
      const input = wrap.querySelector("input[type=range]");
      const fill = wrap.querySelector("[data-fill]");
      const bubble = wrap.querySelector("[data-bubble]");
      const valueOut = wrap.querySelector(".slider__value");

      const min = parseFloat(input.min);
      const max = parseFloat(input.max);
      const step = parseFloat(input.step);
      const decimals = step % 1 === 0 ? 0 : 2;
      let lastValue = parseFloat(input.value);

      // Pre-create quickTo for buttery handle motion.
      const moveFill   = gsap.quickTo(fill,   "width", { duration: 0.18, ease: "power2.out" });
      const moveBubble = gsap.quickTo(bubble, "x",     { duration: 0.18, ease: "power2.out" });

      const layout = () => {
        const v = parseFloat(input.value);
        const pct = ((v - min) / (max - min)) * 100;
        if (isReduced) {
          fill.style.width = pct + "%";
          bubble.style.left = pct + "%";
        } else {
          moveFill(`${pct}%`);
          // Move bubble via translateX on its absolute-left:0 anchor.
          const trackWidth = wrap.querySelector(".slider__track").clientWidth;
          moveBubble((pct / 100) * trackWidth);
        }
      };

      const commitDisplay = (v) => {
        valueOut.textContent = formatVal(v, decimals);
        bubble.textContent   = formatVal(v, decimals);
      };

      const onInput = () => {
        const v = parseFloat(input.value);
        // Tween the readout for a fluid feel; bubble too.
        tweenNumber(lastValue, v, commitDisplay, { duration: 0.18, decimals });
        lastValue = v;
        layout();
        params[key] = v;
        dirty = true;
        setFooterEnabled();
        scheduleSafePreview();
      };

      input.addEventListener("input", onInput);

      // Double-click resets to default.
      input.addEventListener("dblclick", () => {
        const def = parseFloat(input.dataset.default);
        if (isNaN(def)) return;
        input.value = def;
        onInput();
      });

      // Bubble visibility — show on hover/focus/drag.
      const showBubble = () => bubble.classList.add("is-visible");
      const hideBubble = () => bubble.classList.remove("is-visible");
      input.addEventListener("pointerenter", showBubble);
      input.addEventListener("pointerleave", hideBubble);
      input.addEventListener("focus", showBubble);
      input.addEventListener("blur", hideBubble);

      // Initial paint after layout has had a tick to measure.
      requestAnimationFrame(layout);
      commitDisplay(lastValue);
    });
  }

  function formatVal(v, decimals) {
    return Number(v).toFixed(decimals);
  }

  // ----- Preview / commit ------------------------------------------------

  function scheduleSafePreview() {
    // Methods that need a reference image won't preview until one is picked.
    if (methodNeedsReference() && !params.referenceImagePath) {
      setPreviewBusy(false);
      return;
    }
    if (pendingPreview) clearTimeout(pendingPreview);
    pendingPreview = setTimeout(() => {
      pendingPreview = null;
      runPreview();
    }, 110);
    setPreviewBusy(true);
  }

  function methodNeedsReference() {
    const m = methods.find((mm) => mm.id === activeMethodId);
    return !!(m && (m.parameters || []).some((p) => p.name === "referenceImagePath"));
  }

  async function runPreview() {
    if (!activeMethodId) return;
    const seq = ++previewSeq;
    previewing = true;
    try {
      const res = await preview({
        method: activeMethodId,
        parameters: { ...params },
        imagePath: path,
        region: null,
      });
      if (seq !== previewSeq) return;     // stale — newer call superseded.
      if (res?.success === false) throw new Error(res?.message || "Preview failed");

      const dataUrl = normaliseImage(res?.base64Image);
      if (dataUrl) {
        lastPreviewUrl = dataUrl;
        setFooterEnabled();
        if (!comparing) emit(EVENTS.STAGE_SET_IMAGE, { src: dataUrl });
      }
    } catch (err) {
      console.error("preview", err);
      toast.error(err?.message || "Preview failed");
    } finally {
      previewing = false;
      if (seq === previewSeq) setPreviewBusy(false);
    }
  }

  function setPreviewBusy(on) {
    const indicator = panel.body.querySelector(".sliders__preview-status");
    if (!indicator) return;
    indicator.classList.toggle("is-busy", !!on);
  }

  function handleReset() {
    const m = methods.find((mm) => mm.id === activeMethodId);
    if (!m) return;
    // Cancel any queued or in-flight preview so it cannot overwrite the reset.
    if (pendingPreview) { clearTimeout(pendingPreview); pendingPreview = null; }
    previewSeq++;  // invalidate any in-flight fetch — its seq will no longer match
    params = {};
    for (const p of m.parameters || []) params[p.name] = p.defaultValue;
    renderParams(m);
    dirty = false;
    lastPreviewUrl = null;
    setFooterEnabled();
    emit(EVENTS.STAGE_SET_IMAGE, { src: baselineUrl });
  }

  function handleCompareDown() {
    if (!lastPreviewUrl) return;
    comparing = true;
    panel.body.querySelector("[data-action='compare']")?.classList.add("is-active");
    emit(EVENTS.STAGE_SET_IMAGE, { src: baselineUrl });
  }

  function handleCompareUp() {
    if (!comparing) return;
    comparing = false;
    panel.body.querySelector("[data-action='compare']")?.classList.remove("is-active");
    if (lastPreviewUrl) emit(EVENTS.STAGE_SET_IMAGE, { src: lastPreviewUrl });
  }

  async function handleCommit() {
    if (!activeMethodId || !dirty) return;
    const btn = panel.body.querySelector("[data-action='commit']");
    btn.disabled = true;
    btn.classList.add("is-loading");
    try {
      const res = await commit({
        method: activeMethodId,
        parameters: { ...params },
        imagePath: path,
        region: null,
      });
      if (res?.success === false) throw new Error(res?.message || "Commit failed");
      const newPath = res?.outputPath;
      const dataUrl = normaliseImage(res?.base64Image) || lastPreviewUrl;
      if (newPath) {
        state.renameActiveImage(newPath, { url: dataUrl, state: "ready" });
      }
      committed = true;
      lastPreviewUrl = null;     // already represented in state
      toast.success("Correction committed.");
      panel.close();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Commit failed");
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  }

  function setFooterEnabled() {
    const has = !!activeMethodId;
    const refOK = !methodNeedsReference() || !!params.referenceImagePath;
    const commitBtn = panel.body.querySelector("[data-action='commit']");
    const resetBtn = panel.body.querySelector("[data-action='reset']");
    const compareBtn = panel.body.querySelector("[data-action='compare']");
    if (commitBtn) commitBtn.disabled = !has || !dirty || !refOK;
    if (resetBtn)  resetBtn.disabled  = !has || !dirty;
    if (compareBtn) compareBtn.disabled = !has || !lastPreviewUrl;
  }

  return panel;
}

// ---------------------------------------------------------------------------

function template() {
  return `
    <nav class="sliders__tabs">
      <span class="sliders__tab-indicator" aria-hidden="true"></span>
      ${GROUPS.map((g) => `
        <button class="sliders__tab" data-tab="${g.id}" type="button">
          <i class="bi ${g.icon}"></i>
          <span>${g.label}</span>
        </button>
      `).join("")}
    </nav>

    <section class="sliders__methods" data-methods>
      <div class="sliders__loading">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>
    </section>

    <section class="sliders__params" data-params></section>

    <footer class="sliders__footer">
      <span class="sliders__preview-status" aria-live="polite">
        <span class="sliders__preview-dot"></span>
        <span class="sliders__preview-text">Live preview</span>
      </span>
      <div class="sliders__footer-actions">
        <button class="btn btn--ghost" data-action="reset" disabled type="button">
          <i class="bi bi-arrow-counterclockwise"></i> Reset
        </button>
        <button class="btn btn--ghost" data-action="compare" disabled type="button">
          <i class="bi bi-eye"></i> Compare
        </button>
        <button class="btn btn--accent" data-action="commit" disabled type="button">
          <i class="bi bi-check2"></i> <span>Commit</span>
        </button>
      </div>
    </footer>
  `;
}

function bindTabs(body, onSelect) {
  body.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => onSelect(btn.dataset.tab));
  });
}

function bindFooter(body, { onReset, onCompareDown, onCompareUp, onCommit }) {
  body.querySelector("[data-action='reset']").addEventListener("click", onReset);

  const compareBtn = body.querySelector("[data-action='compare']");
  compareBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); onCompareDown(); });
  // Release anywhere should drop comparison.
  const releaseHandler = () => onCompareUp();
  window.addEventListener("pointerup", releaseHandler);
  window.addEventListener("pointercancel", releaseHandler);
  compareBtn.addEventListener("pointerleave", releaseHandler);
  // Keyboard support — Space/Enter while focused = compare while held.
  compareBtn.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); onCompareDown(); }
  });
  compareBtn.addEventListener("keyup", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); onCompareUp(); }
  });

  const commitBtn = body.querySelector("[data-action='commit']");
  commitBtn.addEventListener("click", onCommit);
  magneticHover(commitBtn, { strength: 0.18, max: 5 });
}

function referencePickerHtml() {
  return `
    <div class="ref-picker" data-ref-picker>
      <div class="ref-picker__head">
        <label class="ref-picker__label">Reference image</label>
        <button class="btn-glass ref-picker__browse" data-ref-browse type="button">
          <i class="bi bi-folder2-open"></i> Browse
        </button>
      </div>
      <span class="ref-picker__hint" data-ref-hint>Pick the look you want to match</span>
      <div class="ref-picker__strip" data-ref-strip></div>
    </div>
  `;
}

function sliderHtml(p) {
  const decimals = p.step % 1 === 0 ? 0 : 2;
  const def = Number(p.defaultValue).toFixed(decimals);
  return `
    <div class="slider" data-slider data-key="${escapeAttr(p.name)}">
      <div class="slider__head">
        <label class="slider__label" for="slider-${escapeAttr(p.name)}">${escapeAttr(p.label)}</label>
        <output class="slider__value">${def}</output>
      </div>
      <div class="slider__track-wrap">
        <div class="slider__track">
          <div class="slider__rail"></div>
          <div class="slider__fill" data-fill style="width: 0%"></div>
          <div class="slider__bubble" data-bubble>${def}</div>
        </div>
        <input id="slider-${escapeAttr(p.name)}"
               type="range"
               class="slider__input"
               min="${p.min}" max="${p.max}" step="${p.step}"
               value="${p.defaultValue}"
               data-default="${p.defaultValue}"
               aria-label="${escapeAttr(p.label)}" />
      </div>
      ${p.description ? `<p class="slider__hint">${escapeAttr(p.description)}</p>` : ""}
    </div>
  `;
}

function normaliseImage(s) {
  if (!s) return null;
  if (typeof s !== "string") return null;
  if (s.startsWith("data:")) return s;
  return "data:image/jpeg;base64," + s;
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
