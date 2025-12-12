let constants = null;
let notifications = {}; // notifications from active template
let notificationOffset = 0; // FIX: Store the vertical offset

// -------------------------------------------------
// Load game constants and the currently active template
// -------------------------------------------------
async function loadGameConstants() {
  try {
    constants = await window.electron.ipcRenderer.invoke("load-constants");
    if (!constants) return null;

    // Ensure templates exist
    if (!constants.templates || constants.templates.length === 0) {
      constants.templates = Array.from({ length: 5 }, (_, i) => ({
        name: `Template ${i + 1}`,
        notifications: {}
      }));
      constants.activeTemplateIndex = 0;
    }

    if (typeof constants.activeTemplateIndex !== "number") {
      constants.activeTemplateIndex = 0;
    }

    // Set active notifications
    const activeTemplate = constants.templates[constants.activeTemplateIndex];
    notifications = activeTemplate.notifications || {};

    // Initial size setup (using fixed 30px offset for notification)
    const initialWidth = constants.overlayWidth || 325;
    const initialHeight = constants.overlayHeight || 325;
    
    canvas.width = initialWidth;
    canvas.height = initialHeight;
    
    // Use the hardcoded value for initial load since the config doesn't store it
    notificationOffset = 30; 
    
    // Set initial gold canvas size to full window
    gold.width = window.innerWidth; // Will be initialWidth
    gold.height = window.innerHeight; // Will be initialHeight + notificationOffset

    return constants;
  } catch (err) {
    console.error("Error loading game constants:", err);
    return null;
  }
}

// -------------------------------------------------
// Initial load
// -------------------------------------------------
(async () => {
  const loaded = await loadGameConstants();
  if (!loaded) return;

  console.log("Loaded constants:", loaded);

  window.LANES = loaded.lanes;
  window.MAP_MIN = -8000;
  window.MAP_MAX = 8000;
  window.MAP_SIZE = MAP_MAX - MAP_MIN;
  window.LANE_SEGMENT_TIMINGS_RADIANT = loaded.laneSegmentTimings;
  window.LANE_SEGMENT_TIMINGS_DIRE = loaded.laneSegmentTimingsDire;
  window.CREEP_SPAWN_INTERVAL = 30;
  window.FIRST_SPAWN_TIME = 0;
})();

// -------------------------------------------------
// 🔄 TEMPLATE CHANGED (live update from settings)
// -------------------------------------------------
window.electron.ipcRenderer.on("active-template-changed", (event, template) => {
  if (!template || typeof template.notifications !== "object") {
    console.warn("[Overlay] Received invalid template:", template);
    return;
  }

  console.log("[Overlay] Active template updated:", template.name);

  notifications = template.notifications || {}; 
});

// -------------------------------------------------
// 🔄 Overlay canvas size update only (IPC from index.js)
// -------------------------------------------------
window.electron.ipcRenderer.on("overlay-size-updated", (event, newSize) => {
  // FIX: Check for the new notificationHeight property
  if (!newSize || !newSize.width || !newSize.height || typeof newSize.notificationHeight !== 'number') return;

  console.log("[Overlay] Updating canvas size:", newSize);

  // Store the offset
  notificationOffset = newSize.notificationHeight;

  // Set minimap canvas size to new configured dimensions
  canvas.width = newSize.width;
  canvas.height = newSize.height;

  // resize gold canvas (full window, which should have been resized by index.js)
  gold.width = window.innerWidth;
  gold.height = window.innerHeight;
});


// -------------------------------------------------
// Game/Time handling
// -------------------------------------------------
/* let gameData = { clockTime: 0, mapName: "unknown", paused: false, alive: true };
let lastFrameTime = Date.now();
let serverClockTime = 0;
let displayClockTime = 0;

window.electron.ipcRenderer.on("game-data", (event, data) => {
  gameData = data;
  serverClockTime = data.clockTime;

  if (Math.abs(displayClockTime - serverClockTime) > 2)
    displayClockTime = serverClockTime;
}); */


