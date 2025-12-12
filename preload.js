const { contextBridge, ipcRenderer } = require('electron');

// Expose IPC safely
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    on: (channel, func) => {
      const validChannels = [
        'game-data', 
        'active-template-changed', 
        'overlay-size-updated' // <--- CORRECTED CHANNEL NAME
      ]; 
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