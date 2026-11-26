'use strict';
// Uji logika pemeriksaan pembaruan otomatis (tanpa jaringan): notifikasi muncul sendiri,
// gagal → coba lagi cepat, pemeriksaan berkala & saat jendela difokuskan.
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const { Updater, CHECK_EVERY_MS, NUDGE_AFTER_MS, RETRY_MS } = require('../src/main/updater');

function fakeAu(script) {
  const au = new EventEmitter();
  au.checks = 0;
  au.checkForUpdates = async () => {
    au.checks++;
    au.emit('checking-for-update');
    const r = script(au.checks);
    if (r === 'NET') { const e = new Error('net::ERR_INTERNET_DISCONNECTED\nstack'); au.emit('error', e); throw e; }
    if (r) au.emit('update-available', { version: r, releaseNotes: '<p>Baru</p>' });
    else au.emit('update-not-available', {});
  };
  au.downloadUpdate = async () => {};
  return au;
}
const mk = (au) => new Updater({ app: { isPackaged: true, getVersion: () => '1.3.1' }, platform: 'win32', autoUpdater: au, log: { warn() {}, error() {} } });
const flush = () => new Promise((r) => setImmediate(r));

test('pembaruan terdeteksi otomatis tanpa klik "Periksa pembaruan"', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const au = fakeAu(() => '1.3.2');
  const u = mk(au);
  const available = [];
  const changes = [];
  u.on('available', (s) => available.push(s.version));
  u.on('change', (s) => changes.push(s.state));
  u.start();
  assert.strictEqual(au.checks, 0);
  t.mock.timers.tick(5000);
  await flush();
  assert.strictEqual(au.checks, 1, 'diperiksa sendiri saat aplikasi dibuka');
  assert.deepStrictEqual(available, ['1.3.2'], 'notifikasi dikirim');
  assert.strictEqual(u.state().state, 'available');
  assert.ok(changes.includes('available'), 'tampilan diberi tahu');
  // pemeriksaan berkala berikutnya: versi sama → tidak memberi tahu dua kali, tetap "available"
  t.mock.timers.tick(CHECK_EVERY_MS);
  await flush();
  assert.strictEqual(au.checks, 2);
  assert.deepStrictEqual(available, ['1.3.2']);
  assert.strictEqual(u.state().state, 'available');
  u.stop();
});

test('internet belum siap saat start → dicoba lagi dalam 1 menit, lalu notifikasi muncul', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const au = fakeAu((n) => (n <= 2 ? 'NET' : '1.4.0'));
  const u = mk(au);
  const available = [];
  u.on('available', (s) => available.push(s.version));
  u.start();
  t.mock.timers.tick(5000);
  await flush();
  assert.strictEqual(u.state().state, 'error');
  assert.strictEqual(u.state().error, 'net::ERR_INTERNET_DISCONNECTED', 'galat satu baris');
  t.mock.timers.tick(RETRY_MS[0]);
  await flush();
  assert.strictEqual(au.checks, 2, 'coba lagi setelah 1 menit');
  t.mock.timers.tick(RETRY_MS[1]);
  await flush();
  assert.strictEqual(au.checks, 3, 'coba lagi berikutnya');
  assert.deepStrictEqual(available, ['1.4.0']);
  // pemeriksaan ulang gagal setelah pembaruan diketahui → bilah pembaruan tetap ada
  au.checkForUpdates = async () => { au.checks++; au.emit('checking-for-update'); au.emit('error', new Error('timeout')); throw new Error('timeout'); };
  await u.check();
  assert.strictEqual(u.state().state, 'available');
  u.stop();
});

test('jendela difokuskan / PC bangun → periksa bila sudah lama', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const au = fakeAu((n) => (n === 1 ? null : '2.0.0'));
  const u = mk(au);
  u.nudge();
  assert.strictEqual(au.checks, 0, 'sebelum start tidak memeriksa');
  u.start();
  t.mock.timers.tick(5000);
  await flush();
  assert.strictEqual(u.state().state, 'none');
  u.nudge();
  await flush();
  assert.strictEqual(au.checks, 1, 'baru saja diperiksa → dilewati');
  t.mock.timers.tick(NUDGE_AFTER_MS + 1);
  u.nudge();
  await flush();
  assert.strictEqual(au.checks, 2);
  assert.strictEqual(u.state().version, '2.0.0');
  u.stop();
});

test('tidak didukung (bukan aplikasi terpasang) → tidak memeriksa', async () => {
  const au = fakeAu(() => '9.9.9');
  const u = new Updater({ app: { isPackaged: false, getVersion: () => '1.0.0' }, platform: 'win32', autoUpdater: au });
  u.start();
  u.nudge();
  await u.check();
  assert.strictEqual(au.checks, 0);
  assert.strictEqual(u.state().state, 'unsupported');
});
