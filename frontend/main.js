const { app, BrowserWindow, ipcMain, nativeTheme, protocol, shell } = require('electron');
const path = require('path');
const sudo = require('sudo-prompt');
const url = require('url');
const { spawn } = require('child_process');
const { execFile } = require('child_process');
const kill = require('tree-kill');
let backendProcess = null; // To hold backend process reference
let helpWindow = null; // Track help window instance

/**
 * Get the path to the dcraw_emu binary for the current platform
 * @returns {string} Absolute path to dcraw_emu executable
 */
function getDcrawEmuPath() {
  const platform = process.platform;
  const binName = platform === 'win32' ? 'dcraw_emu.exe' : 'dcraw_emu';
  return path.join(app.getAppPath(), 'bin', platform, binName);
}

// Start backend when Electron starts
function startBackend() {
  const jarPath = path.join(app.getAppPath(), 'kuonix.jar');
  
  // Spawn a child process with hidden window (no console popup)
  // Using javaw.exe on Windows instead of java.exe prevents console window
  const javaExecutable = process.platform === 'win32' ? 'javaw' : 'java';
  
  // Add JVM arguments to suppress Java 25 warnings and enable native access for OpenCV
  const jvmArgs = [
    '--enable-native-access=ALL-UNNAMED',  // Allow native library loading
    '-Djava.util.logging.config.file=logging.properties',  // Suppress verbose logging
    '-jar',
    jarPath
  ];
  
  // Prepare environment variables for RAW image processing
  const dcrawPath = getDcrawEmuPath();
  const dcrawCacheDir = path.join(app.getPath('userData'), '.dcraw-cache');
  
  backendProcess = spawn(javaExecutable, jvmArgs, {
    detached: true,
    windowsHide: true,  // Hides the console window on Windows
    stdio: ['ignore', 'pipe', 'pipe'],  // Keep stdout/stderr for logging
    env: {
      ...process.env,
      DCRAW_PATH: dcrawPath,
      DCRAW_CACHE_DIR: dcrawCacheDir
    }
  });

  backendProcess.stdout.on("data", (data) => {
    console.log(`Backend: ${data}`);
  });

  backendProcess.stderr.on("data", (data) => {
    // Filter out Java 25 compatibility warnings to reduce noise
    const msg = data.toString();
    if (!msg.includes('WARNING:') && !msg.includes('sun.misc.Unsafe')) {
      console.error(`Backend Error: ${msg}`);
    }
  });

  backendProcess.on("close", (code) => {
    console.log(`Backend stopped with code ${code}`);
  });
};

function createWindow () {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    backgroundColor: '#fcfcf9',
    titleBarStyle: 'default',
    show: false
  });

  win.loadFile('index.html');

  // Show window when ready to prevent visual flash
  win.once('ready-to-show', () => {
    win.show();
  });

  // Open DevTools in development (uncomment if needed)
  // win.webContents.openDevTools();
}

/**
 * Creates a help window with proper Electron best practices
 * - Prevents white flash with backgroundColor + show: false
 * - Uses ready-to-show event for smooth appearance
 * - Implements singleton pattern to prevent multiple windows
 * - Direct navigation to help section via URL hash
 * - Proper cleanup on window close
 */
function createHelpWindow() {
  // Singleton pattern: return existing window if already open
  if (helpWindow && !helpWindow.isDestroyed()) {
    helpWindow.focus();
    return;
  }

  // Create window with proper configuration
  helpWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#ffffff', // Match website background to prevent flash
    show: false, // Don't show until ready
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      // Security: disable web security features for external content
      webSecurity: true,
      // Allow navigation to external URL
      navigateOnDragDrop: false
    },
    title: 'Help & Documentation'
  });

  // Load the help page directly with hash to navigate to help section
  // This is the proper way to open external URLs in Electron
  const helpUrl = 'https://color-correction-helper.free.nf/#help';
  helpWindow.loadURL(helpUrl);

  // Show window only when ready to prevent white flash
  helpWindow.once('ready-to-show', () => {
    helpWindow.show();
  });

  // Handle external links properly - open in default browser
  helpWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in system browser instead of new window
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Optional: Handle navigation to external domains
  helpWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const allowedDomain = 'color-correction-helper.free.nf';
    
    // Allow navigation within the help domain
    if (parsedUrl.hostname !== allowedDomain) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });

  // Clean up reference when window is closed
  helpWindow.on('closed', () => {
    helpWindow = null;
  });

  // Optional: Log when page finishes loading
  helpWindow.webContents.on('did-finish-load', () => {
    console.log('Help window loaded successfully');
  });

  // Handle load failures gracefully
  helpWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Help window failed to load:', errorCode, errorDescription);
    // Could show an error dialog here
  });
}

