'use strict';
// Uji unit: tag "@" gambar referensi & pembaca balasan batchexecute Google Flow.
const test = require('node:test');
const assert = require('node:assert');
const { baseTag, refTags, sanitizeTags, parsePrompt } = require('../src/main/refs');
const wire = require('../src/main/wire');
const image = require('../src/main/skills/image');

test('tag @ dari nama file: pendek, aman, unik', () => {
  assert.strictEqual(baseTag('C:\\Foto\\Kucing Oren (1).PNG'), 'kucing-oren-1');
  assert.strictEqual(baseTag('/x/Café Ñandú.jpg'), 'cafe-nandu');
  assert.strictEqual(baseTag('2024-08-17.webp'), 'img2024-08-17');
  assert.strictEqual(baseTag('日本.png'), 'gambar');
  assert.ok(baseTag('a'.repeat(80) + '.png').length <= 20);
  assert.deepStrictEqual(refTags(['/a/logo.png', '/b/logo.jpg', '/c/Logo.webp', '/d/x.png']), ['logo', 'logo2', 'logo3', 'x']);
  assert.deepStrictEqual(sanitizeTags(['kucing', 'bad tag!'], ['/a/1.png', '/b/2.png']), ['kucing', 'img2']);
  assert.deepStrictEqual(sanitizeTags(['a', 'A'], ['/a/a.png', '/b/b.png']), ['a', 'b']);
  assert.deepStrictEqual(sanitizeTags(null, ['/a/x.png']), ['x']);
});

test('parsePrompt memecah teks & penanda', () => {
  const p = parsePrompt('Foto @kucing di (@latar), email a@b.com dan @me!', ['kucing', 'latar']);
  assert.deepStrictEqual(p.segments, [{ text: 'Foto ' }, { ref: 0 }, { text: ' di (' }, { ref: 1 }, { text: '), email a@b.com dan ' }, { mention: 'me' }, { text: '!' }]);
  assert.deepStrictEqual(p.used, [0, 1]);
  assert.deepStrictEqual(p.mentions, ['me']);
  assert.deepStrictEqual(parsePrompt('@KUCING lagi @kucing', ['kucing']).used, [0]);
  assert.deepStrictEqual(parsePrompt('tanpa tag', ['x']).segments, [{ text: 'tanpa tag' }]);
});

const env = (rows) => `)]}'\n\n123\n${JSON.stringify(rows)}\n25\n[["e",4,null,null,456]]\n`;

test('wire: penolakan, record video, gambar, unggahan', () => {
  assert.deepStrictEqual(wire.rpcidsOf('https://labs.google/fx/api/x/data/batchexecute?rpcids=ogiZ0b,Zzl0ze&rt=c'), ['ogiZ0b', 'Zzl0ze']);
  assert.deepStrictEqual(wire.rpcidsOf('https://labs.google/other?rpcids=x'), []);

  const blocked = env([['wrb.fr', 'ogiZ0b', null, null, null, [8, null, [['type.googleapis.com/google.rpc.ErrorInfo', ['PUBLIC_ERROR_UNUSUAL_ACTIVITY', 'x']]]], 'generic']]);
  assert.deepStrictEqual(wire.refusal(blocked, ['ogiZ0b']), { code: 'FLOW_UNUSUAL_ACTIVITY', reason: 'PUBLIC_ERROR_UNUSUAL_ACTIVITY', grpc: 8, suspect: true, text: 'unusual activity' });
  assert.strictEqual(wire.refusal(blocked, ['maseQ']), null);
  const unsafe = env([['wrb.fr', 'ogiZ0b', null, null, null, [3, null, [['type.googleapis.com/google.rpc.ErrorInfo', ['PUBLIC_ERROR_UNSAFE_GENERATION']]]]]]);
  assert.strictEqual(wire.refusal(unsafe).code, 'FLOW_CONTENT_POLICY');
  const grpc = env([['wrb.fr', 'maseQ', null, null, null, [3]]]);
  assert.strictEqual(wire.refusal(grpc, ['maseQ']).code, 'FLOW_REFUSED');
  assert.strictEqual(wire.refusal(grpc, ['maseQ']).text, 'gRPC 3');

  const W = '11111111-1111-4111-8111-111111111111', P = '22222222-2222-4222-8222-222222222222', M = '33333333-3333-4333-8333-333333333333';
  const det = (cell) => [null, null, null, null, null, null, null, null, cell];
  const recs = wire.generationRecords([[[W, P, M, 'm', null, det([7, [13, 'Audio failed']])]], [[W, P, M.replace('3333-4', '4444-4'), 'm', null, det([2])]]]);
  assert.strictEqual(recs.length, 2);
  assert.deepStrictEqual(recs[0], { workflowId: W, projectId: P, mediaId: M, status: 7, done: false, running: false, failed: true, errorCode: 13, errorText: 'Audio failed' });
  assert.strictEqual(recs[1].running, true);
  assert.strictEqual(wire.generationRecords([[W, P, M, null, null, det([3])]])[0].done, true);

  const imgs = wire.imageRecords(['proj', [[M, null, W, null, null, null, [['https://flow-content.google/image/1', 1024]]]]]);
  assert.deepStrictEqual(imgs, [{ mediaId: M, workflowId: W, url: 'https://flow-content.google/image/1' }]);

  const upl = env([['wrb.fr', 'maseQ', JSON.stringify([[P, M], 'x.png']), null, null, null, 'generic']]);
  assert.strictEqual(wire.uploadedMediaId(upl, P), M);
  assert.strictEqual(wire.uploadedMediaId(upl, null), P);
  assert.strictEqual(wire.uploadedMediaId(env([['wrb.fr', 'other', '["' + M + '"]']]), null), null);
  assert.deepStrictEqual(wire.frames(upl).map((f) => f[0]), ['maseQ']);
});

test('skill foto: mode gambar dipaksa, rencana tag', () => {
  const j = image.normalize({ prompt: ' Foto @kucing ', images: ['/a/kucing.png', '/b/latar.jpg'], options: { kind: 'video', sub: 'frames', duration: 8 } });
  assert.strictEqual(j.options.kind, 'image');
  assert.strictEqual(j.options.sub, 'text');
  assert.strictEqual(j.options.duration, 0);
  assert.deepStrictEqual(j.tags, ['kucing', 'latar']);
  assert.deepStrictEqual(image.plan(j), { tags: ['kucing', 'latar'], mentioned: ['kucing'], autoTagged: ['latar'], otherMentions: [] });
  assert.throws(() => image.normalize({ prompt: '  ', images: [] }), /INVALID_PROMPT/);
});
