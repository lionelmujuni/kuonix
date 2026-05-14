// Tiny pub/sub event bus. Used to decouple the agent rail (shell-level) from
// the edit view's stage (view-level) — the rail emits stage events; the edit
// view listens while mounted and unsubscribes on unmount.

const handlers = new Map();

export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  return () => off(event, fn);
}

export function off(event, fn) { handlers.get(event)?.delete(fn); }

export function emit(event, payload) {
  const set = handlers.get(event);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch (e) { console.error(`bus[${event}]`, e); }
  }
}

// Event names — keep in one place so spelling stays consistent.
export const EVENTS = {
  STAGE_SET_IMAGE: "kuonix:stage:set-image",   // payload: { src }
  STAGE_RIPPLE:    "kuonix:stage:ripple",      // no payload
  STAGE_RESTORE:   "kuonix:stage:restore",     // payload: { src, path } — from history click
};
