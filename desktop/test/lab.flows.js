'use strict';
// Alur utama tiap Alat Kreatif (dipanggil dari lab.test.js — bukan berkas uji tersendiri).

exports.textanim = async ({ ev, open, click, waitFor, sleep, saved, noErrors, shot, assert }) => {
  await open('textanim');
  // AI menulis baris teks → lapisan teks bertambah
  await click('.side button', 'Tulis dengan AI');
  await waitFor('document.querySelector("#dlg").open');
  await ev('document.querySelector("#dlg textarea").value = "Promo kopi"');
  await click('#dlg .btn.primary');
  await waitFor('document.querySelectorAll(".tl-item").length === 2', 8000, 'AI menulis 2 baris');
  assert.ok(await ev('window.__ai[0].prompt.includes("Promo kopi")'));
  // latar video + ekspor video (direkam waktu-nyata)
  await click('.chip', 'Video / gambar');
  await click('.side .btn', 'Pilih gambar / video');
  await sleep(500);
  await ev('[...document.querySelectorAll(".side input[type=range]")].find((r) => r.max === "60") && (() => { const r = [...document.querySelectorAll(".side input[type=range]")].find((x) => x.max === "60"); r.value = 2; r.dispatchEvent(new Event("input")); })()');
  await click('.stagebar .btn', 'PNG frame ini');
  await waitFor('window.__saved.length === 1');
  assert.strictEqual((await saved())[0].format, 'png');
  await shot('textanim-flow');
  noErrors('teks animasi');
};

exports.resize = async ({ ev, open, click, waitFor, sleep, saved, noErrors, shot, assert }) => {
  await open('resize');
  await click('.stage .btn', 'Pilih video');
  await waitFor('document.querySelectorAll(".side .file").length === 1', 10000, 'video dimuat');
  await sleep(300);
  assert.deepStrictEqual(await ev('[document.querySelector(".stage canvas").width, document.querySelector(".stage canvas").height]'), [1080, 1920], '9:16 1080p');
  await click('.side .btn', 'Fokus otomatis');
  await waitFor('[...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("Titik fokus"))', 10000);
  await click('.side .btn', 'Fokus AI');
  await waitFor('[...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("lingkaran merah"))', 10000);
  assert.ok(await ev('window.__ai.at(-1).image'), 'frame dikirim ke AI');
  await click('.chip', '720p');
  await click('.stagebar .btn', 'Ekspor video');
  await waitFor('window.__saved.length === 1', 20000, 'video tersimpan');
  const s = (await saved())[0];
  assert.ok(['webm', 'mp4'].includes(s.format) && s.size > 1000, 'video: ' + JSON.stringify(s));
  if (s.format === 'webm') assert.deepStrictEqual(s.head.slice(0, 4), [0x1a, 0x45, 0xdf, 0xa3]);
  await shot('resize-flow');
  noErrors('ubah ukuran video');
};

exports.editor = async ({ open, click, waitFor, saved, noErrors, shot, assert }) => {
  await open('editor');
  await click('.stage .btn', 'Buka gambar');
  await waitFor('document.querySelectorAll(".right .layer").length === 2', 8000, '2 layer gambar');
  await click('.side .btn', 'Teks');
  await waitFor('document.querySelectorAll(".right .layer").length === 3');
  await click('.right .btn[title^="Urungkan"]');
  await waitFor('document.querySelectorAll(".right .layer").length === 2', 3000, 'urungkan');
  await click('.right .btn[title^="Ulangi"]');
  await waitFor('document.querySelectorAll(".right .layer").length === 3', 3000, 'ulangi');
  await click('.side .btn', 'Saran edit AI');
  await waitFor('document.querySelector("#dlg").open', 8000);
  await click('#dlg .btn.primary');
  await waitFor('document.querySelectorAll(".right .layer").length === 4', 3000, 'judul AI ditambahkan');
  await click('.stagebar .btn', 'Ekspor gambar');
  await waitFor('window.__saved.length === 1');
  assert.strictEqual((await saved())[0].format, 'png');
  await shot('editor-flow');
  noErrors('editor gambar');
};

