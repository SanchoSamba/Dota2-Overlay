const canvas = document.getElementById('minimapCanvas');
canvas.width = 400;
canvas.height = 400;
const ctx = canvas.getContext('2d');

const radiantInput = document.getElementById('timingRadiantInput');
const direInput = document.getElementById('timingDireInput');
const saveBtn = document.getElementById('saveBtn');

const templatePrevBtn = document.getElementById('prevTemplate');
const templateNextBtn = document.getElementById('nextTemplate');
const templateNameInput = document.getElementById('templateNameInput');
const notificationList = document.getElementById('notificationList');
const addNotificationBtn = document.getElementById('addNotificationBtn');

// NEW: overlay size inputs (must exist in HTML)
const overlayWidthInput = document.getElementById('overlayWidthInput');
const overlayHeightInput = document.getElementById('overlayHeightInput');

let constants = null;
let waypoints = [];
let selectedWaypoint = null;
let isDragging = false;
let activeTemplateIndex = 0;

// Preload minimap image
const minimapImg = new Image();
minimapImg.src = 'minimap.png';
minimapImg.onload = () => {
  if (constants) drawWaypoints();
};

// Load constants from main process
(async () => {
  constants = await window.electron.ipcRenderer.invoke('load-constants');
  if (!constants) return;

  // Initialize overlay size defaults if missing
  if (typeof constants.overlayWidth !== 'number') constants.overlayWidth = 325;
  if (typeof constants.overlayHeight !== 'number') constants.overlayHeight = 325;

  // Initialize templates if missing
  if (!constants.templates) {
    constants.templates = Array.from({ length: 5 }, (_, i) => ({
      name: `Template ${i + 1}`,
      notifications: {}
    }));
  }

  if (typeof constants.activeTemplateIndex !== 'number') {
    constants.activeTemplateIndex = 0;
  }

  // initialize inputs for overlay size (if present in DOM)
  if (overlayWidthInput) overlayWidthInput.value = constants.overlayWidth;
  if (overlayHeightInput) overlayHeightInput.value = constants.overlayHeight;

  // Add listeners to overlay size inputs (only when user finishes editing)
  if (overlayWidthInput) {
    overlayWidthInput.addEventListener('change', onOverlaySizeChanged);
    overlayWidthInput.addEventListener('blur', onOverlaySizeChanged);
  }
  if (overlayHeightInput) {
    overlayHeightInput.addEventListener('change', onOverlaySizeChanged);
    overlayHeightInput.addEventListener('blur', onOverlaySizeChanged);
  }

  activeTemplateIndex = constants.activeTemplateIndex;
  templateNameInput.value = getActiveTemplate().name;

  // Flatten lane waypoints
  Object.entries(constants.lanes).forEach(([laneName, laneData]) => {
    laneData.radiant.forEach((wp, i) => {
      waypoints.push({
        lane: laneName,
        index: i,
        x: wp.x,
        y: wp.y,
        timingRadiant: constants.laneSegmentTimings[laneName][i],
        timingDire: constants.laneSegmentTimingsDire[laneName][4 - i],
      });
    });
  });

  drawWaypoints();
  renderNotifications();
})();

// --- Overlay size handler ---
function onOverlaySizeChanged() {
  if (!constants) return;

  // parse values, ensure integers and reasonable bounds
  const w = parseInt(overlayWidthInput.value, 10);
  const h = parseInt(overlayHeightInput.value, 10);

  const minW = 100, minH = 100;
  const maxW = 4096, maxH = 2160;

  const newW = Number.isFinite(w) ? Math.max(minW, Math.min(maxW, w)) : constants.overlayWidth;
  const newH = Number.isFinite(h) ? Math.max(minH, Math.min(maxH, h)) : constants.overlayHeight;

  // update constants
  constants.overlayWidth = newW;
  constants.overlayHeight = newH;

  // reflect corrected values back into inputs (in case clamped)
  if (overlayWidthInput) overlayWidthInput.value = newW;
  if (overlayHeightInput) overlayHeightInput.value = newH;

  // notify main so overlay can resize immediately
  window.electron.ipcRenderer.send('overlay-size-changed', { width: newW, height: newH });

  // optionally: you could auto-save here by invoking save - but we'll keep explicit Save button
  console.log('[Settings] overlay size changed ->', { width: newW, height: newH });
}

// --- Template helpers ---
function getActiveTemplate() {
  return constants.templates[activeTemplateIndex];
}

function setActiveTemplate(index) {
  if (index < 0 || index >= constants.templates.length) return;

  activeTemplateIndex = index;
  constants.activeTemplateIndex = index;

  templateNameInput.value = getActiveTemplate().name;
  renderNotifications();

  // notify main
  window.electron.ipcRenderer.send('active-template-changed', activeTemplateIndex);
}

// --- LISTEN FOR ACTIVE TEMPLATE UPDATES FROM MAIN ---
window.electron.ipcRenderer.on('active-template-updated', (event, newIndex) => {
  if (!constants) return;

  activeTemplateIndex = newIndex;

  templateNameInput.value = getActiveTemplate().name;
  renderNotifications();
});

// --- Coordinate conversion ---
function worldToCanvas(x, y) {
  const mapMin = -8000, mapMax = 8000, mapSize = mapMax - mapMin;
  return {
    x: ((x - mapMin) / mapSize) * canvas.width,
    y: canvas.height - ((y - mapMin) / mapSize) * canvas.height
  };
}
function canvasToWorld(px, py) {
  const mapMin = -8000, mapMax = 8000, mapSize = mapMax - mapMin;
  return {
    x: (px / canvas.width) * mapSize + mapMin,
    y: ((canvas.height - py) / canvas.height) * mapSize + mapMin
  };
}