// -------------------------------------------------
// Game/Time handling
// -------------------------------------------------
// 💡 MODIFIED: Added gameState to gameData
let gameData = { clockTime: 0, mapName: "unknown", paused: false, alive: true, gameState: 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS' };
let lastFrameTime = Date.now();
let serverClockTime = 0;
let displayClockTime = 0;

window.electron.ipcRenderer.on("game-data", (event, data) => {
  gameData = data;
  serverClockTime = data.clockTime;

  if (Math.abs(displayClockTime - serverClockTime) > 2)
    displayClockTime = serverClockTime;
});
// -------------------------------------------------
// Canvas setup
// -------------------------------------------------
const canvas = document.getElementById("minimap");
const ctx = canvas.getContext("2d");
const gold = document.getElementById("gold");
const goldctx = gold.getContext("2d");

// -------------------------------------------------
// Coordinate transforms (No change needed here as we use ctx.translate)
// -------------------------------------------------
function worldToMinimap(x, y) {
  return {
    x: ((x - MAP_MIN) / MAP_SIZE) * canvas.width,
    y: canvas.height - ((y - MAP_MIN) / MAP_SIZE) * canvas.height
  };
}

function getPositionOnPathByTiming(waypoints, elapsed, timings) {
  if (elapsed <= 0) return { x: waypoints[0].x, y: waypoints[0].y, reached: false };
  if (elapsed >= timings[timings.length - 1]) {
    const last = waypoints[waypoints.length - 1];
    return { x: last.x, y: last.y, reached: true };
  }

  for (let i = 0; i < waypoints.length - 1; i++) {
    const t0 = timings[i];
    const t1 = timings[i + 1];
    if (elapsed <= t1) {
      const r = (elapsed - t0) / (t1 - t0);
      return {
        x: waypoints[i].x + (waypoints[i + 1].x - waypoints[i].x) * r,
        y: waypoints[i].y + (waypoints[i + 1].y - waypoints[i].y) * r,
        reached: false
      };
    }
  }
}

// -------------------------------------------------
// Compute creep waves
// -------------------------------------------------
function getCreepWavePositions(clock) {
  const waves = [];
  const waveIndex = Math.floor(clock / CREEP_SPAWN_INTERVAL);

  Object.entries(LANES).forEach(([laneName, lane]) => {
    const wpR = lane.radiant;
    const tR = LANE_SEGMENT_TIMINGS_RADIANT[laneName];
    const tD = LANE_SEGMENT_TIMINGS_DIRE[laneName];

    for (let wave = 0; wave <= waveIndex; wave++) {
      const spawn = FIRST_SPAWN_TIME + wave * CREEP_SPAWN_INTERVAL;
      const elapsed = clock - spawn;
      if (elapsed < 0) continue;

      const posR = getPositionOnPathByTiming(wpR, elapsed, tR);
      if (!posR.reached)
        waves.push({ x: posR.x, y: posR.y, team: "radiant", lane: laneName });

      const reverse = [...wpR].reverse();
      const posD = getPositionOnPathByTiming(reverse, elapsed, tD);
      if (!posD.reached)
        waves.push({ x: posD.x, y: posD.y, team: "dire", lane: laneName });
    }
  });

  return waves;
}



// -------------------------------------------------
// Notifications
// -------------------------------------------------
function getNextNotification(min) {
  const list = Object.keys(notifications).map(Number).sort((a, b) => a - b);
  return list.find((t) => t > min) ?? null;
}

// -------------------------------------------------
// Main Draw Loop
// -------------------------------------------------
function draw() {
  const now = Date.now();
  const delta = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  if (!gameData.paused) {
    displayClockTime += delta;
    displayClockTime += (serverClockTime - displayClockTime) * 0.0001;
  } else {
    displayClockTime = serverClockTime;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  goldctx.clearRect(0, 0, gold.width, gold.height);

  if (serverClockTime > 0 && !gameData.postGame) {
    
    // FIX: Apply a vertical offset to the minimap context
    ctx.save();
    ctx.translate(0, notificationOffset);

    // Draw creep waves (all coordinates are now relative to the translated origin)
    const waves = getCreepWavePositions(displayClockTime);
    waves.forEach((wave) => {
      if (wave.team !== gameData.homeTeam) {
        const pos = worldToMinimap(wave.x, wave.y);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 6, 0, 2 * Math.PI);
        ctx.fillStyle =
          wave.team === gameData.homeTeam
            ? "rgba(32,163,15,0.8)"
            : "rgba(233,71,71,0.8)";
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
    
    // Restore the context to remove the translation for future drawings
    ctx.restore(); 

    // Notifications and Gold Text
    const min = Math.floor(displayClockTime / 60);
    const next = getNextNotification(min);

    if (next !== null) {
      const notificationText = `${notifications[next]} in ${next - min} min`;
      const notificationTextX = 5;
      const textY = (notificationOffset / 2) + 6; // Y=21 for 30px height (centered + small offset)

      // 1. Draw Notification background
      goldctx.fillStyle = "rgba(0,0,0,0.7)";
      goldctx.fillRect(0, 0, canvas.width, notificationOffset);

      // 2. Draw Notification text
      goldctx.font = "20px Arial";
      goldctx.fillStyle = "white";
      goldctx.fillText(notificationText, notificationTextX, textY);
      
      // 3. Calculate Gold text position
      const goldTextX = canvas.width + 15; // 15px gap
      const goldTextY = notificationOffset + canvas.height * 0.3; // Slightly lower than 21 (textY) for a subtle drop

      // 4. Draw Gold text (right next to notification)
      // The color and font are now set here, and its previous off-screen rendering is removed.
      goldctx.font = "600 24px Arial"; // Prominent, but fits in the 30px bar
      goldctx.fillStyle = "rgba(233,71,71,0.8)"; 
      goldctx.fillText(`${gameData.unreliableGold}`, goldTextX, goldTextY);

    }
  }

  requestAnimationFrame(draw);
}

draw();