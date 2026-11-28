'use strict';
// Proses browser per profil: dicari dari baris perintah (agar proses lama berport debug bisa ditutup sebelum login Google).
const test = require('node:test');
const assert = require('node:assert');
const { parseProfileProcesses, isLoginRejectedUrl } = require('../src/main/browser');

test('Proses profil: hanya profil yang sama (a1 ≠ a10), proses utama vs anak, port debug & headless dikenali', () => {
  const linux = [
    '123 /opt/google/chrome/chrome --user-data-dir=/home/u/fc/profiles/a1 --no-first-run --remote-debugging-port=0 about:blank',
    '124 /opt/google/chrome/chrome --type=renderer --user-data-dir=/home/u/fc/profiles/a1 --lang=en',
    '125 /opt/google/chrome/chrome --user-data-dir=/home/u/fc/profiles/a10 --no-first-run',
    '126 /opt/google/chrome/chrome --user-data-dir=/home/u/fc/profiles/a1 --no-first-run --app=https://accounts.google.com/',
    'xx bukan baris proses'
  ].join('\n');
  assert.deepStrictEqual(parseProfileProcesses(linux, '/home/u/fc/profiles/a1/', 'linux'), [
    { pid: 123, main: true, debug: true, headless: false },
    { pid: 124, main: false, debug: false, headless: false },
    { pid: 126, main: true, debug: false, headless: false }
  ]);
  // Windows: huruf besar/kecil & garis miring diabaikan, path berspasi dalam tanda kutip
  const win = [
    '4000 "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" "--user-data-dir=C:\\Users\\John Doe\\AppData\\Roaming\\FLOW-CONNECT\\profiles\\a4" --headless=new --remote-debugging-port=0',
    '4001 chrome.exe --user-data-dir=C:\\Users\\John Doe\\AppData\\Roaming\\FLOW-CONNECT\\profiles\\a40 --no-first-run',
    '4002 "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --type=gpu-process "--user-data-dir=C:\\Users\\John Doe\\AppData\\Roaming\\FLOW-CONNECT\\profiles\\a4"'
  ].join('\r\n');
  assert.deepStrictEqual(parseProfileProcesses(win, 'c:\\users\\john doe\\appdata\\roaming\\flow-connect\\profiles\\a4', 'win32'), [
    { pid: 4000, main: true, debug: true, headless: true },
    { pid: 4002, main: false, debug: false, headless: false }
  ]);
  assert.deepStrictEqual(parseProfileProcesses('', '/x'), []);
});

test('Halaman penolakan Google ("This browser or app may not be secure") dikenali dari URL', () => {
  assert.ok(isLoginRejectedUrl('https://accounts.google.com/v3/signin/rejected?rrk=46&hl=en'));
  assert.ok(isLoginRejectedUrl('https://accounts.google.com/signin/rejected?rrk=46'));
  assert.ok(!isLoginRejectedUrl('https://accounts.google.com/v3/signin/identifier?continue=x'));
  assert.ok(!isLoginRejectedUrl('https://evil.example/accounts.google.com/v3/signin/rejected'));
  assert.ok(!isLoginRejectedUrl(null));
});
