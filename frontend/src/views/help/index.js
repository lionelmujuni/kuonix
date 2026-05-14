// Help — quick start, prompt cookbook, agent tool reference, shortcuts.
//
// Static-only. Each section is collapsible so the page is scannable on first
// load. Uses the same card vocabulary as Settings.

import { gsap } from "../../../node_modules/gsap/index.js";
import { enterView, isReduced, buttonPulse } from "../../motion.js";

let ctx = null;
let outletRef = null;

const PROMPTS = [
  {
    title: "Auto white balance",
    text: "Fix the white balance — there's a slight blue cast on the wall.",
    bucket: "Color",
  },
  {
    title: "Lift shadows",
    text: "Open up the shadows a touch without crushing the highlights.",
    bucket: "Tone",
  },
  {
    title: "Portrait skin tone",
    text: "Warm the skin tones a little and don't oversaturate.",
    bucket: "Portrait",
  },
  {
    title: "Cinematic teal-and-orange",
    text: "Push it cooler in the shadows, warmer in the highlights, gentle vibrance.",
    bucket: "Look",
  },
  {
    title: "Recover overexposed sky",
    text: "Pull back the highlights — the sky is blown.",
    bucket: "Tone",
  },
  {
    title: "Vintage film",
    text: "Give it a faded film look — lifted blacks, muted reds, soft contrast.",
    bucket: "Look",
  },
  {
    title: "Restore yellowed scan",
    text: "This is an old scan with a yellow cast — neutralise it and add a bit of contrast.",
    bucket: "Restoration",
  },
  {
    title: "Match this reference",
    text: "Make this match the colour of the previously committed image.",
    bucket: "Batch",
  },
  {
    title: "Selective saturation",
    text: "Pull the reds back a touch — the dress is too saturated. Don't touch the greens.",
    bucket: "Color",
  },
];

const TOOLS = [
  {
    name: "analyzeImage",
    icon: "bi-graph-up",
    summary: "Reads exposure, contrast, white balance, saturation, and noise statistics.",
    detail: "Runs once when you upload — cached and reused for every later prompt.",
  },
  {
    name: "classifyIssues",
    icon: "bi-list-check",
    summary: "Tags the image with named issues (cool cast, underexposed, oversaturated…).",
    detail: "These are the chips you see in the analysis ribbon and the issue dots in the contact sheet.",
  },
  {
    name: "recommendCorrections",
    icon: "bi-lightbulb",
    summary: "Ranks correction algorithms for the detected issues.",
    detail: "The agent uses this to decide which method to call, not to ask you.",
  },
  {
    name: "describeAlgorithm",
    icon: "bi-book",
    summary: "Returns the full reference for one method (gray world, CLAHE, vibrance, etc.).",
    detail: "Useful when you want the agent to explain why it picked something.",
  },
  {
    name: "listWorkflows",
    icon: "bi-stack",
    summary: "Multi-step recipes (portrait restoration, sky rescue, denoise + sharpen…).",
    detail: "Try \"run the portrait restoration workflow\" to chain several steps.",
  },
  {
    name: "previewCorrection",
    icon: "bi-eye",
    summary: "Generates a preview that lands in the agent rail as a card.",
    detail: "Click Accept to commit, Discard to throw it away. Previews are always non-destructive.",
  },
  {
    name: "commitCorrection",
    icon: "bi-check2-square",
    summary: "Locks a correction in as the new working baseline.",
    detail: "Subsequent prompts chain on top of this — each commit becomes a node in the history strip.",
  },
  {
    name: "applyCorrection",
    icon: "bi-cloud-arrow-down",
    summary: "Saves the final image into your visible workspace folder.",
    detail: "Use the Export view to batch this across multiple images.",
  },
];

const SHORTCUTS = [
  { keys: ["1"],              desc: "Jump to Edit" },
  { keys: ["2"],              desc: "Jump to Library" },
  { keys: ["3"],              desc: "Jump to Export" },
  { keys: ["4"],              desc: "Jump to Settings" },
  { keys: ["5"],              desc: "Jump to Help" },
  { keys: ["/"],              desc: "Focus the agent prompt" },
  { keys: ["Enter"],          desc: "Send the current prompt" },
  { keys: ["Shift", "Enter"], desc: "New line in the prompt" },
  { keys: ["Ctrl", "B"],      desc: "Toggle Single ↔ Batch mode" },
  { keys: ["Ctrl", "."],      desc: "Collapse the agent rail" },
];

