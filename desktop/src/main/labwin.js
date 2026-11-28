'use strict';
// ALAT KREATIF (pengganti alat Google Flow yang sering macet saat dimuat): 12 alat dengan nama & fungsi serupa,
// dikerjakan di PC ini (canvas / WebGL / Web Audio — offline) dan dibantu model AI yang terdaftar di admin
// (lewat fungsi prompt-chat, mode "tool"). Setiap alat dibuka di jendela aplikasinya sendiri (src/lab/lab.html).
const path = require('path');

/** Daftar alat (id → judul jendela). Sumber data kartu ada di src/renderer/skills.js (LAB_TOOLS). */
const LAB_IDS = ['textanim', 'resize', 'editor', 'storyboard', 'shader', 'mockup', 'beat', 'converge', 'character', 'pixel', 'gridarch', 'scout', 'upscale', 'metadata', 'join'];
const TITLES = {
  textanim: 'Teks Animasi', resize: 'Ubah Ukuran Video', editor: 'Editor Gambar', storyboard: 'Studio Storyboard',
  shader: 'Efek Shader', mockup: 'Mockup', beat: 'Ribbit — Video Ikut Ketukan', converge: 'Converge — Sketsa jadi Render',
  character: 'Character X-ray', pixel: 'pixelBento', gridarch: 'Grid Architect', scout: 'Scout360',
  upscale: 'Upscale Gambar', metadata: 'Cek Metadata', join: 'Gabung Video'
};

/**
 * @param {object} o
 * @param {typeof import('electron')} o.electron
 * @param {string} o.icon
 * @param {()=>boolean} o.dark
 * @param {()=>any} o.parent
 */
function createLabWindows(o) {
  const { BrowserWindow, shell } = o.electron;
  const open = new Map(); // toolId → BrowserWindow
  const senders = new Map(); // webContents.id → toolId

  function openLab(id) {
    if (!LAB_IDS.includes(id)) throw new Error('UNKNOWN_TOOL');
    const have = open.get(id);
    if (have && !have.isDestroyed()) { if (have.isMinimized()) have.restore(); have.focus(); return { reused: true }; }
    const w = new BrowserWindow({
      width: 1360, height: 860, minWidth: 900, minHeight: 600, show: false, title: `${TITLES[id]} — FLOW CONNECT`,
      backgroundColor: o.dark() ? '#17171a' : '#f3f3f3', icon: o.icon, autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, '..', 'preload', 'lab-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, webviewTag: false }
    });
    w.removeMenu();
    const wcId = w.webContents.id;
    open.set(id, w);
    senders.set(wcId, id);
    w.webContents.on('will-navigate', (e) => e.preventDefault());
    w.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    w.once('ready-to-show', () => w.show());
    w.on('closed', () => { senders.delete(wcId); if (open.get(id) === w) open.delete(id); });
    w.loadFile(path.join(__dirname, '..', 'lab', 'lab.html'), { query: { t: id } });
    return { reused: false };
  }

  /** Alat milik pengirim IPC (null bila bukan jendela alat kreatif). */
  const toolOf = (sender) => (sender ? senders.get(sender.id) || null : null);
  const windowOf = (sender) => { const id = toolOf(sender); return id ? open.get(id) : null; };

  function closeAll() { for (const w of open.values()) { try { if (!w.isDestroyed()) w.close(); } catch { /* sudah tertutup */ } } open.clear(); }
  function count() { return [...open.values()].filter((w) => !w.isDestroyed()).length; }

  return { openLab, toolOf, windowOf, closeAll, count };
}

module.exports = { createLabWindows, LAB_IDS, TITLES };
