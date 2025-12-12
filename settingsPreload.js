// preload-settings.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, data) => {
      const validChannels = [
        'save-waypoints',
        'active-template-changed',   // ← allow settings → main
        'overlay-size-changed'
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    on: (channel, func) => {
      // If settings ever needs to *receive* updates, add channels here.
      const validChannels = [];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(event, ...args));
      }
    },
    invoke: (channel) => {
      const validChannels = ['load-constants'];
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel);
      }
    }
  }
});
