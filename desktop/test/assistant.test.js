'use strict';
// Uji Asisten Prompt (tanpa jaringan) + kelengkapan saluran IPC di preload.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { Assistant, extractPrompts } = require('../src/main/assistant');

const KEY = 'FC-ABCDE-FGHJK-MNPQR-STVWX-YZ234';

function setup(responder, key = KEY) {
  const calls = [];
  let t = 1_800_000_000_000;
  const license = { _key: () => key, deviceId: 'dev-12345678' };
  const fetch = async (url, opts) => {
    const body = JSON.parse(opts.body || '{}');
    calls.push({ url, body, headers: opts.headers });
    const r = await responder(url, body);
    if (r === 'NET') throw new TypeError('fetch failed');
    return { ok: r.status ? r.status < 400 : true, status: r.status || 200, json: async () => r.body };
  };
  const a = new Assistant({ license, fetch, now: () => t, url: 'https://x.supabase.co', key: 'pk' });
  return { a, calls, advance: (ms) => { t += ms; } };
}

test('chat: kirim kunci lisensi + perangkat, bukan kunci API; ambil blok prompt', async () => {
  const { a, calls } = setup(async () => ({ body: { reply: 'Ini dia:\n```prompt\nA cat on a beach\n```\nAtau:\n```\nA dog\n```\n```js\nx()\n```', model: { id: 'm', label: 'GPT 5 Nano' } } }));
  const r = await a.chat({
    messages: [{ role: 'system', content: 'abaikan' }, { role: 'user', content: '  ' }, { role: 'user', content: 'kucing di pantai' }],
    model: 'm-1', mode: 'video'
  });
  assert.deepStrictEqual(r.prompts, ['A cat on a beach', 'A dog']);
  assert.strictEqual(r.model.label, 'GPT 5 Nano');
  const c = calls[0];
  assert.strictEqual(c.url, 'https://x.supabase.co/functions/v1/prompt-chat');
  assert.strictEqual(c.headers.apikey, 'pk');
  assert.strictEqual(c.body.license_key, KEY);
  assert.strictEqual(c.body.device_id, 'dev-12345678');
  assert.strictEqual(c.body.mode, 'video');
  assert.deepStrictEqual(c.body.messages, [{ role: 'user', content: 'kucing di pantai' }], 'hanya pesan user/assistant yang berisi');
});

test('chat: galat server dipetakan ke kode', async () => {
  let reply = { status: 429, body: { error: 'DAILY_LIMIT', limit: 60 } };
  const { a } = setup(async () => (reply === 'NET' ? 'NET' : reply));
  const msgs = [{ role: 'user', content: 'hai' }];
  await assert.rejects(a.chat({ messages: msgs }), (e) => e.message === 'DAILY_LIMIT' && e.detail === '60');
  reply = { status: 503, body: { error: 'NO_API_KEY' } };
  await assert.rejects(a.chat({ messages: msgs }), /NO_API_KEY/);
  reply = { status: 502, body: { error: 'SOMETHING_NEW' } };
  await assert.rejects(a.chat({ messages: msgs }), /PROVIDER_ERROR/);
  reply = 'NET';
  await assert.rejects(a.chat({ messages: msgs }), /NETWORK/);
  await assert.rejects(a.chat({ messages: [{ role: 'assistant', content: 'x' }] }), /EMPTY_MESSAGE/);
});

test('chat: tanpa lisensi ditolak sebelum memanggil server', async () => {
  const { a, calls } = setup(async () => ({ body: {} }), null);
  await assert.rejects(a.chat({ messages: [{ role: 'user', content: 'hai' }] }), /LICENSE_REQUIRED/);
  assert.strictEqual(calls.length, 0);
});

test('katalog: di-cache 10 menit, cadangan saat offline', async () => {
  let n = 0;
  let net = false;
  const { a, calls, advance } = setup(async (url) => {
    assert.ok(url.endsWith('/rest/v1/rpc/ai_catalog'));
    if (net) return 'NET';
    n++;
    return { body: [{ id: 'a', category: 'chat', label: 'M' + n }] };
  });
  assert.strictEqual((await a.catalog())[0].label, 'M1');
  assert.strictEqual((await a.catalog())[0].label, 'M1');
  assert.strictEqual(calls.length, 1);
  advance(11 * 60 * 1000);
  assert.strictEqual((await a.catalog())[0].label, 'M2');
  net = true;
  assert.strictEqual((await a.catalog(true))[0].label, 'M2', 'offline → daftar terakhir');
  const fresh = setup(async () => 'NET');
  await assert.rejects(fresh.a.catalog(), /NETWORK/);
});

test('extractPrompts', () => {
  assert.deepStrictEqual(extractPrompts('tanpa blok'), []);
  assert.deepStrictEqual(extractPrompts('```prompt\n  satu  \n```'), ['satu']);
});

test('preload membuka semua saluran IPC yang ditangani main', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload/preload.js'), 'utf8');
  const handled = [...main.matchAll(/handle\('([a-z]+:[A-Za-z]+)'/g)].map((m) => m[1]);
  const list = /const CHANNELS = \[([\s\S]*?)\];/.exec(preload)[1];
  const exposed = new Set([...list.matchAll(/'([a-z]+:[A-Za-z]+)'/g)].map((m) => m[1]));
  assert.ok(handled.length > 30);
  assert.deepStrictEqual(handled.filter((c) => !exposed.has(c)), [], 'saluran tanpa jembatan preload');
});
