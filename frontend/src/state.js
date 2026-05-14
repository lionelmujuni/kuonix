// Tiny event-emitter store for cross-view state (theme, accent, mode, session).
// Persists a few fields to localStorage; everything else is in-memory.

const STORAGE_KEY = "kuonix.state.v1";

const defaults = {
  theme: "system",          // "light" | "dark" | "system"
  accent: "blue",           // preset id; custom hex stored under accentHex
  accentHex: null,
  mode: "single",           // "single" | "batch"
  agentRailCollapsed: false,
  sessionId: cryptoRandomId(),

  // Runtime session — never persisted across launches.
  // images[] is the source of truth; currentImage* are derived snapshots of
  // images[activeIndex] kept in sync for back-compat with existing consumers
  // (agent rail, edit view, histogram).
  images: [],               // [{path, url, taskId, issues, features, state, name, addedAt}]
  selectedPaths: [],        // backend paths the user has multiselected (batch only)
  activeIndex: -1,          // index into images[]; -1 if empty
  filterIssue: null,        // group-filter value (e.g. "ColorCast_Cool"); null = all

  currentImagePath: null,
  currentImageUrl: null,
  currentTaskId: null,
  currentIssues: [],
  currentFeatures: null,
  analysisState: "idle",    // idle | uploading | decoding | analyzing | ready | error
};

function cryptoRandomId() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return `s_${a[0].toString(36)}${a[1].toString(36)}`;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed, sessionId: defaults.sessionId };
  } catch {
    return { ...defaults };
  }
}

// Keys that survive a relaunch. Everything else is runtime/per-session.
const PERSISTED_KEYS = ["theme", "accent", "accentHex", "mode", "agentRailCollapsed"];

function persist(s) {
  const slice = {};
  for (const k of PERSISTED_KEYS) slice[k] = s[k];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(slice)); } catch {}
}

const state = load();
const listeners = new Map();

export function get(key) { return state[key]; }
export function getAll() { return { ...state }; }

export function set(key, value) {
  if (state[key] === value) return;
  state[key] = value;
  persist(state);
  emit(key, value);
}

export function update(patch) {
  let changed = false;
  for (const [k, v] of Object.entries(patch)) {
    if (state[k] !== v) { state[k] = v; changed = true; emit(k, v); }
  }
  if (changed) persist(state);
}

export function on(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key)?.delete(fn);
}

function emit(key, value) {
  listeners.get(key)?.forEach((fn) => { try { fn(value, state); } catch (e) { console.error(e); } });
}

// ---- Multi-image helpers ------------------------------------------------
//
// All edit-view code goes through these so the currentImage* mirrors and the
// "images" listener stay in sync automatically.

function emitImagesChanged() { emit("images", state.images); }

function syncActiveSnapshot() {
  const img = state.images[state.activeIndex] || null;
  state.currentImagePath  = img?.path  ?? null;
  state.currentImageUrl   = img?.url   ?? null;
  state.currentTaskId     = img?.taskId ?? null;
  state.currentIssues     = img?.issues   ?? [];
  state.currentFeatures   = img?.features ?? null;
  state.analysisState     = img?.state ?? "idle";
  // Emit on each so consumers wired to a single key keep working.
  emit("currentImagePath", state.currentImagePath);
  emit("currentImageUrl",  state.currentImageUrl);
  emit("currentIssues",    state.currentIssues);
  emit("currentFeatures",  state.currentFeatures);
  emit("analysisState",    state.analysisState);
  emit("activeIndex",      state.activeIndex);
}

export function addImage(record) {
  const idx = state.images.findIndex((r) => r.path === record.path);
  if (idx >= 0) {
    state.images[idx] = { ...state.images[idx], ...record };
  } else {
    state.images.push({ selected: true, addedAt: Date.now(), ...record });
    if (state.activeIndex < 0) state.activeIndex = state.images.length - 1;
  }
  emitImagesChanged();
  syncActiveSnapshot();
  emit("selectedPaths", getSelectedPaths());
}