export function mount(outlet) {
  outletRef = outlet;
  outlet.innerHTML = "";

  const view = document.createElement("section");
  view.className = "view help-view";
  view.dataset.view = "help";
  outlet.appendChild(view);

  view.innerHTML = template();
  bindActions(view);

  ctx = enterView(outlet);

  if (!isReduced) {
    gsap.from(view.querySelectorAll(".help-card"), {
      opacity: 0, y: 12, duration: 0.4, ease: "expo.out",
      stagger: { each: 0.05, from: "start" }, clearProps: "all",
    });
  }
}

export function unmount() {
  ctx?.revert?.();
  ctx = null;
  outletRef = null;
}

// ---------------------------------------------------------------------------

function template() {
  return `
    <header class="view-header">
      <p class="eyebrow">Help</p>
      <h1 class="display-heading">Conversational darkroom</h1>
      <p class="muted help__subtitle">
        Drop an image. Tell the agent what you want. Accept the result.
        That's the loop — no sliders required.
      </p>
    </header>

    <div class="help__grid reveal">

      <section class="help-card help-card--quick">
        <h3 class="help-card__title"><i class="bi bi-rocket-takeoff"></i> Quick start</h3>
        <ol class="help__steps">
          <li>
            <strong>Drop or browse</strong> — JPEG, PNG, TIFF, BMP, WEBP, or RAW
            (CR2/3, NEF, ARW, DNG, RAF, ORF). Kuonix decodes RAW automatically.
          </li>
          <li>
            <strong>Wait for analysis</strong> — the ribbon shows detected issues
            (cool cast, oversaturation, blown highlights…) within a second or two.
          </li>
          <li>
            <strong>Prompt the agent</strong> — plain English in the bottom rail.
            See examples in the next section.
          </li>
          <li>
            <strong>Preview → Accept</strong> — a preview card appears in the rail.
            Accept commits the correction; subsequent prompts chain on top.
          </li>
          <li>
            <strong>Export</strong> — when the image is finished, the Export view
            saves it to your workspace folder.
          </li>
        </ol>
        <div class="help__modes">
          <div class="help__mode">
            <strong><i class="bi bi-image"></i> Single mode</strong>
            <p>One image, full ribbon + histogram. The agent works on the active image.</p>
          </div>
          <div class="help__mode">
            <strong><i class="bi bi-images"></i> Batch mode</strong>
            <p>Many images grouped by issue. Pick a subset, prompt once, the agent runs the same correction across the selection.</p>
          </div>
        </div>
      </section>

      <section class="help-card">
        <h3 class="help-card__title"><i class="bi bi-chat-quote"></i> Prompt cookbook</h3>
        <p class="muted help-card__hint">Copy any of these into the rail. They work on real images and are tuned for the agent's tool vocabulary.</p>
        <div class="help__prompts">
          ${PROMPTS.map(p => `
            <button class="help-prompt" data-prompt="${escapeAttr(p.text)}">
              <span class="help-prompt__bucket">${p.bucket}</span>
              <strong>${p.title}</strong>
              <span class="help-prompt__text">"${p.text}"</span>
              <i class="bi bi-clipboard help-prompt__copy"></i>
            </button>
          `).join("")}
        </div>
      </section>

      <section class="help-card">
        <h3 class="help-card__title"><i class="bi bi-tools"></i> What the agent can call</h3>
        <p class="muted help-card__hint">
          Eight tools wrap the backend. The agent picks which to call; you see each one
          appear as a card in the agent rail as it runs.
        </p>
        <ul class="help__tools">
          ${TOOLS.map(t => `
            <li class="help-tool">
              <span class="help-tool__icon"><i class="bi ${t.icon}"></i></span>
              <div>
                <code class="help-tool__name">${t.name}</code>
                <p class="help-tool__summary">${t.summary}</p>
                <p class="help-tool__detail muted">${t.detail}</p>
              </div>
            </li>
          `).join("")}
        </ul>
      </section>

      <section class="help-card">
        <h3 class="help-card__title"><i class="bi bi-keyboard"></i> Keyboard shortcuts</h3>
        <ul class="help__shortcuts">
          ${SHORTCUTS.map(s => `
            <li class="help-shortcut">
              <span class="help-shortcut__keys">
                ${s.keys.map(k => `<kbd>${k}</kbd>`).join('<span class="plus">+</span>')}
              </span>
              <span class="help-shortcut__desc">${s.desc}</span>
            </li>
          `).join("")}
        </ul>
      </section>

      <section class="help-card help-card--troubleshoot">
        <h3 class="help-card__title"><i class="bi bi-life-preserver"></i> Troubleshooting</h3>
        <details>
          <summary>Agent says "AI is disabled"</summary>
          <p>Open <a href="#/settings">Settings → AI</a>, toggle Ollama on, paste your key, save, and restart Kuonix.</p>
        </details>
        <details>
          <summary>RAW won't decode</summary>
          <p>Kuonix bundles LibRaw/dcraw binaries for Win, macOS, and Linux. If your camera's RAW format isn't listed in the dropzone subtitle, let us know — most can be added in a few minutes.</p>
        </details>
        <details>
          <summary>"Could not fetch image" right after upload</summary>
          <p>Backend at <code>localhost:8081</code> may have crashed. Check the dev console for a stack trace, then relaunch.</p>
        </details>
        <details>
          <summary>Agent picks the wrong correction</summary>
          <p>Be specific — name the algorithm ("use shades of gray", "apply vibrance") or the symptom ("the reds are crushed"). The agent will defer to explicit instructions.</p>
        </details>
      </section>

    </div>

    <style>
      .help-view { padding: 28px 32px 80px; max-width: 1080px; }
      .help__subtitle { margin-top: 8px; max-width: 540px; }

      .help__grid {
        display: grid; gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
      }
      .help-card--quick { grid-column: 1 / -1; }
      .help-card--troubleshoot { grid-column: 1 / -1; }

      .help-card {
        background: var(--color-surface);
        border: 1px solid var(--color-card-border);
        border-radius: 16px; padding: 22px;
        box-shadow: var(--shadow-sm);
      }
      .help-card__title {
        margin: 0 0 12px; font-size: 16px; font-weight: 600;
        display: flex; align-items: center; gap: 8px;
      }
      .help-card__title i { color: rgb(var(--accent-color-rgb)); }
      .help-card__hint { margin: 0 0 16px; font-size: 13px; line-height: 1.5; }

      .help__steps {
        margin: 0 0 20px; padding-left: 24px;
        font-size: 13px; line-height: 1.7; color: var(--color-text);
      }
      .help__steps li { margin-bottom: 8px; }
      .help__steps strong { color: rgb(var(--accent-color-rgb)); font-weight: 600; }

      .help__modes {
        display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
        margin-top: 12px;
      }
      @media (max-width: 600px) {
        .help__modes { grid-template-columns: 1fr; }
      }
      .help__mode {
        padding: 14px; border-radius: 12px;
        background: var(--color-secondary); border: 1px solid var(--color-border);
      }
      .help__mode strong {
        display: flex; align-items: center; gap: 6px;
        font-size: 13px; margin-bottom: 4px;
      }
      .help__mode p { margin: 0; font-size: 12px; line-height: 1.5; color: var(--color-text-secondary); }

      .help__prompts { display: flex; flex-direction: column; gap: 8px; }
      .help-prompt {
        position: relative; text-align: left; cursor: pointer;
        padding: 12px 14px; border-radius: 10px;
        background: var(--color-secondary); border: 1px solid var(--color-border);
        color: var(--color-text);
        display: grid; grid-template-columns: auto 1fr auto; gap: 4px 12px;
        align-items: center;
        transition: background var(--duration-fast) var(--ease-standard),
                    border-color var(--duration-fast) var(--ease-standard);
      }
      .help-prompt:hover {
        background: var(--color-secondary-hover);
        border-color: rgba(var(--accent-color-rgb), 0.5);
      }
      .help-prompt strong { font-size: 13px; grid-column: 2; }
      .help-prompt__bucket {
        grid-row: 1 / span 2; align-self: center;
        font-size: 10px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.05em;
        padding: 4px 8px; border-radius: 999px;
        background: rgba(var(--accent-color-rgb), 0.12);
        color: rgb(var(--accent-color-rgb));
      }
      .help-prompt__text {
        grid-column: 2; font-size: 12px; color: var(--color-text-secondary);
        font-style: italic;
      }
      .help-prompt__copy {
        grid-row: 1 / span 2; grid-column: 3;
        align-self: center; opacity: 0;
        transition: opacity var(--duration-fast) var(--ease-standard);
        color: var(--color-text-secondary);
      }
      .help-prompt:hover .help-prompt__copy { opacity: 1; }
      .help-prompt.is-copied .help-prompt__copy::before { content: "\\f26b"; color: #4caf50; }

      .help__tools { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
      .help-tool {
        display: grid; grid-template-columns: 36px 1fr; gap: 12px;
        padding: 12px; border-radius: 10px;
        background: var(--color-secondary); border: 1px solid var(--color-border);
      }
      .help-tool__icon {
        width: 36px; height: 36px; border-radius: 9px;
        background: rgba(var(--accent-color-rgb), 0.12);
        color: rgb(var(--accent-color-rgb));
        display: flex; align-items: center; justify-content: center;
        font-size: 16px;
      }
      .help-tool__name {
        font-size: 13px; font-weight: 600;
        background: var(--color-background);
        padding: 1px 8px; border-radius: 4px;
        font-family: var(--font-family-mono, monospace);
      }
      .help-tool__summary { margin: 6px 0 4px; font-size: 13px; line-height: 1.4; }
      .help-tool__detail { margin: 0; font-size: 12px; line-height: 1.5; }

      .help__shortcuts { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
      .help-shortcut {
        display: flex; justify-content: space-between; align-items: center;
        padding: 6px 0; border-bottom: 1px dashed var(--color-border);
        font-size: 13px;
      }
      .help-shortcut:last-child { border-bottom: 0; }
      .help-shortcut__keys { display: inline-flex; align-items: center; gap: 4px; }
      .help-shortcut__keys .plus { color: var(--color-text-secondary); font-size: 11px; }
      .help-shortcut__desc { color: var(--color-text-secondary); }

      kbd {
        font-family: var(--font-family-mono, monospace);
        font-size: 11px; font-weight: 600;
        padding: 2px 8px; border-radius: 5px;
        background: var(--color-secondary);
        border: 1px solid var(--color-border);
        border-bottom-width: 2px;
        color: var(--color-text);
      }

      details {
        padding: 10px 0; border-bottom: 1px solid var(--color-border);
      }
      details:last-child { border-bottom: 0; }
      summary {
        font-size: 13px; font-weight: 500; cursor: pointer;
        padding: 6px 0; list-style: none;
      }
      summary::-webkit-details-marker { display: none; }
      summary::before {
        content: "›"; display: inline-block; width: 16px;
        color: rgb(var(--accent-color-rgb)); font-weight: 700;
        transition: transform var(--duration-fast) var(--ease-standard);
      }
      details[open] summary::before { transform: rotate(90deg); }
      details p {
        margin: 6px 0 8px 16px; font-size: 12px; line-height: 1.6;
        color: var(--color-text-secondary);
      }
      details p code {
        background: var(--color-secondary); padding: 1px 6px; border-radius: 4px;
      }
      details a { color: rgb(var(--accent-color-rgb)); }
    </style>
  `;
}

function bindActions(view) {
  // Click a prompt → copy to clipboard.
  view.querySelectorAll(".help-prompt").forEach((btn) => {
    btn.addEventListener("click", async () => {
      buttonPulse(btn);
      const text = btn.dataset.prompt;
      try {
        await navigator.clipboard.writeText(text);
        btn.classList.add("is-copied");
        const icon = btn.querySelector(".help-prompt__copy");
        const original = icon.className;
        icon.className = "bi bi-check2 help-prompt__copy";
        setTimeout(() => {
          btn.classList.remove("is-copied");
          icon.className = original;
        }, 1400);
      } catch (e) {
        console.warn("clipboard write failed", e);
      }
    });
  });
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