// ---------- pembantu ----------
const setRange = (ev, label, v) => ev(`(() => { const f = [...document.querySelectorAll('.side label.field')].find((x) => x.querySelector('span') && x.querySelector('span').textContent.startsWith(${JSON.stringify(label)})); const r = f.querySelector('input[type=range]'); r.value = ${v}; r.dispatchEvent(new Event('input')); return r.value; })()`);
const setText = (ev, sel, v) => ev(`(() => { const t = document.querySelector(${JSON.stringify(sel)}); t.value = ${JSON.stringify(v)}; t.dispatchEvent(new Event('input')); return true; })()`);
const toastHas = (s) => `[...document.querySelectorAll('.toast')].some((t) => t.textContent.includes(${JSON.stringify(s)}))`;
const noErrToast = async (ev, assert, what) => assert.deepStrictEqual(await ev(`[...document.querySelectorAll('.toast.err')].map((t) => t.textContent)`), [], 'tanpa toast galat: ' + what);

exports.storyboard = async ({ ev, open, click, waitFor, saved, noErrors, shot, assert }) => {
  await ev('localStorage.clear()');
  await open('storyboard');
  await setText(ev, '.side textarea', 'Iklan kopi susu gula aren');
  await click('.side .btn', 'Tulis naskah');
  await waitFor('document.querySelectorAll(".board .scene-b").length === 2', 8000, '2 adegan dari AI');
  assert.ok(await ev('window.__ai.at(-1).prompt.includes("Iklan kopi")'));
  await click('.stagebar .btn', 'Semua prompt → Bulk');
  await waitFor('window.__bulk.length === 1');
  assert.strictEqual(await ev('window.__bulk[0].prompts.length'), 2);
  await click('.board .btn', 'Ke Studio');
  await waitFor('window.__studio.length === 1');
  await click('.side .btn', 'Naskah TXT');
  await click('.side .btn', 'Lembar PNG');
  await waitFor('window.__saved.length === 2', 10000, 'naskah + lembar');
  const s = await saved();
  assert.deepStrictEqual(s.map((x) => x.format).sort(), ['png', 'txt']);
  assert.ok(s.find((x) => x.format === 'txt').head.includes('Kopi Nusantara'));
  await click('.side .btn', 'Templat cepat');
  await waitFor('document.querySelectorAll(".board .scene-b").length >= 3', 5000, 'templat offline');
  await noErrToast(ev, assert, 'storyboard');
  await shot('storyboard-flow');
  noErrors('storyboard');
};

exports.shader = async ({ ev, open, click, waitFor, sleep, saved, noErrors, shot, assert }) => {
  await open('shader');
  await click('.stage .btn', 'Pakai gambar contoh');
  await sleep(300);
  await click('.side .btn', 'Tambah efek');
  await click('.side .btn', 'Buat efek (AI)');
  await waitFor('document.querySelector("#dlg").open');
  await setText(ev, '#dlg textarea', 'warna mimpi berdenyut');
  await click('#dlg .btn.primary');
  await waitFor('window.__ai.length >= 1 && !document.querySelector("#dlg").open', 8000);
  await sleep(600);
  await noErrToast(ev, assert, 'shader AI');
  await click('.stagebar .btn', 'Simpan PNG');
  await waitFor('window.__saved.length === 1', 8000);
  assert.strictEqual((await saved())[0].format, 'png');
  await shot('shader-flow');
  noErrors('shader');
};

exports.mockup = async ({ ev, open, click, waitFor, sleep, saved, noErrors, shot, assert }) => {
  await open('mockup');
  await click('.stage .btn', 'Pilih desain');
  await waitFor('document.querySelector(".stage canvas")', 8000, 'kanvas mockup');
  await sleep(300);
  await click('.side .btn', 'Ide AI');
  await waitFor('window.__ai.length === 1');
  assert.ok(await ev('window.__ai[0].image'), 'desain dikirim ke AI');
  await sleep(300);
  await click('.side .btn', 'Gaya 3D');
  await click('.stagebar .btn', 'Ekspor mockup');
  await waitFor('window.__saved.length === 1', 8000);
  await click('.btn', 'Ekspor semua');
  await waitFor('window.__saved.length === 3', 10000, 'ekspor semua (2 desain)');
  assert.ok((await saved()).every((x) => x.format === 'png' && x.size > 5000));
  await noErrToast(ev, assert, 'mockup');
  await shot('mockup-flow');
  noErrors('mockup');
};

