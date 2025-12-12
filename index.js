const { app, BrowserWindow, ipcMain, screen, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');
const activeWin = require('active-win');

let mainWindow;
let tray = null;
let settingsWindow = null;
let visibilityMode = "focused";
let overlayOpacity = 1.0;

let constantsCache = null; // ⬅ main stores constants to broadcast updates

// Define the space needed for the notification bar
const NOTIFICATION_HEIGHT = 30;
const GOLD_WIDTH = 150;


async function updateOverlayVisibility() {
  if (!mainWindow) return;

  if (visibilityMode === "hidden") {
    mainWindow.hide();
    return;
  }

  if (visibilityMode === "visible") {
    mainWindow.setOpacity(overlayOpacity);
    mainWindow.showInactive();
    return;
  }

  if (visibilityMode === "focused") {
    const win = await activeWin().catch(() => null);
    const isDotaFocused =
      win?.owner?.name?.toLowerCase() === "dota2.exe" ||
      win?.title?.toLowerCase()?.includes("dota");

    if (isDotaFocused) {
      mainWindow.setOpacity(overlayOpacity);
      mainWindow.showInactive();
    } else {
      mainWindow.hide();
    }
  }
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  // Use values from constantsCache if available, otherwise use defaults
  const overlayWidth = constantsCache?.overlayWidth || width; 
  const overlayHeight = constantsCache?.overlayHeight || 400;

  // FIX: Add notification height to total window height
  const newWindowHeight = overlayHeight + NOTIFICATION_HEIGHT;
  const newWindowWidth = overlayWidth + GOLD_WIDTH;

  mainWindow = new BrowserWindow({
    width: newWindowWidth,
    height: newWindowHeight,
    x: 0,
    // FIX: Shift window up by the new total height to keep the bottom edge in place
    y: height - newWindowHeight, 
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setIgnoreMouseEvents(true);
  mainWindow.loadFile('overlay.html');

  // mainWindow.webContents.openDevTools({ mode: 'detach' }); // Commented out devtools for production use
}

// ------------------------------------------------------
// EXPRESS GSI SERVER
// ------------------------------------------------------
function startGSIServer() {
  const expressApp = express();
  expressApp.use(express.json());

  expressApp.post('/gsi', (req, res) => {
    const data = req.body;

    if (data && data.map) {
      const clockTime = parseFloat(data.map.clock_time || 0);
      const alive = data.hero?.alive || false;
      const paused = data.map.paused || false;
      const homeTeam = data.player?.team_name;
      const unreliableGold = data.player?.gold_unreliable;

      const gameData = {
        clockTime: clockTime,
        mapName: data.map.name || 'unknown',
        alive: alive,
        paused: paused,
        homeTeam: homeTeam,
        unreliableGold: unreliableGold
      };

      if (mainWindow) {
        mainWindow.webContents.send('game-data', gameData);
      }
    }

    res.json({ status: 'ok' });
  });

  expressApp.listen(3000, '0.0.0.0', () => {
    console.log('GSI server listening on port 3000');
  });
}

// ------------------------------------------------------
// TRAY MENU
// ------------------------------------------------------
function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Visibility: ${visibilityMode}`,
      submenu: [
        { label: "Visible", type: "radio", checked: visibilityMode === "visible", click: () => { visibilityMode = "visible"; updateOverlayVisibility(); updateTrayMenu(); }},
        { label: "Hidden",  type: "radio", checked: visibilityMode === "hidden",  click: () => { visibilityMode = "hidden"; updateOverlayVisibility(); updateTrayMenu(); }},
        { label: "Focused", type: "radio", checked: visibilityMode === "focused", click: () => { visibilityMode = "focused"; updateOverlayVisibility(); updateTrayMenu(); }}
      ]
    },
    {
      label: "Opacity",
      submenu: [
        { label: "100%", type: "radio", checked: overlayOpacity === 1,    click: () => { overlayOpacity = 1; updateOverlayVisibility(); }},
        { label: "75%",  type: "radio", checked: overlayOpacity === 0.75, click: () => { overlayOpacity = 0.75; updateOverlayVisibility(); }},
        { label: "50%",  type: "radio", checked: overlayOpacity === 0.5,  click: () => { overlayOpacity = 0.5; updateOverlayVisibility(); }},
        { label: "25%",  type: "radio", checked: overlayOpacity === 0.25, click: () => { overlayOpacity = 0.25; updateOverlayVisibility(); }},
        { label: "0% (Invisible)", type: "radio", checked: overlayOpacity === 0, click: () => { overlayOpacity = 0; updateOverlayVisibility(); }}
      ]
    },
    {
      label: "Settings",
      click: openSettingsWindow
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit()
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 720,
    height: 618,
    useContentSize: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'settingsPreload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile('settings.html');
  settingsWindow.removeMenu();

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  // settingsWindow.webContents.openDevTools({ mode: 'detach' }); // Commented out devtools for production use
}

function createTray() {
  const iconPath = path.join(__dirname, "icon.ico");

  if (!tray) {
    tray = new Tray(iconPath);
    tray.setToolTip("Dota 2 Overlay");

    tray.on("click", () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) mainWindow.hide();
      else mainWindow.showInactive();
    });
  }

  updateTrayMenu();
}

function startFocusWatcher() {
  setInterval(updateOverlayVisibility, 500);
}

// ------------------------------------------------------
// Load constants BEFORE creating the window
// ------------------------------------------------------
async function loadConstants() {
  try {
    const raw = fs.readFileSync("./resources/gameConstants.json", 'utf8');
    constantsCache = JSON.parse(raw);   // ⬅ store it in memory
  } catch (err) {
    console.error('Failed to load gameConstants.json', err);
    constantsCache = {}; // Initialize as empty object to prevent errors
  }
}

// ------------------------------------------------------
// APP LIFECYCLE
// ------------------------------------------------------
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Second instance launched: quit immediately
  app.quit();
} else {
  // First instance launched: set up event handler and start app logic

  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus the main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.showInactive(); // Use showInactive to avoid stealing focus
    }
    if (settingsWindow) {
      settingsWindow.focus();
    }
  });


  app.whenReady().then(async () => {
    await loadConstants(); // Wait for constants to load
    createWindow();
    startGSIServer();
    createTray();
    startFocusWatcher();

    app.on('activate', () => {
      // On macOS, recreate a window when dock icon is clicked and no other windows are open.
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Only quit application completely if it's not macOS
    app.quit();
  }
});


// ------------------------------------------------------
// IPC: Load & Save constants
// ------------------------------------------------------
ipcMain.handle('load-constants', async () => {
  // If constants are already loaded, return them. 
  if (constantsCache) return constantsCache;

  try {
    const raw = fs.readFileSync("./resources/gameConstants.json", 'utf8');
    constantsCache = JSON.parse(raw);   // ⬅ store it in memory
    return constantsCache;
  } catch (err) {
    console.error('Failed to load gameConstants.json', err);
    return null;
  }
});

ipcMain.on('save-waypoints', (event, updatedConstants) => {
  try {
    constantsCache = updatedConstants; // keep cache updated
    fs.writeFileSync("./resources/gameConstants.json", JSON.stringify(updatedConstants, null, 2));
    console.log('gameConstants.json updated.');
  } catch (err) {
    console.error('Failed to save gameConstants.json', err);
  }
});

ipcMain.on("overlay-size-changed", (event, newSize) => {
  // Update cached constants with new size
  if (constantsCache) {
    constantsCache.overlayWidth = newSize.width;
    constantsCache.overlayHeight = newSize.height;
  }

  // Send the new size to the overlay window
  if (mainWindow) {
    // FIX: Send the notification height offset
    mainWindow.webContents.send("overlay-size-updated", {
        width: newSize.width,
        height: newSize.height,
        notificationHeight: NOTIFICATION_HEIGHT, 
        goldWidth: GOLD_WIDTH
    }); 
  }

  // Also adjust the Electron main window's size and position
  if (mainWindow) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { height } = primaryDisplay.bounds;

    const overlayWidth = newSize.width;
    const overlayHeight = newSize.height;

    const newWindowHeight = overlayHeight + NOTIFICATION_HEIGHT;
    const newWindowWidth = overlayWidth + GOLD_WIDTH;

    // Set the main window's new size
    mainWindow.setSize(overlayWidth, newWindowHeight);
    // FIX: Reposition the main window to be at the bottom of the screen, shifted up by the new total height
    mainWindow.setPosition(0, height - newWindowHeight);

    console.log("Overlay size changed → broadcast & resize:", newSize);
  }
});

// ------------------------------------------------------
// IPC: Template switching — BROADCAST TO ALL WINDOWS
// ------------------------------------------------------
ipcMain.on("active-template-changed", (event, newIndex) => {
  if (!constantsCache) return;

  constantsCache.activeTemplateIndex = newIndex;
  
  // 💡 NEW: Get the full template object from the cache
  const activeTemplate = constantsCache.templates[newIndex]; 

  // Send updated index to settings window (it still needs the index)
  if (settingsWindow) {
    settingsWindow.webContents.send("active-template-updated", newIndex);
  }

  // Send the full TEMPLATE OBJECT to the overlay window
  if (mainWindow) {
    // Note: We use the same name as the overlay's listener
    mainWindow.webContents.send("active-template-changed", activeTemplate); 
  }

  console.log("Template updated → broadcast:", activeTemplate.name);
});