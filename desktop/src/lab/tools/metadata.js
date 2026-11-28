// Cek Metadata — pindai EXIF/XMP/IPTC/C2PA & penanda AI pada gambar/video, lalu hapus lossless.
// Inti pemindaian diport dari BLEA-AI (src/lab/metadata-core.js). Offline; opsional:
// cek visual dengan model vision terdaftar (hasilnya digabung, bukan menggantikan pindai biner).
import {
  h, button, section, toast, errText, ai, aiState, io, persisted, canvas, dataUrlFor, emptyStage, seek
} from '../core.js';
import {
  scanMediaMetadata, stripMediaMetadata, mergeAiScanFindings,
  METADATA_MAX_FILE_BYTES, formatBytesCompact
} from '../metadata-core.js';

export async function mount(ctx) {
  const S = persisted('metadata', {});
  let file = null; // {path, name, mime, bytes, kind:'image'|'video', el (ImageBitmap|HTMLVideoElement)}
  let scan = null, cleaned = null, busy = false, aiNote = '';
  ctx.stage.classList.add('scroll');
  const body = h('div.sheet');

  async function load(p) {
    busy = true; render();
    try {
      const { name, mime, blob } = await io.blob(p);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length > METADATA_MAX_FILE_BYTES) throw new Error('FILE_TOO_LARGE');
      let kind = 'image', el;
      if (mime.startsWith('video/')) { kind = 'video'; el = (await io.video(p)).video; }
      else el = (await io.image(p)).bmp;
      file = { path: p, name, mime, bytes, kind, el };
      cleaned = null; aiNote = '';
      scan = await scanMediaMetadata(bytes, { fileName: name, mimeType: mime });
      if (!scan.supported) toast(scan.error || 'Format tidak didukung.', 'err');
    } catch (e) { toast(errText(e), 'err'); }
    busy = false; render(); build();
  }

  async function strip() {
    if (!file || busy) return;
    busy = true; render();
    try {
      cleaned = await stripMediaMetadata(file.bytes, { fileName: file.name, mimeType: file.mime });
      toast(`Metadata dibersihkan: ${cleaned.removedCount} entri dihapus (${formatBytesCompact(cleaned.originalSize)} → ${formatBytesCompact(cleaned.cleanedSize)}).`, 'ok');
    } catch (e) { toast(errText(e), 'err'); }
    busy = false; render(); build();
  }

  async function aiCheck() {
    if (!file || busy) return;
    busy = true; render();
    try {
      let img = file.el;
      if (file.kind === 'video') { await seek(file.el, (file.el.duration || 0) / 2); }
      const parsed = await ai(
        'Kamu pemeriksa metadata media. Lihat gambar/frame ini dan laporkan: apakah tampak dibuat AI (watermark, artefak generator, gaya khas model)? ' +
        'Jawab JSON: {"ai_detected":true/false,"detected_models":["nama model bila dikenali"],"metadata_tags_to_remove":[{"tag":"nama tag","value":"isi","model_name":"model","category":"kategori","reason":"alasan"}],"confidence":"tinggi/sedang/rendah","visual_assessment":"penilaian visual singkat","summary":"ringkasan satu kalimat"}.',
        { json: true, image: dataUrlFor(img, 900, 0.88) }
      );
      scan = mergeAiScanFindings(scan, parsed, { model: aiState.model || 'vision', provider: 'flow-connect', mode: 'vision' });
      aiNote = [parsed.visual_assessment, parsed.summary].filter(Boolean).join(' — ').slice(0, 600);
      toast('Cek visual AI selesai.', 'ok');
    } catch (e) { toast(errText(e), 'err'); }
    busy = false; render(); build();
  }

  function entryRow(e) {
    return h('div.kv',
      h('b', { text: e.group }),
      h('span', h('span', { text: `${e.key}: ${e.value}` }), e.isAi ? h('span.tag', { style: 'margin-left:6px', text: 'AI' }) : null,
        h('span.faint.small', { text: ' · ' + (e.location || '') })));
  }

  function render() {
    let preview = null;
    if (file) {
      if (file.kind === 'video') {
        preview = file.el;
        preview.controls = true; preview.style.maxHeight = '62vh'; preview.style.maxWidth = '100%'; preview.style.borderRadius = '10px';
      } else {
        preview = canvas(file.el.width, file.el.height);
        preview.getContext('2d').drawImage(file.el, 0, 0);
        preview.classList.add('view'); preview.style.maxHeight = '62vh'; preview.style.maxWidth = '100%'; preview.style.borderRadius = '10px';
      }
    }
    const groups = [];
    if (scan && scan.entries.length) {
      const byGroup = new Map();
      for (const e of scan.entries) { if (!byGroup.has(e.group)) byGroup.set(e.group, []); byGroup.get(e.group).push(e); }
      for (const [g, list] of byGroup) groups.push(h('div.sec', h('h2', { text: g }), ...list.map(entryRow)));
    }
    body.replaceChildren(
      preview ? h('div.row', preview) : null,
      scan ? h('div.sec',
        h('h2', { text: scan.formatLabel + ' · ' + formatBytesCompact(scan.fileSize) }),
        scan.aiDetected
          ? h('div.note.warn', { text: `Terdeteksi penanda AI: ${(scan.detectedTools || []).join(', ') || 'tidak dikenal'}. Hapus metadata untuk membersihkannya.` })
          : h('div.note', { text: scan.totalEntries ? 'Tidak ada penanda AI — hanya metadata biasa (kamera, perangkat lunak, waktu).' : 'Bersih — tidak ada metadata tertanam.' }),
        aiNote ? h('div.note.ai', { text: 'AI visual: ' + aiNote }) : null,
        scan.aiSignals && scan.aiSignals.length ? h('div.faint.small', { text: scan.aiSignals.join(' · ') }) : null) : null,
      ...groups,
      cleaned ? h('div.sec',
        h('h2', { text: 'Hasil pembersihan' }),
        h('div.note', { text: `${cleaned.removedCount} entri dihapus · ${formatBytesCompact(cleaned.originalSize)} → ${formatBytesCompact(cleaned.cleanedSize)} · verifikasi ulang: ${cleaned.after.totalEntries} entri tersisa${cleaned.after.aiDetected ? ' (masih ada penanda AI)' : ', tanpa penanda AI'}.` })) : null
    );
    if (!file) ctx.stage.replaceChildren(emptyStage('shield-check', 'Pilih gambar atau video', 'Pindai EXIF, XMP, IPTC, C2PA & penanda AI (Google, OpenAI, Midjourney, dsb.), lalu hapus semuanya secara lossless — piksel & kualitas tidak berubah.',
      button('Pilih berkas…', { icon: 'folder-open', cls: 'primary', onClick: async () => { const s = await io.pick('media'); const p = s.images[0] || s.videos[0]; if (p) await load(p); } })));
    else if (body.parentNode !== ctx.stage) ctx.stage.replaceChildren(body);
    stripBtn.disabled = !file || busy || !scan || !scan.supported || !scan.removable;
    aiBtn.disabled = !file || busy;
    dlBtn.disabled = !cleaned || busy;
    rescanBtn.disabled = !cleaned || busy;
  }

  function build() {
    ctx.side.replaceChildren(
      section('Berkas', 'file-image',
        button(file ? 'Ganti berkas…' : 'Pilih berkas…', { icon: 'folder-open', cls: 'sm' + (file ? '' : ' primary'), onClick: async () => { const s = await io.pick('media'); const p = s.images[0] || s.videos[0]; if (p) await load(p); } }),
        file ? h('div.faint.small', { text: `${file.name} · ${formatBytesCompact(file.bytes.length)}${busy ? ' · memproses…' : ''}` }) : null),
      section('Pindai & bersihkan', 'shield-check',
        button('Hapus metadata', { icon: 'eraser', cls: 'sm primary block', onClick: strip }),
        button('Cek visual dengan AI', { icon: 'scan-eye', cls: 'sm block', onClick: aiCheck }),
        h('div.faint.small', { text: 'Pembersihan lossless: hanya tag/atom metadata yang dibuang (PNG/JPG/WebP/GIF/MP4/MOV/WebM). Cek AI butuh model vision terdaftar di admin.' })),
      cleaned ? section('Hasil', 'download',
        button('Unduh hasil bersih', { icon: 'download', cls: 'sm primary block', onClick: async () => {
          await io.save(file.name.replace(/\.[^.]+$/, '') + ' bersih', cleaned.cleanedBytes, cleaned.ext);
        } }),
        button('Pindai ulang hasil', { icon: 'refresh-cw', cls: 'sm block', onClick: async () => {
          scan = await scanMediaMetadata(cleaned.cleanedBytes, { fileName: file.name, mimeType: file.mime });
          cleaned = null; render(); build();
        } })) : null
    );
  }

  const stripBtn = button('Hapus metadata', { icon: 'eraser', cls: 'primary', onClick: strip });
  const aiBtn = button('Cek visual AI', { icon: 'scan-eye', cls: 'sm', onClick: aiCheck });
  const dlBtn = button('Unduh hasil bersih', { icon: 'download', cls: 'sm', onClick: async () => { if (cleaned) await io.save(file.name.replace(/\.[^.]+$/, '') + ' bersih', cleaned.cleanedBytes, cleaned.ext); } });
  const rescanBtn = button('Pindai ulang', { icon: 'refresh-cw', cls: 'sm', onClick: async () => { if (cleaned) { scan = await scanMediaMetadata(cleaned.cleanedBytes, { fileName: file.name, mimeType: file.mime }); cleaned = null; render(); build(); } } });
  ctx.bar.append(stripBtn, aiBtn, dlBtn, rescanBtn);
  ctx.onDrop((s) => { const p = s.images[0] || s.videos[0]; if (p) load(p); });
  void S;
  render(); build();
}
