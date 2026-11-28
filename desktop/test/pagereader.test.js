'use strict';
// AI pembaca halaman: format halaman untuk model, pemeriksaan jawaban, dan panggilan ke prompt-chat (tanpa jaringan).
const test = require('node:test');
const assert = require('node:assert');
const { formatPage, parseDecision, GOALS } = require('../src/main/pagereader');
const { Assistant } = require('../src/main/assistant');

const MAP = {
  path: '/fx/tools/flow', title: 'Google Flow', lang: 'en', vw: 1280, vh: 800, dialogs: 1,
  dialogText: 'A faster, easier-to-reach Flow Agent ... View all changelogs Get started', text: 'Projects New project',
  elements: [
    { id: 0, role: 'button', label: '', icon: 'arrow_forward', dialog: true, disabled: false, x: 900, y: 578 },
    { id: 1, role: 'button', label: 'View all changelogs', icon: '', dialog: true, disabled: false, x: 580, y: 642 },
    { id: 2, role: 'button', label: 'Get started', icon: '', dialog: true, disabled: true, x: 990, y: 642 }
  ]
};

test('formatPage: tujuan, langkah sebelumnya, teks kartu, elemen bernomor dengan tanda dialog/nonaktif', () => {
  const t = formatPage(GOALS.newProject, ['clicked #4 "New project"'], MAP);
  assert.match(t, /^GOAL: Open a NEW, EMPTY project/);
  assert.match(t, /PREVIOUS STEPS:\n1\. clicked #4 "New project"/);
  assert.match(t, /DIALOG \/ CARD TEXT: A faster/);
  assert.match(t, /#0 button icon:arrow_forward \[D\] @ 900,578/);
  assert.match(t, /#2 button "Get started" \[D\] \(looks disabled\) @ 990,642/);
  assert.ok(t.length < 12001);
});

test('parseDecision: JSON di tengah teks / pagar kode; id harus ada; tombol terlarang ditolak', () => {
  assert.deepStrictEqual(parseDecision('Sure!\n```json\n{"action":"click","id":0,"reason":"next page"}\n```', MAP),
    { action: 'click', id: 0, el: MAP.elements[0], reason: 'next page' });
  assert.deepStrictEqual(parseDecision('{"action":"WAIT","reason":"loading"}', MAP), { action: 'wait', reason: 'loading' });
  assert.strictEqual(parseDecision('{"action":"click","id":9}', MAP), null, 'id di luar daftar');
  assert.strictEqual(parseDecision('{"action":"click","id":1}', MAP), null, '"View all changelogs" keluar dari Flow');
  assert.strictEqual(parseDecision('{"action":"hack"}', MAP), null);
  assert.strictEqual(parseDecision('saya akan klik tombol 0', MAP), null);
  const bad = { ...MAP, elements: [{ id: 0, role: 'button', label: 'Sign out', icon: '', dialog: false, x: 1, y: 1 }, { id: 1, role: 'button', label: 'Upgrade to Google AI Pro', icon: '', x: 1, y: 1 }] };
  assert.strictEqual(parseDecision('{"action":"click","id":0}', bad), null);
  assert.strictEqual(parseDecision('{"action":"click","id":1}', bad), null);
});

test('Assistant.readPage: mode "page" + teks halaman + gambar, kunci lisensi; galat dikenali', async () => {
  const calls = [];
  let reply = { body: { reply: '{"action":"done"}', model: { id: 'm', label: 'Gemma 4 31B' } } };
  const license = { _key: () => 'FC-ABCDE-FGHJK-MNPQR-STVWX-YZ234', deviceId: 'dev-1' };
  const a = new Assistant({ license, url: 'https://x.supabase.co', key: 'pk', fetch: async (url, o) => { calls.push({ url, body: JSON.parse(o.body) }); return { ok: (reply.status || 200) < 400, status: reply.status || 200, json: async () => reply.body }; } });
  const r = await a.readPage({ text: 'GOAL: x', image: 'data:image/jpeg;base64,AAAA' });
  assert.deepStrictEqual(r, { reply: '{"action":"done"}', model: { id: 'm', label: 'Gemma 4 31B' } });
  assert.strictEqual(calls[0].url, 'https://x.supabase.co/functions/v1/prompt-chat');
  assert.deepStrictEqual(calls[0].body, { license_key: 'FC-ABCDE-FGHJK-MNPQR-STVWX-YZ234', device_id: 'dev-1', mode: 'page', page: 'GOAL: x', image: 'data:image/jpeg;base64,AAAA' });
  reply = { status: 429, body: { error: 'DAILY_LIMIT', limit: 300 } };
  await assert.rejects(() => a.readPage({ text: 'x' }), /DAILY_LIMIT/);
  reply = { status: 503, body: { error: 'PAGE_READER_OFF' } };
  await assert.rejects(() => a.readPage({ text: 'x' }), /PAGE_READER_OFF/);
  const none = new Assistant({ license: { _key: () => null }, fetch: async () => { throw new Error('tidak boleh'); } });
  await assert.rejects(() => none.readPage({ text: 'x' }), /LICENSE_REQUIRED/);
});
