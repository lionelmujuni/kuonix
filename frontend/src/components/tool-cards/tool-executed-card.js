// Generic tool-executed card — fires for every @Tool call the agent makes.
//
// Backend payload: { name, arguments, result, truncated }
// We render a slim row: icon, prettified tool name, one-line summary parsed
// from the result. Visually lighter than the rich preview/commit cards so
// the heavy moments still pop.

import { gsap } from "../../../node_modules/gsap/index.js";
import { isReduced } from "../../motion.js";

const TOOL_META = {
  analyzeImage:          { icon: "bi-graph-up",       label: "Analyzed image" },
  classifyIssues:        { icon: "bi-tags",           label: "Classified issues" },
  recommendCorrections:  { icon: "bi-list-stars",     label: "Recommended corrections" },
  describeAlgorithm:     { icon: "bi-book",           label: "Looked up algorithm" },
  listWorkflows:         { icon: "bi-collection",     label: "Reviewed workflows" },
  previewCorrection:     { icon: "bi-eye",            label: "Previewed correction" },
  commitCorrection:      { icon: "bi-check2-circle",  label: "Committed correction" },
  applyCorrection:       { icon: "bi-box-arrow-up",   label: "Exported image" },
};

// These two have rich cards already; the rail filters them out before calling us.
export const TOOLS_HIDDEN_BY_DEFAULT = new Set(["previewCorrection", "commitCorrection"]);

export function renderToolExecutedCard({ name, arguments: argsJson, result, truncated }) {
  const meta = TOOL_META[name] || { icon: "bi-tools", label: name || "Tool" };
  const summary = summarize(name, argsJson, result, truncated);

  const card = document.createElement("article");
  card.className = "tool-executed";
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", `${meta.label}: ${summary}`);
  card.innerHTML = `
    <span class="tool-executed__icon"><i class="bi ${meta.icon}"></i></span>
    <span class="tool-executed__body">
      <span class="tool-executed__title">${escapeHtml(meta.label)}</span>
      <span class="tool-executed__summary"></span>
    </span>
  `;
  card.querySelector(".tool-executed__summary").textContent = summary;

  if (!isReduced) {
    gsap.fromTo(card,
      { opacity: 0, x: -8 },
      { opacity: 1, x: 0, duration: 0.3, ease: "expo.out" });
  }
  return card;
}

// Best-effort one-liner. Falls back to the raw (truncated) result so the user
// can always see *something*, even for unknown tools or unusual outputs.
function summarize(name, argsJson, result, truncated) {
  const args = parseLoose(argsJson);
  const r = (result || "").trim();

  switch (name) {
    case "analyzeImage": {
      const f = parseLoose(r);
      if (f && typeof f === "object") {
        const parts = [];
        if (f.medianY != null) parts.push(`luma ${fmt(f.medianY)}`);
        if (f.meanS != null)   parts.push(`sat ${fmt(f.meanS)}`);
        if (f.castAngleDeg != null) parts.push(`cast ${fmt(f.castAngleDeg)}°`);
        if (parts.length) return `${args?.imagePath ? filenameOf(args.imagePath) + " — " : ""}${parts.join(", ")}`;
      }
      return args?.imagePath ? `Read ${filenameOf(args.imagePath)}` : truncate(r, 80);
    }
    case "classifyIssues": {
      if (r.toLowerCase() === "none") return "No issues detected";
      const parts = r.split(",").map((s) => s.trim()).filter(Boolean);
      return `${parts.length} issue${parts.length === 1 ? "" : "s"}: ${parts.slice(0, 3).join(", ")}${parts.length > 3 ? "…" : ""}`;
    }
    case "recommendCorrections": {
      const arr = parseLoose(r);
      if (Array.isArray(arr)) {
        const top = arr.slice(0, 3).map((x) => x?.algorithmId || "?").join(", ");
        return `${arr.length} ranked${top ? " — " + top + (arr.length > 3 ? "…" : "") : ""}`;
      }
      return truncate(r, 80);
    }
    case "describeAlgorithm": {
      return args?.algoId ? `Looked up ${args.algoId}` : truncate(r, 80);
    }
    case "listWorkflows": {
      const arr = parseLoose(r);
      if (Array.isArray(arr)) return `${arr.length} workflows`;
      return truncate(r, 80);
    }
    case "applyCorrection": {
      // Tool returns a path string.
      return r ? `Exported ${filenameOf(r)}` : "Exported";
    }
    case "previewCorrection":
    case "commitCorrection": {
      return args?.method ? `${args.method}` : truncate(r, 80);
    }
    default:
      return truncated ? truncate(r, 80) + " (truncated)" : truncate(r, 80);
  }
}

function parseLoose(s) {
  if (s == null) return null;
  if (typeof s !== "string") return s;
  const trimmed = s.trim();
  if (!trimmed) return null;
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return null;
  try { return JSON.parse(trimmed); } catch { return null; }
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "?";
  if (Math.abs(n) < 1) return n.toFixed(2);
  if (Math.abs(n) < 10) return n.toFixed(1);
  return Math.round(n).toString();
}

function truncate(s, max) {
  s = String(s ?? "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function filenameOf(p) {
  if (!p) return "";
  const seg = String(p).split(/[\\/]/);
  return seg[seg.length - 1] || p;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
