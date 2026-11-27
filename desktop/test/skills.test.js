'use strict';
// Studio → Skill & Alat: validasi skill, ekspor/impor, templat skill bawaan, ganti nama massal & simpan hasil alat.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const skillstore = require('../src/main/skillstore');
const tools = require('../src/main/tools');

// modul tampilan berformat ESM → impor lewat salinan .mjs
async function esm(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-esm-'));
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'src', 'renderer'))) {
    if (f.endsWith('.js')) fs.writeFileSync(path.join(dir, f.replace(/\.js$/, '.mjs')), fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', f), 'utf8').replace(/from '\.\/([a-z]+)\.js'/g, "from './$1.mjs'"));
  }
  return import(pathToFileURL(path.join(dir, name + '.mjs')).href);
}

test('skill: sanitasi, Frame wajib 2 foto, impor/ekspor', () => {
  assert.strictEqual(skillstore.sanitizeSkill({ name: '', template: 'x' }), null);
  assert.strictEqual(skillstore.sanitizeSkill({ name: 'A', template: '   ' }), null);
  const sk = skillstore.sanitizeSkill({ name: 'Transisi', template: 'dari {@1} ke {@2}', category: 'video', settings: { kind: 'video', sub: 'frames', ratio: '1:1', count: 9 }, refs: { min: 0, max: 0 }, icon: 'BAD ICON' });
  assert.match(sk.id, /^my-/);
  assert.deepStrictEqual(sk.refs, { min: 2, max: 2 });
  assert.strictEqual(sk.settings.ratio, '16:9', 'video hanya 16:9 / 9:16');
  assert.strictEqual(sk.settings.count, undefined);
  assert.strictEqual(sk.icon, 'sparkles');
  const doc = skillstore.exportDoc([sk]);
  const back = skillstore.parseImport(JSON.stringify(doc));
  assert.strictEqual(back.length, 1);
  assert.strictEqual(back[0].template, 'dari {@1} ke {@2}');
  assert.throws(() => skillstore.parseImport('bukan json'), /INVALID_SKILL_FILE/);
  assert.throws(() => skillstore.parseImport('{"skills":[{"name":""}]}'), /INVALID_SKILL_FILE/);
  let list = skillstore.upsert([], sk);
  list = skillstore.upsert(list, { ...sk, name: 'Baru' });
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].name, 'Baru');
});

test('skill bawaan: semua templat tersusun & ikon tersedia', async () => {
  const { BUILTIN_SKILLS, FLOW_TOOLS, LOCAL_TOOLS, parseFields, compose, missingFields, aiMode } = await esm('skills');
  const { ICONS } = await esm('icons');
  assert.strictEqual(BUILTIN_SKILLS.length, 24);
  assert.strictEqual(FLOW_TOOLS.length, 12);
  assert.strictEqual(LOCAL_TOOLS.length, 6);
  for (const t of [...BUILTIN_SKILLS, ...FLOW_TOOLS, ...LOCAL_TOOLS]) assert.ok(ICONS[t.icon], `ikon ${t.icon} (${t.name})`);
  for (const sk of BUILTIN_SKILLS) {
    const vals = {};
    for (const f of parseFields(sk.template)) if (!f.options) vals[f.label] = 'contoh';
    const out = compose(sk.template, vals, ['foto1', 'foto2']);
    assert.ok(out.length > 20 && !/[{}[\]]/.test(out), `${sk.id}: ${out}`);
    assert.deepStrictEqual(missingFields(sk.template, vals), [], sk.id);
  }
  const product = BUILTIN_SKILLS.find((x) => x.id === 'b-product');
  const p = compose(product.template, { Produk: 'kopi' }, []);
  assert.ok(p.startsWith('Professional commercial product photograph of kopi'));
  assert.ok(!p.includes('exactly matching'), 'bagian opsional dibuang bila foto tidak ada');
  assert.ok(compose(product.template, { Produk: 'kopi' }, ['botol']).includes('@botol'), 'tag @ foto');
  const fix = BUILTIN_SKILLS.find((x) => x.id === 'b-fix');
  const mf = parseFields(fix.template).find((f) => f.options);
  assert.ok(mf, 'skill AI punya pilihan jenis');
  assert.strictEqual(aiMode(fix, { [mf.label]: 'Gambar' }), 'image');
  assert.strictEqual(aiMode(fix, { [mf.label]: 'Video' }), 'video');
});

test('alat: simpan hasil hanya format gambar yang valid', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-alat-'));
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const a = tools.saveOutput(dir, { name: 'kopi: 1/1?', data: new Uint8Array(png), format: 'png' });
  assert.strictEqual(path.basename(a), 'kopi 1 1.png');
  const b = tools.saveOutput(dir, { name: 'kopi: 1/1?', data: new Uint8Array(png), format: 'png' });
  assert.strictEqual(path.basename(b), 'kopi 1 1 (2).png');
  assert.throws(() => tools.saveOutput(dir, { name: 'x', data: new Uint8Array(png), format: 'jpg' }), /INVALID_OUTPUT/);
  assert.throws(() => tools.saveOutput(dir, { name: 'x', data: new Uint8Array(png), format: 'exe' }), /INVALID_OUTPUT/);
});

test('alat: ganti nama massal', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-ren-'));
  const at = new Date(2026, 10, 25, 9, 5).getTime();
  const downloads = ['Kucing - 1a.png', 'Hujan - 2b.mp4', 'Narasi - 3c.mp3'].map((n, i) => {
    const p = path.join(dir, n); fs.writeFileSync(p, 'x');
    return { path: p, name: n, accountId: 'a1', at: at + i };
  });
  assert.throws(() => tools.renamePlan(downloads, { pattern: '{tanggal}' }), /RENAME_NEEDS_TOKEN/);
  const plan = tools.renamePlan(downloads, { pattern: '{akun} {n} {jenis}', start: 1 }, () => 'Kerja');
  assert.deepStrictEqual(plan.map((p) => p.name), ['Kerja 01 gambar.png', 'Kerja 02 video.mp4', 'Kerja 03 audio.mp3']);
  assert.deepStrictEqual(tools.renamePlan(downloads, { pattern: '{tanggal} {nama}', cat: 'video' }).map((p) => p.name), ['2026-11-25 Hujan - 2b.mp4']);
  const r = tools.applyRename(downloads, plan);
  assert.deepStrictEqual(r, { renamed: 3, skipped: 0 });
  assert.ok(fs.existsSync(path.join(dir, 'Kerja 02 video.mp4')));
  assert.strictEqual(downloads[1].name, 'Kerja 02 video.mp4', 'daftar unduhan ikut diperbarui');
});
