import { afterEach, vi } from 'vitest';

// matchMedia polyfill — motion.js reads it at module load.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// URL.createObjectURL / revokeObjectURL — used by image preview code paths.
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:mock';
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

// PointerEvent — jsdom does not implement it; alias to MouseEvent so pointer
// event listeners can be exercised in tests.
if (!window.PointerEvent) window.PointerEvent = window.MouseEvent;

// Electron preload globals — preload.js exposes these on window for the
// renderer. In jsdom they don't exist, so install vi.fn() shaped stubs.
function installIpcStubs() {
  globalThis.api = {
    selectFolder: vi.fn(),
    openFolder: vi.fn(),
    selectReferenceImage: vi.fn(),
    launchApp: vi.fn(),
    searchExecutable: vi.fn(),
    searchExecutableAdmin: vi.fn(),
  };
  globalThis.darkmode = {
    toggle: vi.fn(),
    system: vi.fn(),
  };
  globalThis.help = {
    open: vi.fn(),
  };
  globalThis.dialog = {
    selectFolder: vi.fn(),
  };
}

installIpcStubs();

// Default fetch mock — individual tests override per case.
globalThis.fetch = vi.fn();

afterEach(() => {
  vi.clearAllMocks();
  // Reset localStorage between tests so state.js persistence is isolated.
  localStorage.clear();
});
