// Settings — Appearance, AI (Ollama Cloud), and About.
//
// Appearance is wired live via app.js helpers. AI settings round-trip the
// /settings/ollama endpoint; saving triggers a backend "restart required"
// notice because LangChain4j beans are created at startup.

import { gsap } from "../../../node_modules/gsap/index.js";
import { enterView, isReduced, buttonPulse } from "../../motion.js";
import * as state from "../../state.js";
import { applyAccent, applyTheme } from "../../app.js";
import { getOllama, saveOllama, listModels } from "../../api/endpoints/settings.js";
import { toast } from "../../components/toast/index.js";

let ctx = null;
let outletRef = null;
let modelOptions = [];
let currentSettings = null;
let dirty = false;

export function mount(outlet) {
  outletRef = outlet;
  outlet.innerHTML = "";

  const view = document.createElement("section");
  view.className = "view settings-view";
  view.dataset.view = "settings";
  outlet.appendChild(view);

  view.innerHTML = template();
  ctx = enterView(outlet);

  bindAppearance(view);
  bindAiSection(view);
  loadAiSettings(view);
}

export function unmount() {
  ctx?.revert?.();
  ctx = null;
  outletRef = null;
  currentSettings = null;
  modelOptions = [];
  dirty = false;
}

// ---------------------------------------------------------------------------

