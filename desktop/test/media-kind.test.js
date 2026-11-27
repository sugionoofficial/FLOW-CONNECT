'use strict';
// Jenis media di daftar project Flow (Zzl0ze): gambar dalam bentuk "record media" tidak boleh masuk kategori Video.
const test = require('node:test');
const assert = require('node:assert');
const { fcAgent } = require('../src/main/agent');

const PID = '11111111-2222-4333-8444-555555555555';
const id = (n, tag = 'aaaa') => `${String(n).padStart(8, '0')}-${tag}-4bbb-8ccc-${String(n).padStart(12, '0')}`;

function agentWith(payload) {
  const g = globalThis;
  const saved = { window: g.window, document: g.document, location: g.location, fetch: g.fetch };
  g.window = { WIZ_global_data: { SNlM0e: 'AT', cfb2h: 'bl', FdrFJe: 'sid' } };
  g.document = { documentElement: { lang: 'en' }, title: 'Project - Google Flow' };
  g.location = { pathname: `/project/${PID}`, href: `https://flow.google.com/project/${PID}` };
  g.fetch = async () => {
    const line = JSON.stringify([['wrb.fr', 'Zzl0ze', JSON.stringify(payload), null, null, null, 'generic']]);
    return { ok: true, status: 200, text: async () => `)]}'\n\n${line.length}\n${line}\n` };
  };
  fcAgent(9, { mediaHosts: [], allowHttp: false });
  const agent = g.window.__fcDesktop;
  Object.assign(g, saved);
  return agent;
}

async function list(payload) {
  const agent = agentWith(payload);
  const g = globalThis;
  const saved = { window: g.window, document: g.document, location: g.location, fetch: g.fetch };
  g.window = { WIZ_global_data: { SNlM0e: 'AT' }, __fcDesktop: agent };
  g.document = { documentElement: { lang: 'en' } };
  g.location = { pathname: `/project/${PID}` };
  g.fetch = async () => {
    const line = JSON.stringify([['wrb.fr', 'Zzl0ze', JSON.stringify(payload), null, null, null, 'generic']]);
    return { ok: true, status: 200, text: async () => `)]}'\n\n${line.length}\n${line}\n` };
  };
  try { return await agent.call('listMedia', [PID]); } finally { Object.assign(g, saved); }
}

const at = Math.floor(Date.now() / 1000);
const wfRow = (wf, title, video) => [wf, null, null, [title, [at, 0], video], PID];
const detail = (status, poster) => { const d = Array(11).fill(null); d[8] = status == null ? null : [status]; d[10] = poster || null; return d; };

test('gambar berbentuk record media (mime image/*) masuk kategori Gambar, bukan Video', async () => {
  const vidWf = id(1, 'ffff'), vid = id(2), imgWf = id(3, 'ffff'), img = id(4), upWf = id(5, 'ffff'), up = id(6);
  const genImgWf = id(7, 'ffff'), genImg = id(8);
  const det13 = Array(14).fill(null); det13[13] = `https://flow-content.google/image/${genImg}?sig=1`;
  const items = await list([[
    wfRow(vidWf, 'kucing berlari', true),
    wfRow(imgWf, 'pemandangan sawah', false),
    wfRow(upWf, 'awal', true), // baris workflow keliru menyebut "video"
    wfRow(genImgWf, 'potret batik', false),
    // video hasil generate: info media (list) di [7][0], status 3 = selesai
    [vidWf, PID, vid, null, null, detail(3, `https://flow-content.google/image/${vid}`), null,
      [[null, null, null, null, null, null, null, null, `https://flow-content.google/video/${vid}?sig=1`], [1280, 720, [8]]]],
    // gambar hasil generate dalam bentuk record media (ada info) — mime jpeg
    [imgWf, PID, img, null, null, detail(null, `https://flow-content.google/image/${img}?sig=1`), null,
      [['info'], [1376, 768, null, null, null, null, 'image/jpeg']]],
    // foto yang DIUNGGAH (Frame awal): tanpa info generate, mime jpeg
    [upWf, PID, up, null, null, detail(null, `https://flow-content.google/image/${up}?sig=1`), null,
      [null, [1024, 1024, null, null, null, null, 'image/jpeg']]],
    // gambar hasil generate format 7 slot + record media-nya
    [genImg, null, genImgWf, null, null, null, [det13, null, [1376, 768]]],
    [genImgWf, PID, genImg, null, null, detail(null), null, [null, [1376, 768, null, null, null, null, 'image/png']]]
  ]]);
  const by = Object.fromEntries(items.map((i) => [i.mediaId, i]));
  assert.strictEqual(by[vid].isVideo, true, 'video tetap video');
  assert.ok(by[vid].video, 'video punya URL video');
  assert.strictEqual(by[img].isVideo, false, 'gambar jpeg bukan video');
  assert.strictEqual(by[img].done, true);
  assert.ok(!by[img].upload, 'gambar hasil generate tidak dianggap unggahan');
  assert.strictEqual(by[up].isVideo, false, 'foto unggahan bukan video');
  assert.strictEqual(by[up].upload, true, 'foto unggahan ditandai (disembunyikan dari galeri)');
  assert.strictEqual(by[genImg].isVideo, false);
  assert.ok(!by[genImg].upload, 'punya record hasil generate (7 slot) → bukan unggahan');
});

test('record media lama tanpa slot 7 (status saja) tetap dianggap video', async () => {
  const wf = id(9, 'ffff'), v = id(10);
  const items = await list([[wfRow(wf, 'ombak', true), [wf, PID, v, null, null, detail(6)]]]);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].isVideo, true);
  assert.strictEqual(items[0].done, false, 'status 6 = masih diproses');
});
