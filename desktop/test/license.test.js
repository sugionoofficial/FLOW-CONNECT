'use strict';
// Uji logika lisensi (tanpa jaringan): aktivasi, verifikasi ulang, masa tenggang offline, pencabutan.
const test = require('node:test');
const assert = require('node:assert');
const { LicenseManager, normalizeKey, GRACE_MS } = require('../src/main/license');
const { cleanNotes } = require('../src/main/updater');

const KEY = 'FC-ABCDE-FGHJK-MNPQR-STVWX-YZ234';

function setup(responder) {
  const store = { data: { license: null, deviceId: null }, saves: 0, save() { this.saves++; } };
  let t = 1_800_000_000_000;
  const calls = [];
  const fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, body, headers: opts.headers });
    const r = await responder(url, body);
    if (r === 'NET') throw new TypeError('fetch failed');
    return { ok: true, status: 200, json: async () => r };
  };
  const crypt = { encrypt: (s) => 'enc:' + Buffer.from(s).toString('base64'), decrypt: (s) => Buffer.from(s.slice(4), 'base64').toString() };
  const lm = new LicenseManager({ store, version: '9.9.9', crypt, fetch, now: () => t, url: 'https://x.supabase.co', key: 'pk' });
  return { lm, store, calls, advance: (ms) => { t += ms; } };
}

test('normalisasi kunci', () => {
  assert.strictEqual(normalizeKey(' fc-abcde fghjk-mnpqr-stvwx-yz234 '), KEY);
  assert.strictEqual(normalizeKey('ABCDEFGHJKMNPQRSTVWXYZ234'), KEY);
  assert.strictEqual(normalizeKey('salah'), 'SALAH');
});

test('aktivasi, verifikasi, tenggang offline, pencabutan', async () => {
  let mode = 'ok';
  const { lm, store, calls, advance } = setup(async (url) => {
    if (url.endsWith('/deactivate_license')) return { ok: true };
    if (mode === 'net') return 'NET';
    if (mode === 'revoked') return { ok: false, error: 'REVOKED' };
    return { ok: true, label: 'Kantor', email: 'a@b.c', devices: 1, max_devices: 3, expires_at: null };
  });
  assert.ok(store.data.deviceId, 'ID perangkat dibuat');
  assert.strictEqual(lm.state().state, 'none');
  assert.strictEqual(lm.licensed, false);

  await assert.rejects(lm.activate('bukan-kunci'), /INVALID_KEY/);
  assert.strictEqual(calls.length, 0, 'format salah tidak dikirim ke server');

  const st = await lm.activate(KEY.toLowerCase());
  assert.strictEqual(st.state, 'valid');
  assert.strictEqual(st.info.email, 'a@b.c');
  assert.ok(lm.licensed);
  assert.strictEqual(calls[0].url, 'https://x.supabase.co/rest/v1/rpc/activate_license');
  assert.strictEqual(calls[0].headers.apikey, 'pk');
  assert.deepStrictEqual(Object.keys(calls[0].body).sort(), ['p_app_version', 'p_device_id', 'p_device_name', 'p_key', 'p_platform']);
  assert.strictEqual(calls[0].body.p_key, KEY);
  assert.ok(!JSON.stringify(store.data.license).includes(KEY), 'kunci tidak disimpan polos');

  // offline: tetap boleh dipakai selama masa tenggang
  mode = 'net';
  advance(GRACE_MS - 60_000);
  assert.strictEqual((await lm.verify()).state, 'offline');
  assert.ok(lm.licensed);
  advance(120_000);
  const late = lm.state();
  assert.strictEqual(late.state, 'invalid');
  assert.strictEqual(late.error, 'OFFLINE_TOO_LONG');

  // online lagi → valid
  mode = 'ok';
  assert.strictEqual((await lm.verify()).state, 'valid');

  // dicabut di situs → terkunci, walau nanti offline
  mode = 'revoked';
  assert.strictEqual((await lm.verify()).error, 'REVOKED');
  mode = 'net';
  await lm.verify();
  assert.strictEqual(lm.state().error, 'REVOKED');
  assert.strictEqual(lm.licensed, false);

  // aktivasi gagal tidak menghapus apa pun; keluar menghapus kunci
  await assert.rejects(lm.activate(KEY), /NETWORK/);
  await lm.deactivate();
  assert.strictEqual(lm.state().state, 'none');
  assert.ok(calls.some((c) => c.url.endsWith('/deactivate_license')));
});

test('batas perangkat & kedaluwarsa', async () => {
  const { lm } = setup(async () => ({ ok: false, error: 'DEVICE_LIMIT', max_devices: 3 }));
  await assert.rejects(lm.activate(KEY), /DEVICE_LIMIT/);
  assert.strictEqual(lm.state().state, 'none');

  const b = setup(async () => ({ ok: true, label: 'x', expires_at: new Date(1_800_000_000_000 + 1000).toISOString() }));
  await b.lm.activate(KEY);
  assert.ok(b.lm.licensed);
  b.advance(5000);
  assert.strictEqual(b.lm.state().error, 'EXPIRED');
});

test('catatan rilis dibersihkan', () => {
  assert.strictEqual(cleanNotes('<p>Baru: <b>lisensi</b> &amp; update</p>'), 'Baru: lisensi update');
  assert.strictEqual(cleanNotes([{ note: 'a' }, { note: 'b' }]), 'a\nb');
});