exports.beat = async ({ ev, open, click, waitFor, sleep, saved, noErrors, shot, assert }) => {
  await ev('localStorage.clear()');
  await open('beat');
  await click('.side .btn', 'Pilih musik');
  await waitFor(toastHas('Tempo terdeteksi'), 10000, 'tempo');
  const bpm = Number(await ev(`(() => { const t = [...document.querySelectorAll('.toast')].find((x) => x.textContent.includes('Tempo')).textContent; return t.match(/([0-9]+[.,][0-9])/)[1].replace(',', '.'); })()`));
  assert.ok(bpm > 116 && bpm < 124, 'BPM ~120: ' + bpm);
  await ev('window.__pick = ["/foto/a.png", "/foto/b.png", "/video/klip.webm"]');
  await click('.side .btn', 'Pilih gambar / video');
  await waitFor('document.querySelectorAll(".side .file").length === 3', 10000, '3 klip');
  await setRange(ev, 'Panjang video', 3);
  await click('.chip', '720p');
  await click('.chip', 'Guncang');
  await click('.stagebar .btn', 'Putar');
  await sleep(800);
  await click('.stagebar .btn', 'Berhenti');
  await click('.stagebar .btn', 'Ekspor video');
  await waitFor('window.__saved.length === 1', 20000, 'video tersimpan');
  const s = (await saved())[0];
  assert.ok(['webm', 'mp4'].includes(s.format) && s.size > 1000, JSON.stringify(s));
  await noErrToast(ev, assert, 'beat');
  await shot('beat-flow');
  noErrors('beat');
};

exports.converge = async ({ ev, open, click, waitFor, noErrors, shot, assert }) => {
  await open('converge');
  await click('.side .chip', 'Ember');
  await click('.side .btn', 'Rapikan garis');
  await click('.side .btn', 'Baca sketsa');
  await waitFor('[...document.querySelectorAll(".side textarea")].some((t) => t.value.includes("Photorealistic"))', 8000, 'prompt AI');
  assert.ok(await ev('window.__ai[0].image'), 'sketsa dikirim ke AI');
  await click('.stagebar .btn', 'Render di Studio');
  await waitFor('window.__studio.length === 1');
  const st = await ev('window.__studio[0]');
  assert.strictEqual(st.images.length, 1);
  assert.ok(st.prompt.includes('Photorealistic') && st.kind === 'image');
  await noErrToast(ev, assert, 'converge');
  await shot('converge-flow');
  noErrors('converge');
};

exports.character = async ({ ev, open, click, waitFor, saved, noErrors, shot, assert }) => {
  await ev('localStorage.clear()');
  await open('character');
  await click('.stage .btn', 'Pilih gambar');
  await waitFor('document.querySelector(".stage .tabs")', 8000);
  for (const t of ['X-ray', 'Garis', 'Siluet', 'Palet']) await click('.stage .tab', t);
  await click('.side .btn', 'X-ray karakter');
  await waitFor('[...document.querySelectorAll(".stage h2")].some((x) => x.textContent === "Nara")', 8000, 'lembar karakter');
  await click('.stage .btn', 'Semua → Bulk');
  await waitFor('window.__bulk.length === 1');
  assert.strictEqual(await ev('window.__bulk[0].prompts.length'), 2);
  await click('.stage .btn', 'Ke Studio');
  await waitFor('window.__studio.length === 1');
  assert.strictEqual(await ev('window.__studio[0].images.length'), 1);
  await click('.side .btn', 'Lembar PNG');
  await click('.side .btn', 'Profil TXT');
  await waitFor('window.__saved.length === 2', 10000);
  assert.deepStrictEqual((await saved()).map((x) => x.format).sort(), ['png', 'txt']);
  await noErrToast(ev, assert, 'character');
  await shot('character-flow');
  noErrors('character');
};

exports.pixel = async ({ ev, open, click, waitFor, sleep, saved, noErrors, shot, assert }) => {
  await ev('localStorage.clear()');
  await open('pixel');
  await click('.stage .btn', 'Pilih gambar');
  await waitFor('document.querySelector(".stage canvas")', 8000);
  await click('.side .chip', 'Game Boy');
  await click('.side .chip', 'Floyd');
  await sleep(200);
  const colors = await ev(`(() => { const c = document.querySelector('.stage canvas'); const g = c.getContext('2d'); const k = c.width / 64; const s = new Set(); for (let y = 0; y < c.height / k; y += 3) for (let x = 0; x < 64; x += 3) { const d = g.getImageData(Math.floor((x + 0.5) * k), Math.floor((y + 0.5) * k), 1, 1).data; s.add([d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')); } return [...s]; })()`);
  const gb = ['0f380f', '306230', '8bac0f', '9bbc0f'];
  assert.ok(colors.every((c) => gb.includes(c)), 'palet GB: ' + colors.join(','));
  assert.ok(colors.filter((c) => gb.includes(c)).length >= 2, 'warna GB dipakai: ' + colors.join(','));
  await setText(ev, '.side input.input[placeholder^="mis. senja"]', 'senja');
  await click('.side .btn', 'Buat palet dengan AI');
  await waitFor('[...document.querySelectorAll(".side .chip.on")].some((x) => x.textContent === "Senja")', 8000, 'palet AI');
  await click('.side .btn', 'Tambah ke bento');
  await click('.side .btn', 'Ekspor lembar bento');
  await click('.stagebar .btn', 'Ekspor PNG');
  await waitFor('window.__saved.length === 2', 10000);
  assert.ok((await saved()).every((x) => x.format === 'png'));
  await noErrToast(ev, assert, 'pixel');
  await shot('pixel-flow');
  noErrors('pixel');
};