function template() {
  const accent = state.get("accent");
  const theme = state.get("theme");

  const swatches = Object.entries(state.ACCENT_PRESETS)
    .map(([id, p]) => `
      <button class="swatch ${id === accent ? "is-selected" : ""}" data-accent="${id}"
              style="--swatch-rgb: ${p.rgb};" title="${p.label}" aria-label="${p.label}"></button>
    `).join("");

  return `
    <header class="view-header">
      <p class="eyebrow">Settings</p>
      <h1 class="display-heading">Tune Kuonix</h1>
    </header>

    <nav class="settings__tabs reveal">
      <button class="settings__tab is-active" data-tab="appearance">
        <i class="bi bi-palette2"></i> Appearance
      </button>
      <button class="settings__tab" data-tab="ai">
        <i class="bi bi-stars"></i> AI · Ollama Cloud
      </button>
      <button class="settings__tab" data-tab="about">
        <i class="bi bi-info-circle"></i> About
      </button>
    </nav>

    <section class="settings__section reveal" data-section="appearance">
      <div class="card">
        <h3 class="card__title">Theme</h3>
        <p class="muted card__hint">Studio dark, paper light, or follow your OS.</p>
        <div class="theme-row">
          ${["light", "dark", "system"].map(t => `
            <button class="theme-opt ${t === theme ? "is-selected" : ""}" data-theme="${t}">
              <i class="bi bi-${t === 'light' ? 'sun' : t === 'dark' ? 'moon-stars' : 'circle-half'}"></i>
              ${t[0].toUpperCase() + t.slice(1)}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="card">
        <h3 class="card__title">Accent color</h3>
        <p class="muted card__hint">Touches every glow, ripple, and CTA across the app.</p>
        <div class="swatches">${swatches}</div>
      </div>

      <div class="card">
        <h3 class="card__title">Motion</h3>
        <p class="muted card__hint">
          Kuonix follows your OS reduced-motion preference.
          <strong data-reduced></strong>
        </p>
      </div>
    </section>

    <section class="settings__section reveal" data-section="ai" hidden>
      <div class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Ollama Cloud</h3>
            <p class="muted card__hint">
              Drop a key from <a href="https://ollama.com/cloud" target="_blank" rel="noopener">ollama.com</a>
              to enable conversational editing. Saves locally to <code>~/.kuonix/ollama-settings.json</code>.
            </p>
          </div>
          <label class="switch">
            <input type="checkbox" data-field="enabled">
            <span class="switch__slider"></span>
            <span class="switch__label" data-enabled-label>Disabled</span>
          </label>
        </div>

        <div class="ai-fields" data-ai-fields>
          <label class="field">
            <span>API key</span>
            <div class="field__row">
              <input type="password" data-field="apiKey" placeholder="sk-…" autocomplete="off" />
              <button class="icon-btn" data-action="toggle-secret" title="Show / hide">
                <i class="bi bi-eye"></i>
              </button>
            </div>
          </label>

          <label class="field">
            <span>Model</span>
            <input type="hidden" data-field="modelName">
            <div class="model-select" data-model-select>
              <button class="model-select__trigger" data-model-trigger type="button"
                      aria-haspopup="listbox" aria-expanded="false">
                <span class="model-select__current">
                  <span data-model-selected-name>Select a model</span>
                  <span class="model-tier-badge" data-model-selected-tier hidden></span>
                </span>
                <i class="bi bi-chevron-down model-select__chevron"></i>
              </button>
              <div class="model-select__dropdown" data-model-dropdown role="listbox" hidden></div>
            </div>
            <small class="field__hint" data-model-hint></small>
          </label>

          <div class="field-grid">
            <label class="field">
              <span>Temperature <em data-temp-val>0.30</em></span>
              <input type="range" min="0" max="1.5" step="0.05" data-field="temperature" />
              <small class="field__hint">Lower = more deterministic. 0.3 is a balanced default.</small>
            </label>

            <label class="field">
              <span>Max tokens</span>
              <input type="number" min="64" max="8192" step="64" data-field="maxTokens" />
              <small class="field__hint">Per-response cap. 1024 covers most edits.</small>
            </label>
          </div>

          <label class="field">
            <span>Base URL</span>
            <input type="text" data-field="baseUrl" placeholder="https://api.ollama.com" />
            <small class="field__hint">Only change for self-hosted Ollama or a private gateway.</small>
          </label>
        </div>

        <div class="card__footer">
          <span class="muted card__status" data-status></span>
          <div class="card__actions">
            <button class="btn btn--ghost" data-action="reload">
              <i class="bi bi-arrow-clockwise"></i> Reload
            </button>
            <button class="btn btn--accent" data-action="save" disabled>
              <i class="bi bi-check2"></i> Save
            </button>
          </div>
        </div>

        <div class="restart-banner" data-restart hidden>
          <i class="bi bi-arrow-repeat"></i>
          Saved. Restart Kuonix for the new AI settings to take effect.
        </div>
      </div>
    </section>

    <section class="settings__section reveal" data-section="about" hidden>
      <div class="card">
        <h3 class="card__title">Kuonix</h3>
        <p class="muted card__hint">A conversational darkroom for RAW workflows.</p>
        <dl class="kv">
          <dt>Version</dt><dd>0.4.0 (Phase 4)</dd>
          <dt>Backend</dt><dd>Spring Boot · localhost:8081</dd>
          <dt>Frontend</dt><dd>Electron 29 · vanilla JS · GSAP</dd>
          <dt>AI</dt><dd>LangChain4j + Ollama Cloud</dd>
        </dl>
        <div class="card__actions" style="margin-top: 16px;">
          <a class="btn btn--ghost" href="https://github.com/anthropics/claude-code" target="_blank" rel="noopener">
            <i class="bi bi-github"></i> View source
          </a>
        </div>
      </div>
    </section>

    <style>
      .settings-view { padding: 28px 32px 80px; max-width: 920px; }

      .settings__tabs {
        display: flex; gap: 4px; margin-bottom: 20px;
        padding: 4px; border-radius: 12px;
        background: var(--color-secondary); width: fit-content;
      }
      .settings__tab {
        padding: 8px 14px; border-radius: 8px;
        background: transparent; border: 0; color: var(--color-text-secondary);
        font-size: 13px; cursor: pointer;
        transition: background var(--duration-fast) var(--ease-standard),
                    color var(--duration-fast) var(--ease-standard);
        display: inline-flex; align-items: center; gap: 6px;
      }
      .settings__tab:hover { color: var(--color-text); }
      .settings__tab.is-active {
        background: var(--color-surface); color: var(--color-text);
        box-shadow: var(--shadow-sm);
      }

      .settings__section { display: flex; flex-direction: column; gap: 16px; }

      .card {
        background: var(--color-surface);
        border: 1px solid var(--color-card-border);
        border-radius: 16px; padding: 20px 22px;
        box-shadow: var(--shadow-sm);
      }
      .card__head {
        display: flex; justify-content: space-between; align-items: flex-start;
        gap: 16px; margin-bottom: 16px;
      }
      .card__title { margin: 0 0 6px; font-size: 16px; font-weight: 600; }
      .card__hint { margin: 0 0 14px; font-size: 13px; line-height: 1.5; }
      .card__hint code {
        background: var(--color-secondary); padding: 1px 6px; border-radius: 4px;
        font-size: 12px;
      }
      .card__hint a { color: rgb(var(--accent-color-rgb)); }
      .card__footer {
        display: flex; justify-content: space-between; align-items: center;
        margin-top: 16px; padding-top: 16px;
        border-top: 1px solid var(--color-border);
        gap: 12px; flex-wrap: wrap;
      }
      .card__status { font-size: 12px; }
      .card__actions { display: flex; gap: 8px; }

      .theme-row { display: flex; gap: 8px; flex-wrap: wrap; }
      .theme-opt {
        padding: 8px 14px; border-radius: 999px;
        border: 1px solid var(--color-border); background: var(--color-secondary);
        color: var(--color-text); font-size: 13px;
        display: inline-flex; align-items: center; gap: 6px;
        transition: background var(--duration-fast) var(--ease-standard),
                    box-shadow var(--duration-fast) var(--ease-standard);
      }
      .theme-opt:hover { background: var(--color-secondary-hover); }
      .theme-opt.is-selected {
        background: var(--accent-color); color: #fff; border-color: transparent;
        box-shadow: 0 2px 8px rgba(var(--accent-color-rgb), 0.3);
      }
      .swatches { display: flex; flex-wrap: wrap; gap: 10px; }
      .swatch {
        width: 30px; height: 30px; border-radius: 50%;
        background: rgb(var(--swatch-rgb)); border: 0;
        box-shadow: 0 0 0 2px var(--color-background), 0 0 0 3px transparent;
        transition: box-shadow var(--duration-fast) var(--ease-standard),
                    transform var(--duration-fast) var(--ease-standard);
      }
      .swatch:hover { transform: translateY(-1px); }
      .swatch.is-selected {
        box-shadow: 0 0 0 2px var(--color-background), 0 0 0 4px rgb(var(--swatch-rgb));
      }

      /* AI fields */
      .ai-fields { display: flex; flex-direction: column; gap: 14px; }
      .ai-fields[data-disabled="true"] { opacity: 0.55; pointer-events: none; }

      .field { display: flex; flex-direction: column; gap: 6px; }
      .field > span {
        font-size: 12px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.05em; color: var(--color-text-secondary);
        display: flex; justify-content: space-between; align-items: baseline;
      }
      .field > span em {
        font-style: normal; color: rgb(var(--accent-color-rgb));
        font-variant-numeric: tabular-nums;
      }
      .field input[type="text"], .field input[type="password"],
      .field input[type="number"] {
        padding: 9px 12px; border-radius: 10px;
        background: var(--color-secondary); border: 1px solid var(--color-border);
        color: var(--color-text); font-size: 13px; width: 100%;
      }
      .field input:focus {
        outline: 0; border-color: rgb(var(--accent-color-rgb));
        box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb), 0.15);
      }

      /* Custom model select */
      .model-select { position: relative; width: 100%; }
      .model-select__trigger {
        width: 100%; padding: 9px 12px; border-radius: 10px;
        background: var(--color-secondary); border: 1px solid var(--color-border);
        color: var(--color-text); font-size: 13px; text-align: left;
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        cursor: pointer;
        transition: border-color var(--duration-fast) var(--ease-standard),
                    box-shadow var(--duration-fast) var(--ease-standard);
      }
      .model-select__trigger:focus,
      .model-select__trigger.is-open {
        outline: 0; border-color: rgb(var(--accent-color-rgb));
        box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb), 0.15);
      }
      .model-select__current {
        display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;
      }
      .model-select__current [data-model-selected-name] {
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .model-select__chevron {
        flex-shrink: 0; font-size: 11px; color: var(--color-text-secondary);
        transition: transform var(--duration-fast) var(--ease-standard);
      }
      .model-select__trigger.is-open .model-select__chevron { transform: rotate(180deg); }
      .model-select__dropdown {
        position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 200;
        background: var(--color-surface); border: 1px solid var(--color-border);
        border-radius: 12px; padding: 6px;
        box-shadow: var(--shadow-lg);
        display: flex; flex-direction: column; gap: 2px;
      }
      .model-opt {
        width: 100%; padding: 10px 12px; border-radius: 8px;
        background: transparent; border: 0; text-align: left; cursor: pointer;
        display: flex; flex-direction: column; gap: 3px;
        transition: background var(--duration-fast) var(--ease-standard);
      }
      .model-opt:hover { background: rgba(var(--accent-color-rgb), 0.07); }
      .model-opt.is-selected { background: rgba(var(--accent-color-rgb), 0.12); }
      .model-opt__row { display: flex; align-items: center; gap: 8px; }
      .model-opt__name { font-size: 13px; font-weight: 500; color: var(--color-text); flex: 1; }
      .model-opt__desc { font-size: 11px; color: var(--color-text-secondary); line-height: 1.4; margin: 0; }
      .model-tier-badge {
        display: inline-flex; align-items: center; padding: 2px 7px;
        border-radius: 999px; font-size: 10px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.04em; flex-shrink: 0;
      }
      .model-tier-badge--paid { background: rgba(234, 179, 8, 0.15); color: rgb(220, 160, 0); }
      .model-tier-badge--free { background: rgba(34, 197, 94, 0.12); color: rgb(22, 163, 74); }
      [data-color-scheme="dark"] .model-tier-badge--paid { color: rgb(250, 204, 21); }
      [data-color-scheme="dark"] .model-tier-badge--free { color: rgb(74, 222, 128); }
      .field input[type="range"] {
        accent-color: rgb(var(--accent-color-rgb));
      }
      .field__row { display: flex; gap: 6px; }
      .field__row input { flex: 1; }
      .field__hint {
        font-size: 11px; color: var(--color-text-secondary); line-height: 1.5;
      }
      .field-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
      }
      @media (max-width: 600px) {
        .field-grid { grid-template-columns: 1fr; }
      }

      .switch {
        display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
        font-size: 12px; color: var(--color-text-secondary);
      }
      .switch input { display: none; }
      .switch__slider {
        position: relative; width: 36px; height: 20px;
        background: var(--color-secondary); border: 1px solid var(--color-border);
        border-radius: 999px;
        transition: background var(--duration-fast) var(--ease-standard);
      }
      .switch__slider::after {
        content: ""; position: absolute; top: 1px; left: 1px;
        width: 16px; height: 16px; border-radius: 50%;
        background: var(--color-text-secondary);
        transition: transform var(--duration-fast) var(--ease-standard),
                    background var(--duration-fast) var(--ease-standard);
      }
      .switch input:checked + .switch__slider {
        background: var(--accent-color); border-color: transparent;
      }
      .switch input:checked + .switch__slider::after {
        background: #fff; transform: translateX(16px);
      }

      .restart-banner {
        margin-top: 14px; padding: 10px 14px; border-radius: 10px;
        background: rgba(var(--accent-color-rgb), 0.12);
        border: 1px solid rgba(var(--accent-color-rgb), 0.3);
        font-size: 13px; color: var(--color-text);
        display: flex; align-items: center; gap: 8px;
      }
      .restart-banner i { color: rgb(var(--accent-color-rgb)); }

      .kv {
        display: grid; grid-template-columns: 120px 1fr; gap: 8px 16px;
        margin: 0; font-size: 13px;
      }
      .kv dt { color: var(--color-text-secondary); font-weight: 500; }
      .kv dd { margin: 0; color: var(--color-text); }
    </style>
  `;
}

// ---- Tab switching -----------------------------------------------------

function showSection(view, name) {
  view.querySelectorAll(".settings__tab").forEach((t) =>
    t.classList.toggle("is-active", t.dataset.tab === name));
  view.querySelectorAll(".settings__section").forEach((s) =>
    s.hidden = s.dataset.section !== name);
  if (!isReduced) {
    gsap.from(view.querySelector(`.settings__section[data-section="${name}"] .card`), {
      opacity: 0, y: 8, duration: 0.3, ease: "expo.out", stagger: 0.06, clearProps: "all",
    });
  }
}

// ---- Appearance --------------------------------------------------------

function bindAppearance(view) {
  view.querySelectorAll(".settings__tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      buttonPulse(tab);
      showSection(view, tab.dataset.tab);
    });
  });

  view.querySelectorAll(".theme-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyTheme(btn.dataset.theme);
      view.querySelectorAll(".theme-opt").forEach(b => b.classList.toggle("is-selected", b === btn));
    });
  });

  view.querySelectorAll(".swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyAccent(btn.dataset.accent);
      view.querySelectorAll(".swatch").forEach(b => b.classList.toggle("is-selected", b === btn));
    });
  });

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reducedEl = view.querySelector("[data-reduced]");
  reducedEl.textContent = reduced
    ? "Detected: reduced motion is on."
    : "Detected: full motion.";
}

// ---- AI section --------------------------------------------------------

function bindAiSection(view) {
  // Toggle secret visibility.
  view.querySelector("[data-action='toggle-secret']").addEventListener("click", (e) => {
    const input = view.querySelector("[data-field='apiKey']");
    const icon = e.currentTarget.querySelector("i");
    const isPwd = input.type === "password";
    input.type = isPwd ? "text" : "password";
    icon.className = isPwd ? "bi bi-eye-slash" : "bi bi-eye";
  });

  // Mark dirty on any field change.
  view.querySelectorAll("[data-field]").forEach((el) => {
    el.addEventListener("input", () => markDirty(view));
    el.addEventListener("change", () => markDirty(view));
  });

  // Live temperature display.
  const temp = view.querySelector("[data-field='temperature']");
  const tempVal = view.querySelector("[data-temp-val]");
  temp.addEventListener("input", () => { tempVal.textContent = Number(temp.value).toFixed(2); });

  // Enable toggle drives field disabled state.
  const enabled = view.querySelector("[data-field='enabled']");
  const fields = view.querySelector("[data-ai-fields]");
  const enabledLabel = view.querySelector("[data-enabled-label]");
  enabled.addEventListener("change", () => {
    fields.dataset.disabled = String(!enabled.checked);
    enabledLabel.textContent = enabled.checked ? "Enabled" : "Disabled";
    markDirty(view);
  });

  setupModelSelect(view);

  // Buttons.
  view.querySelector("[data-action='reload']").addEventListener("click", () => {
    loadAiSettings(view);
    toast.info("Settings reloaded.");
  });
  view.querySelector("[data-action='save']").addEventListener("click", () => saveAi(view));
}

async function loadAiSettings(view) {
  const status = view.querySelector("[data-status]");
  status.textContent = "Loading…";
  try {
    const [s, models] = await Promise.all([
      getOllama().catch(() => null),
      listModels().catch(() => []),
    ]);
    modelOptions = models || [];

    if (s === null) {
      // Backend unreachable — keep existing fields if we already have settings
      // (e.g. user just saved and backend is restarting), only use defaults on
      // the very first load when there is nothing yet to show.
      if (!currentSettings) {
        currentSettings = {
          enabled: false, apiKey: "", modelName: "qwen3.5:cloud",
          baseUrl: "https://api.ollama.com", temperature: 0.3, maxTokens: 1024,
        };
        populateFields(view);
      }
      status.textContent = "Could not reach backend at :8081.";
      return;
    }

    currentSettings = s;
    populateFields(view);
    dirty = false;
    view.querySelector("[data-action='save']").disabled = true;
    view.querySelector("[data-restart]").hidden = true;
    status.textContent = currentSettings.enabled
      ? "Connected — agent is live."
      : "AI is disabled. Toggle on to enable conversational edits.";
  } catch (err) {
    console.error(err);
    status.textContent = "Could not reach backend at :8081.";
  }
}

function populateFields(view) {
  const s = currentSettings;
  view.querySelector("[data-field='enabled']").checked = !!s.enabled;
  view.querySelector("[data-enabled-label]").textContent = s.enabled ? "Enabled" : "Disabled";
  view.querySelector("[data-ai-fields]").dataset.disabled = String(!s.enabled);

  view.querySelector("[data-field='apiKey']").value = s.apiKey || "";
  view.querySelector("[data-field='baseUrl']").value = s.baseUrl || "https://api.ollama.com";
  view.querySelector("[data-field='temperature']").value = s.temperature ?? 0.3;
  view.querySelector("[data-temp-val]").textContent = Number(s.temperature ?? 0.3).toFixed(2);
  view.querySelector("[data-field='maxTokens']").value = s.maxTokens ?? 1024;

  // Model dropdown.
  const opts = modelOptions.length ? modelOptions : [{ value: s.modelName, label: s.modelName, description: "" }];
  setModelDropdown(view, opts, s.modelName);
}

function parseTier(label) {
  if (/·\s*Paid/i.test(label)) return "paid";
  if (/·\s*Free/i.test(label)) return "free";
  return null;
}

function parseModelName(label) {
  return label.replace(/\s*·\s*(Paid|Free)\s*$/i, "").trim();
}

function openModelDropdown(trigger, dropdown) {
  trigger.classList.add("is-open");
  trigger.setAttribute("aria-expanded", "true");
  dropdown.hidden = false;
  if (!isReduced) {
    gsap.fromTo(dropdown,
      { opacity: 0, y: -6 },
      { opacity: 1, y: 0, duration: 0.18, ease: "expo.out", clearProps: "all" }
    );
  }
}

function closeModelDropdown(trigger, dropdown) {
  trigger.classList.remove("is-open");
  trigger.setAttribute("aria-expanded", "false");
  dropdown.hidden = true;
}

function setModelDropdown(view, opts, selectedValue) {
  const hiddenInput = view.querySelector("[data-field='modelName']");
  const dropdown = view.querySelector("[data-model-dropdown]");
  const selectedName = view.querySelector("[data-model-selected-name]");
  const selectedTier = view.querySelector("[data-model-selected-tier]");
  const hint = view.querySelector("[data-model-hint]");

  const allOpts = [...opts];
  if (!allOpts.find((m) => m.value === selectedValue)) {
    allOpts.push({ value: selectedValue, label: `${selectedValue} (custom)`, description: "" });
  }

  dropdown.innerHTML = allOpts.map((m) => {
    const tier = parseTier(m.label);
    const name = parseModelName(m.label);
    const isSelected = m.value === selectedValue;
    const tierHtml = tier
      ? `<span class="model-tier-badge model-tier-badge--${tier}">${tier === "paid" ? "Paid" : "Free"}</span>`
      : "";
    return `
      <button class="model-opt${isSelected ? " is-selected" : ""}"
              data-value="${m.value}" type="button" role="option" aria-selected="${isSelected}">
        <div class="model-opt__row">
          <span class="model-opt__name">${name}</span>
          ${tierHtml}
        </div>
        ${m.description ? `<p class="model-opt__desc">${m.description}</p>` : ""}
      </button>`;
  }).join("");

  const sel = allOpts.find((m) => m.value === selectedValue);
  if (sel) {
    const tier = parseTier(sel.label);
    selectedName.textContent = parseModelName(sel.label);
    if (tier) {
      selectedTier.textContent = tier === "paid" ? "Paid" : "Free";
      selectedTier.className = `model-tier-badge model-tier-badge--${tier}`;
      selectedTier.hidden = false;
    } else {
      selectedTier.hidden = true;
    }
  }

  hiddenInput.value = selectedValue;
  hint.textContent = sel?.description || "";
}

function setupModelSelect(view) {
  const trigger = view.querySelector("[data-model-trigger]");
  const dropdown = view.querySelector("[data-model-dropdown]");
  const hiddenInput = view.querySelector("[data-field='modelName']");
  const hint = view.querySelector("[data-model-hint]");

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dropdown.hidden) {
      openModelDropdown(trigger, dropdown);
    } else {
      closeModelDropdown(trigger, dropdown);
    }
  });

  dropdown.addEventListener("click", (e) => {
    const opt = e.target.closest(".model-opt");
    if (!opt) return;

    const value = opt.dataset.value;
    const found = modelOptions.find((m) => m.value === value)
      || { value, label: value, description: "" };

    hiddenInput.value = value;

    const selectedName = view.querySelector("[data-model-selected-name]");
    const selectedTier = view.querySelector("[data-model-selected-tier]");
    const tier = parseTier(found.label);
    selectedName.textContent = parseModelName(found.label);
    if (tier) {
      selectedTier.textContent = tier === "paid" ? "Paid" : "Free";
      selectedTier.className = `model-tier-badge model-tier-badge--${tier}`;
      selectedTier.hidden = false;
    } else {
      selectedTier.hidden = true;
    }

    hint.textContent = found.description || "";

    dropdown.querySelectorAll(".model-opt").forEach((b) => {
      b.classList.toggle("is-selected", b.dataset.value === value);
      b.setAttribute("aria-selected", String(b.dataset.value === value));
    });

    closeModelDropdown(trigger, dropdown);
    hiddenInput.dispatchEvent(new Event("change"));
  });

  document.addEventListener("click", () => {
    if (!dropdown.hidden) closeModelDropdown(trigger, dropdown);
  });
}

function markDirty(view) {
  if (!currentSettings) return;
  dirty = true;
  view.querySelector("[data-action='save']").disabled = false;
  view.querySelector("[data-status]").textContent = "Unsaved changes.";
}

async function saveAi(view) {
  const enabled = view.querySelector("[data-field='enabled']").checked;
  const apiKey = view.querySelector("[data-field='apiKey']").value.trim();
  const modelName = view.querySelector("[data-field='modelName']").value.trim();
  const baseUrl = view.querySelector("[data-field='baseUrl']").value.trim();
  const temperature = parseFloat(view.querySelector("[data-field='temperature']").value);
  const maxTokens = parseInt(view.querySelector("[data-field='maxTokens']").value, 10);

  if (enabled) {
    if (!apiKey) return toast.error("API key is required when AI is enabled.");
    if (!modelName) return toast.error("Pick a model.");
    if (!baseUrl) return toast.error("Base URL is required.");
    if (isNaN(temperature) || temperature < 0 || temperature > 2) return toast.error("Temperature must be 0–2.");
    if (isNaN(maxTokens) || maxTokens <= 0) return toast.error("Max tokens must be positive.");
  }

  const saveBtn = view.querySelector("[data-action='save']");
  saveBtn.disabled = true;
  view.querySelector("[data-status]").textContent = "Saving…";

  try {
    const res = await saveOllama({ enabled, apiKey, modelName, baseUrl, temperature, maxTokens });
    if (res?.success === false) throw new Error(res?.message || "Save failed");
    currentSettings = { enabled, apiKey, modelName, baseUrl, temperature, maxTokens };
    dirty = false;
    view.querySelector("[data-status]").textContent = "Saved.";
    if (res?.restartRequired) view.querySelector("[data-restart]").hidden = false;
    toast.success("Settings saved.");
  } catch (err) {
    console.error(err);
    saveBtn.disabled = false;
    view.querySelector("[data-status]").textContent = err?.message || "Save failed.";
    toast.error(err?.message || "Could not save settings.");
  }
}
