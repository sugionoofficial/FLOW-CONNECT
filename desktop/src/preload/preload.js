'use strict';
// Jembatan aman antara tampilan (renderer, tanpa akses Node) dan proses utama.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const CHANNELS = [
  'app:info', 'settings:set', 'auto:ack',
  'license:activate', 'license:verify', 'license:deactivate', 'update:check', 'update:download', 'update:install',
  'accounts:add', 'accounts:rename', 'accounts:remove', 'accounts:login', 'accounts:loginCancel', 'accounts:loginWindow', 'accounts:resetHeadless',
  'accounts:connect', 'accounts:disconnect',
  'flow:status', 'flow:show', 'flow:navigate', 'flow:listMedia', 'flow:thumb', 'flow:download', 'flow:send', 'flow:afterSend', 'flow:run',
  'flow:newProject', 'flow:scan',
  'queue:add', 'queue:remove', 'queue:retry', 'queue:clear', 'queue:start', 'queue:stop',
  'files:pickImages', 'files:register', 'files:preview', 'files:pickFolder', 'files:pickBrowser', 'files:open', 'files:show',
  'files:openDownloads', 'files:forget', 'shell:external'
];
const EVENTS = ['statuses', 'settings', 'queue', 'activity', 'navigate', 'theme', 'accent', 'license', 'update', 'login'];

const api = {};
for (const c of CHANNELS) api[c] = invoke(c);

contextBridge.exposeInMainWorld('fc', {
  call: (channel, ...args) => {
    if (!api[channel]) return Promise.resolve({ ok: false, error: 'UNKNOWN_CHANNEL' });
    return api[channel](...args);
  },
  on: (event, fn) => {
    if (!EVENTS.includes(event)) return () => {};
    const h = (_e, payload) => fn(payload);
    ipcRenderer.on(event, h);
    return () => ipcRenderer.removeListener(event, h);
  },
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } }
});