ipcMain.handle('dark-mode:toggle', () => {
  if (nativeTheme.shouldUseDarkColors) {
    nativeTheme.themeSource = 'light'
  } else {
    nativeTheme.themeSource = 'dark'
  }
  return nativeTheme.shouldUseDarkColors
});

ipcMain.handle('dark-mode:system', () => {
  nativeTheme.themeSource = 'system'
});

// IPC handler for opening help window
ipcMain.handle('open-help-window', () => {
  createHelpWindow();
});

// IPC handler for folder selection
ipcMain.handle('select-folder', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Output Folder for Organized Images',
    buttonLabel: 'Select Folder'
  });
  return result.canceled ? null : result.filePaths[0];
});

// IPC handler to open folder in system explorer
ipcMain.handle('open-folder', async (event, folderPath) => {
  shell.openPath(folderPath);
});

// IPC handler for reference image selection (Color Lab)
ipcMain.handle('select-reference-image', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Select Reference Image',
    buttonLabel: 'Select',
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'cr2', 'nef', 'arw', 'dng'] }
    ]
  });
  return result.canceled ? null : { filePath: result.filePaths[0] };
});

ipcMain.handle("launch-app", async (event, appPath, args) => {
  return new Promise((resolve, reject) => {
    const child = execFile(appPath, args, (error) => {
      if (error) {
        console.error("Launch error:", error);
        reject(error);
      } else {
        resolve("Launched successfully");
      }
    });
  });
});

ipcMain.handle('search-executable', async (event, filename) => {
  return searchExecutableQuick(filename);
});

// Admin deep search: ONLY used from Settings when user opts in
ipcMain.handle('search-executable-admin', async (event, filename) => {
  return searchExecutableAdmin(filename);
});

function searchExecutableQuick(filename) {
  return new Promise((resolve, reject) => {
    let cmd;

    if (process.platform === 'win32') {
      cmd = `where ${filename}`;
    } else if (process.platform === 'darwin') {
      cmd = `mdfind "kMDItemFSName == '${filename}'" | head -n 1`;
    } else {
      cmd = `which ${filename} || whereis ${filename}`;
    }

    execFile(cmd.split(' ')[0], cmd.split(' ').slice(1), (err, stdout, stderr) => {
      if (!err && stdout && stdout.trim()) {
        const first = stdout.trim().split(/\r?\n/)[0];
        return resolve(first);
      }
      reject(new Error(`Executable ${filename} not found in PATH`));
    });
  });
}

function searchExecutableAdmin(filename) {
  return new Promise((resolve, reject) => {
    const adminCmd = getAdminSearchCommand(filename);
    if (!adminCmd) {
      return reject(new Error(`No admin search command for ${filename}`));
    }

    const options = { name: 'Electron App' };

    sudo.exec(adminCmd, options, (error, out, errOut) => {
      // User can cancel → error will be non-null
      if (error || !out || !out.trim()) {
        console.error('Admin search error or cancelled:', error || errOut);
        // "Skip the search if permission is not granted" -> just reject
        return reject(new Error(errOut || 'Admin search cancelled or no result.'));
      }
      const first = out.trim().split(/\r?\n/)[0];
      resolve(first);
    });
  });
}

function getAdminSearchCommand(filename) {
  if (process.platform === 'win32') {
    // admin via PowerShell
    return `powershell -Command "Get-ChildItem -Path C:\\ -Filter '${filename}' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName"`;
  }

  // macOS & Linux: scan filesystem
  return `find / -name "${filename}" 2>/dev/null | head -n 1`;
}

app.whenReady().then(() => {
  createWindow();
  startBackend();
  protocol.registerFileProtocol('img', (request, callback) => {
    const filePath = url.fileURLToPath('file://' + request.url.slice('atom://'.length))
    callback(filePath)
  })
});

// Kill backend on app exit
app.on('before-quit', () => {
  if (backendProcess) {
    kill(backendProcess.pid);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});