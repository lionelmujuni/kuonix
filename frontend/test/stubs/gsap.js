// No-op GSAP stub for Vitest. Animations are not under test — see CLAUDE.md
// rule: "do not test gsap". Each method returns a tween-like with .kill()
// and a thenable interface so awaiters resolve immediately.

const tween = {
  kill: () => {},
  pause: () => tween,
  play: () => tween,
  resume: () => tween,
  reverse: () => tween,
  progress: () => tween,
  then: (resolve) => { resolve?.(); return Promise.resolve(); },
};

const noop = () => tween;

export const gsap = {
  to: noop,
  from: noop,
  fromTo: noop,
  set: noop,
  timeline: () => ({
    to: noop, from: noop, fromTo: noop, set: noop,
    add: noop, addLabel: noop, call: noop,
    kill: () => {}, pause: () => {}, play: () => {},
    progress: () => 0, then: (r) => { r?.(); return Promise.resolve(); },
  }),
  context: () => ({ revert: () => {}, kill: () => {}, add: noop }),
  quickTo: () => () => tween,
  registerPlugin: () => {},
  ticker: { add: () => {}, remove: () => {}, lagSmoothing: () => {} },
  utils: {
    toArray: (x) => (Array.isArray(x) ? x : [x]),
    clamp: (min, max, v) => Math.min(max, Math.max(min, v)),
    interpolate: (a, b) => () => a,
    mapRange: () => () => 0,
  },
  defaults: () => {},
  killTweensOf: () => {},
};

export default gsap;
