// Alat Kreatif — kerangka jendela: kepala (judul + status AI), panel kiri (pengaturan), panggung (pratinjau), bilah bawah.
import { LAB_TOOLS } from '../renderer/skills.js';
import { h, ic, call, aiState, toast, errText, onDropFiles } from './core.js';

const id = new URLSearchParams(location.search).get('t') || 'textanim';
const meta = LAB_TOOLS.find((x) => x.id === id) || LAB_TOOLS[0];
document.title = `${meta.name} — FLOW CONNECT`;

async function boot() {
  let info = {};
  try { info = await call('lab:info'); } catch { /* pratinjau di luar aplikasi */ }
  if (info.accent) document.documentElement.style.setProperty('--accent', info.accent);
  const aiPill = h('span.pill.ai', { title: 'Bantuan AI memakai model yang terdaftar di admin FLOW CONNECT' }, ic('wand-sparkles'), h('span', { text: 'AI: ' + meta.ai }));
  aiState.listeners.add((m) => { if (m) aiPill.lastChild.textContent = 'AI · ' + m; });
  const headTools = h('div.tools', h('span.pill.ok', { title: 'Diproses di PC ini — tidak memuat halaman Google Flow' }, ic('zap'), 'Offline'), aiPill);
  const side = h('div.side');
  const stage = h('div.stage');
  const bar = h('div.stagebar');
  const main = h('div.main', stage, bar);
  const body = h('div.lab-body', side, main);
  const app = document.getElementById('app');
  app.replaceChildren(
    h('header.lab-head', h('div.lab-badge', ic(meta.icon, 'lg')), h('div.lab-title', h('b', { text: meta.name }), h('span', { text: meta.desc })), headTools),
    body
  );
  const ctx = {
    meta, info, side, stage, bar, main, body, headTools,
    /** panel kanan opsional */
    right() { if (!ctx._right) { ctx._right = h('div.right'); body.append(ctx._right); body.classList.add('has-right'); } return ctx._right; },
    onDrop: (fn) => onDropFiles(fn)
  };
  try {
    const mod = await import(`./tools/${meta.id}.js`);
    await mod.mount(ctx);
    document.body.dataset.ready = meta.id;
  } catch (e) {
    console.error(e);
    stage.replaceChildren(h('div.empty', ic('triangle-alert', 'xl'), h('b', { text: 'Alat gagal dimuat' }), h('span.small', { text: errText(e) })));
    toast(errText(e), 'err');
  }
}
boot();