exports.gridarch = async ({ ev, open, click, waitFor, sleep, saved, noErrors, shot, assert }) => {
  await ev('localStorage.clear()');
  await open('gridarch');
  await setText(ev, '.side textarea', 'bola merah');
  await click('.side .btn', 'Rancang dengan AI');
  await waitFor('document.querySelectorAll(".stage .scene").length === 4', 8000, '4 panel rancangan');
  await click('.stage .btn', 'Ke Studio');
  await waitFor('window.__studio.length === 1');
  await click('.side .tab', 'Pecah');
  await ev('window.__pick = ["/foto/grid.png"]');
  await click('.stage .btn', 'Pilih gambar kisi');
  await waitFor(toastHas('Kisi terdeteksi 2×2'), 8000, 'deteksi 2×2');
  assert.strictEqual(await ev('document.querySelectorAll(".stage .scene").length'), 4);
  const sizes = await ev('[...document.querySelectorAll(".stage .scene .faint")].map((x) => x.textContent)');
  assert.ok(sizes.every((s) => /^29\d×29\d$/.test(s)), 'gutter dirapikan: ' + sizes);
  await click('.side .btn', 'Simpan 4 panel');
  await waitFor('window.__saved.length === 4', 8000);
  await ev('[...document.querySelectorAll(".stage .scene input[type=checkbox]")].slice(2).forEach((c) => c.click())');
  await sleep(100);
  await click('.side .btn', '2 panel → Video Frame');
  await waitFor('window.__studio.length === 2');
  const st = await ev('window.__studio[1]');
  assert.ok(st.kind === 'video' && st.images.length === 2);
  await click('.side .tab', 'Susun');
  await click('.stage .btn', 'Tambah gambar');
  await waitFor('document.querySelectorAll(".side .file").length === 2', 8000);
  await click('.side .btn', 'Ekspor kisi PNG');
  await waitFor('window.__saved.length >= 7', 8000);
  await noErrToast(ev, assert, 'gridarch');
  await shot('gridarch-flow');
  noErrors('gridarch');
  void saved;
};

exports.scout = async ({ ev, open, click, waitFor, sleep, saved, noErrors, shot, assert }) => {
  await ev('localStorage.clear()');
  await open('scout');
  await sleep(300);
  await click('.side .btn', 'Rekam keyframe');
  await ev('for (let i = 0; i < 6; i++) window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true }))');
  await ev('window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }))');
  await waitFor('document.querySelectorAll(".side .file").length === 2', 5000, '2 keyframe');
  await click('.side .btn', 'Ambil still');
  await click('.side .btn', 'Ke Studio');
  await waitFor('window.__studio.length === 1');
  await click('.side .btn', 'Rancang shot');
  await waitFor(toastHas('2 shot'), 8000, 'shot AI');
  assert.ok(await ev('window.__ai[0].image'), 'panorama dikirim ke AI');
  await click('.side .btn', 'Prompt → Bulk');
  await waitFor('window.__bulk.length === 1');
  assert.strictEqual(await ev('window.__bulk[0].kind'), 'video');
  await click('.side .chip', 'Little planet');
  const n0 = await ev('window.__saved.length');
  await click('.side .btn', 'PNG tampilan ini');
  await waitFor('window.__saved.length === ' + (n0 + 1), 8000);
  await click('.side .chip', 'Kamera');
  await ev('window.__pick = ["/foto/panorama.png"]');
  await click('.side .btn', 'panorama');
  await waitFor('document.querySelector(".side .faint.small").textContent.includes("1024×512")', 8000, 'panorama dimuat');
  await setRange(ev, 'Durasi', 4);
  await click('.chip', '720p');
  await click('.stagebar .btn', 'Ekspor video tur');
  await waitFor('window.__saved.length === ' + (n0 + 2), 20000, 'video tur');
  const v = (await saved()).at(-1);
  assert.ok(['webm', 'mp4'].includes(v.format) && v.size > 1000, JSON.stringify(v));
  await noErrToast(ev, assert, 'scout');
  await shot('scout-flow');
  noErrors('scout');
};