export function updateImage(path, patch) {
  const idx = state.images.findIndex((r) => r.path === path);
  if (idx < 0) return;
  state.images[idx] = { ...state.images[idx], ...patch };
  emitImagesChanged();
  if (idx === state.activeIndex) syncActiveSnapshot();
}

// Rename an image's path in-place — used during the upload pipeline (tmpPath
// → real backend path) and after RAW decode (previewPath → fullPath). Avoids
// the remove+add cycle that would otherwise flicker layouts that key off
// images.length.
export function renameImage(oldPath, newPath, patch = {}) {
  const i = state.images.findIndex((r) => r.path === oldPath);
  if (i < 0) return false;
  state.images[i] = { ...state.images[i], ...patch, path: newPath };
  emitImagesChanged();
  if (i === state.activeIndex) syncActiveSnapshot();
  return true;
}

// Rename the active image's path in-place (path becomes the new working
// baseline). Used after a commit-correction event since the new file is the
// chain target for any subsequent prompts.
export function renameActiveImage(newPath, patch = {}) {
  const i = state.activeIndex;
  if (i < 0) return;
  state.images[i] = { ...state.images[i], ...patch, path: newPath };
  emitImagesChanged();
  syncActiveSnapshot();
}

export function setActiveByPath(path) {
  const idx = state.images.findIndex((r) => r.path === path);
  if (idx < 0 || idx === state.activeIndex) return;
  state.activeIndex = idx;
  syncActiveSnapshot();
}

export function setActiveIndex(i) {
  if (i < -1 || i >= state.images.length) return;
  if (i === state.activeIndex) return;
  state.activeIndex = i;
  syncActiveSnapshot();
}

export function removeImage(path) {
  const idx = state.images.findIndex((r) => r.path === path);
  if (idx < 0) return;
  state.images.splice(idx, 1);
  if (state.activeIndex >= state.images.length) state.activeIndex = state.images.length - 1;
  emitImagesChanged();
  syncActiveSnapshot();
  emit("selectedPaths", getSelectedPaths());
}

export function clearImages() {
  state.images = [];
  state.activeIndex = -1;
  state.filterIssue = null;
  emitImagesChanged();
  syncActiveSnapshot();
  emit("selectedPaths", []);
  emit("filterIssue", null);
}

export function toggleSelected(path, force) {
  const img = state.images.find((r) => r.path === path);
  if (!img) return;
  img.selected = (force == null) ? !img.selected : !!force;
  emitImagesChanged();
  emit("selectedPaths", getSelectedPaths());
}

export function selectAll(selected = true) {
  for (const img of state.images) img.selected = selected;
  emitImagesChanged();
  emit("selectedPaths", getSelectedPaths());
}

export function getSelectedPaths() {
  return state.images.filter((r) => r.selected).map((r) => r.path);
}

export function setFilterIssue(issue) {
  if (state.filterIssue === issue) return;
  state.filterIssue = issue || null;
  emit("filterIssue", state.filterIssue);
}

export function visibleImages() {
  if (!state.filterIssue) return state.images;
  return state.images.filter((r) => Array.isArray(r.issues) && r.issues.includes(state.filterIssue));
}

// Accent presets — name → rgb triple.
export const ACCENT_PRESETS = {
  blue:   { rgb: "59, 130, 246",  label: "Blue" },
  grey:   { rgb: "119, 124, 124", label: "Grey" },
  teal:   { rgb: "33, 128, 141",  label: "Teal" },
  purple: { rgb: "139, 92, 246",  label: "Purple" },
  pink:   { rgb: "236, 72, 153",  label: "Pink" },
  red:    { rgb: "227, 87, 71",   label: "Red" },
  orange: { rgb: "232, 140, 46",  label: "Orange" },
  amber:  { rgb: "212, 167, 44",  label: "Amber" },
  green:  { rgb: "76, 175, 80",   label: "Green" },
  cyan:   { rgb: "6, 182, 212",   label: "Cyan" },
};
