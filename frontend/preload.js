// Preload script for secure IPC communication
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    /**
     * Launch an external application with administrator privileges.
     *
     * @param {string} appPath - Absolute path to the application executable.
     * @param {string} targetPath - A string of one or more quoted arguments to pass to the application.
     * @returns {Promise<{success: boolean, error?: string}>} - A promise that resolves with the result.
     */
    launchApp: (appPath, args) => ipcRenderer.invoke("launch-app", appPath, args),
    searchExecutable: (filename) => ipcRenderer.invoke('search-executable', filename),
    searchExecutableAdmin: (filename) => ipcRenderer.invoke('search-executable-admin', filename),
    // Reference image selection API (Color Lab)
    selectReferenceImage: () => ipcRenderer.invoke('select-reference-image')
  });

contextBridge.exposeInMainWorld('darkmode', {
  toggle: () => ipcRenderer.invoke('dark-mode:toggle'),
  system: () => ipcRenderer.invoke('dark-mode:system')
});

// Expose help window API
contextBridge.exposeInMainWorld('help', {
  openWindow: () => ipcRenderer.invoke('open-help-window')
});

// Expose folder dialog API
contextBridge.exposeInMainWorld('dialog', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFolder: (path) => ipcRenderer.invoke('open-folder', path)
});