// --- Draw waypoints ---
function drawWaypoints() {
  if (!minimapImg.complete) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(minimapImg, 0, 0, canvas.width, canvas.height);

  waypoints.forEach(wp => {
    const pos = worldToCanvas(wp.x, wp.y);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = (wp === selectedWaypoint) ? 'yellow' : 'white';
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'green';
    ctx.font = '12px Arial';
    ctx.fillText(wp.timingRadiant, pos.x + 8, pos.y - 2);

    ctx.fillStyle = 'red';
    ctx.fillText(wp.timingDire, pos.x + 8, pos.y + 12);
  });
}

// --- Mouse events ---
canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  selectedWaypoint = null;
  for (let wp of waypoints) {
    const pos = worldToCanvas(wp.x, wp.y);
    if (Math.hypot(pos.x - mx, pos.y - my) < 10) {
      selectedWaypoint = wp;
      isDragging = true;
      radiantInput.value = wp.timingRadiant;
      direInput.value = wp.timingDire;
      drawWaypoints();
      break;
    }
  }
});
canvas.addEventListener('mousemove', e => {
  if (!isDragging || !selectedWaypoint) return;
  const rect = canvas.getBoundingClientRect();
  const worldPos = canvasToWorld(e.clientX - rect.left, e.clientY - rect.top);
  selectedWaypoint.x = worldPos.x;
  selectedWaypoint.y = worldPos.y;
  drawWaypoints();
});
canvas.addEventListener('mouseup', () => isDragging = false);
canvas.addEventListener('mouseleave', () => isDragging = false);

// --- Timing inputs ---
radiantInput.addEventListener('input', () => {
  if (selectedWaypoint) {
    selectedWaypoint.timingRadiant = parseFloat(radiantInput.value);
    drawWaypoints();
  }
});
direInput.addEventListener('input', () => {
  if (selectedWaypoint) {
    selectedWaypoint.timingDire = parseFloat(direInput.value);
    drawWaypoints();
  }
});

// --- Notifications ---
function renderNotifications() {
  notificationList.innerHTML = '';
  const notifications = getActiveTemplate().notifications || {};

  Object.entries(notifications)
    .sort(([a], [b]) => a - b)
    .forEach(([minute, text]) => {
      const row = document.createElement('div');

      const minuteInput = document.createElement('input');
      minuteInput.type = 'number';
      minuteInput.value = minute;

      // --- Only update AFTER finishing edit ---
      minuteInput.addEventListener('change', () => {
        const newMinute = parseInt(minuteInput.value);
        if (isNaN(newMinute)) return;

        const notifObj = getActiveTemplate().notifications;

        // Move entry to new key
        delete notifObj[minute];
        notifObj[newMinute] = textInput.value;

        // Re-render to maintain sorted order
        renderNotifications();

        // Notify main that templates changed (so overlay can update if needed)
        window.electron.ipcRenderer.send('active-template-changed', activeTemplateIndex);
      });

      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.value = text;

      // --- Update text only when user leaves field ---
      textInput.addEventListener('change', () => {
        getActiveTemplate().notifications[minuteInput.value] = textInput.value;
        window.electron.ipcRenderer.send('active-template-changed', activeTemplateIndex);
      });

      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'X';
      removeBtn.addEventListener('click', () => {
        delete getActiveTemplate().notifications[minuteInput.value];
        renderNotifications();
        window.electron.ipcRenderer.send('active-template-changed', activeTemplateIndex);
      });

      row.appendChild(minuteInput);
      row.appendChild(textInput);
      row.appendChild(removeBtn);
      notificationList.appendChild(row);
    });
}

addNotificationBtn.addEventListener('click', () => {
  const notifications = getActiveTemplate().notifications;
  let newKey = 0;
  while (notifications.hasOwnProperty(newKey)) newKey++;
  notifications[newKey] = 'New Notification';
  renderNotifications();
  window.electron.ipcRenderer.send('active-template-changed', activeTemplateIndex);
});

// --- Template switching ---
templatePrevBtn.addEventListener('click', () => {
  setActiveTemplate((activeTemplateIndex - 1 + constants.templates.length) % constants.templates.length);
});
templateNextBtn.addEventListener('click', () => {
  setActiveTemplate((activeTemplateIndex + 1) % constants.templates.length);
});

// --- Template name editing ---
templateNameInput.addEventListener('input', () => {
  getActiveTemplate().name = templateNameInput.value;
  window.electron.ipcRenderer.send('active-template-changed', activeTemplateIndex);
});

// --- Save button ---
saveBtn.addEventListener('click', () => {

  // Save waypoints
  Object.entries(constants.lanes).forEach(([laneName, laneData]) => {
    laneData.radiant.forEach((wp, i) => {
      const updated = waypoints.find(w => w.lane === laneName && w.index === i);
      if (updated) {
        wp.x = updated.x;
        wp.y = updated.y;
        constants.laneSegmentTimings[laneName][i] = updated.timingRadiant;

        if (!constants.laneSegmentTimingsDire) constants.laneSegmentTimingsDire = {};
        if (!constants.laneSegmentTimingsDire[laneName]) constants.laneSegmentTimingsDire[laneName] = [];

        constants.laneSegmentTimingsDire[laneName][4 - i] = updated.timingDire;
      }
    });
  });

  // Save everything to disk
  window.electron.ipcRenderer.send('save-waypoints', constants);

  // 🔥 NEW: Tell main process template changed → overlay reloads template
  window.electron.ipcRenderer.send('active-template-changed', activeTemplateIndex);
});