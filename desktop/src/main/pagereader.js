'use strict';
// AI pembaca halaman: halaman Google Flow (teks terlihat + daftar elemen yang boleh diklik + tangkapan layar bernomor)
// dikirim ke model AI lewat Edge Function `prompt-chat` (mode "page"); model menjawab satu keputusan JSON.
// Keputusan selalu diperiksa ulang di sini dan di halaman (id harus ada di daftar, label sama, bukan tombol terlarang)
// sebelum aplikasi menekan apa pun.

const ACTIONS = new Set(['click', 'done', 'wait', 'blocked']);
// tombol yang tidak pernah ditekan, apa pun jawaban AI
const FORBIDDEN = /sign ?out|log ?out|keluar|switch account|ganti akun|add account|tambah akun|subscribe|upgrade|buy|purchase|beli|langganan|tingkatkan|delete|hapus|google ai (pro|ultra)|add ai credits|tambah kredit|changelog|share|bagikan/i;

const GOALS = {
  newProject: 'Open a NEW, EMPTY project in Google Flow (the project editor with the prompt box), with no welcome / terms / tour / "What\'s new" card covering it.',
  clearProject: 'An empty project editor is open. Close every welcome / terms / tour / "What\'s new" card or dialog that covers it so the prompt box is usable. Reply "done" when nothing covers the editor.'
};

/** Halaman → teks ringkas untuk model (≤ ~10 rb karakter). */
function formatPage(goal, history, map) {
  const lines = [];
  lines.push(`GOAL: ${goal}`);
  if (history && history.length) {
    lines.push('PREVIOUS STEPS:');
    history.slice(-8).forEach((h, i) => lines.push(`${i + 1}. ${h}`));
  }
  lines.push(`PAGE: ${map.path || '/'} · title "${clip(map.title, 80)}" · lang ${map.lang || '?'} · viewport ${map.vw}x${map.vh} · dialogs open: ${map.dialogs || 0}`);
  if (map.dialogText) lines.push(`DIALOG / CARD TEXT: ${clip(map.dialogText, 1500)}`);
  if (map.text) lines.push(`PAGE TEXT: ${clip(map.text, map.dialogText ? 600 : 1500)}`);
  lines.push('ELEMENTS (only these can be clicked; [D] = inside the dialog/card on top; numbers match the screenshot):');
  if (!map.elements.length) lines.push('(none)');
  for (const e of map.elements) {
    const name = e.label ? `"${clip(e.label, 60)}"` : `icon:${e.icon || '?'}`;
    const flags = [e.dialog ? '[D]' : '', e.disabled ? '(looks disabled)' : '', e.checked ? '(checked)' : '', e.link ? '(link)' : ''].filter(Boolean).join(' ');
    lines.push(`#${e.id} ${e.role} ${name}${flags ? ' ' + flags : ''} @ ${e.x},${e.y}`);
  }
  lines.push('Answer with one JSON object only.');
  return lines.join('\n').slice(0, 12000);
}

/**
 * Jawaban model → keputusan yang aman, atau null bila tidak bisa dipakai.
 * @returns {{action:'click'|'done'|'wait'|'blocked', id?:number, el?:object, reason:string}|null}
 */
function parseDecision(reply, map) {
  const txt = String(reply || '');
  let obj = null;
  const cands = txt.match(/\{[^{}]*\}/g) || [];
  for (const c of cands) {
    try { const o = JSON.parse(c); if (o && typeof o.action === 'string') { obj = o; break; } } catch { /* coba kandidat berikut */ }
  }
  if (!obj) return null;
  const action = String(obj.action).toLowerCase().trim();
  if (!ACTIONS.has(action)) return null;
  const reason = clip(String(obj.reason || ''), 160);
  if (action !== 'click') return { action, reason };
  const id = Number(obj.id);
  const el = Number.isInteger(id) ? map.elements.find((e) => e.id === id) : null;
  if (!el) return null;
  if (FORBIDDEN.test(el.label || '')) return null;
  return { action, id, el, reason };
}

function clip(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

module.exports = { formatPage, parseDecision, GOALS, FORBIDDEN };
