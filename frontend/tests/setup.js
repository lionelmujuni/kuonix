// Global mocks for Electron IPC bridge — applied before every test file.
// This prevents "window.api is not defined" errors in modules that call
// window.api.*, window.darkmode.*, window.dialog.*, or window.help.*

window.api = {
  launchApp: vi.fn().mockResolvedValue(undefined),
  searchExecutable: vi.fn().mockResolvedValue(null),
  searchExecutableAdmin: vi.fn().mockResolvedValue(null),
  selectReferenceImage: vi.fn().mockResolvedValue(null),
};

window.darkmode = {
  toggle: vi.fn().mockResolvedValue('dark'),
  system: vi.fn().mockResolvedValue(undefined),
};

window.dialog = {
  selectFolder: vi.fn().mockResolvedValue(null),
  openFolder: vi.fn().mockResolvedValue(undefined),
};

window.help = {
  openWindow: vi.fn().mockResolvedValue(undefined),
};

// ResizeObserver is not implemented in jsdom — provide a no-op stub so any
// module that calls `new ResizeObserver(...).observe(el)` doesn't throw.
globalThis.ResizeObserver = class ResizeObserver {
  constructor(_cb) {}
  observe() {}
  unobserve() {}
  disconnect() {}
};
