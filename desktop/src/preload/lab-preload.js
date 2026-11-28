'use strict';
// Jembatan aman jendela Alat Kreatif (src/lab) → proses utama. Hanya saluran "lab:*".
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const CHANNELS = ['lab:info', 'lab:pick', 'lab:register', 'lab:read', 'lab:save', 'lab:ai', 'lab:toStudio', 'lab:toBulk', 'lab:show'];

contextBridge.exposeInMainWorld('lab', {
  call: (channel, ...args) => {
    if (!CHANNELS.includes(channel)) return Promise.resolve({ ok: false, error: 'UNKNOWN_CHANNEL' });
    return ipcRenderer.invoke(channel, ...args);
  },
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } }
});
