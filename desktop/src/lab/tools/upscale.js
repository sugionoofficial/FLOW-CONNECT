// Upscale — perbesar gambar 2x/3x/4x dengan penajaman (unsharp mask), denoise, dan kontras lembut.
// Offline di PC ini (canvas). Opsional: AI menulis prompt detail untuk membuat ulang
// gambar yang sama lewat Nano Banana di Studio (seperti Converge).
import {
  h, button, section, chipField, slider, toast, errText, ai, io, persisted, canvas, toBlob,
  dataUrlFor, emptyStage, call, stamp
} from '../core.js';
import { denoise, unsharpMask, enhance, upscaleSize } from '../upscale-core.js';

export async function mount(ctx) {
  const S = persisted('upscale', { scale: 2, sharpen: 80, denoise: 30, format: 'png', view: 'result', prompt: '' });
  let img = null, path = null, result = null, busy = false;
  ctx.stage.classList.add('scroll');
  const body = h('div.sheet');
  const info = h('span.faint.small.mono', { text: '' });

  async function load(p) {
    const im = await io.image(p);
    img = im.bmp; path = p; result = null; S.view = 'result'; S.$save();
    await process();
    build();
  }

  async function process() {
    if (!img || busy) return;
    busy = true; render();
    try {
      const { w: W, h: H } = upscaleSize(img.width, img.height, S.scale);
      const c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, W, H);
      const im = g.getImageData(0, 0, W, H);
      denoise(im.data, W, H, S.denoise / 100);
      unsharpMask(im.data, W, H, S.sharpen / 100, 2);
      enhance(im.data, 0.1, 0.08);
      g.putImageData(im, 0, 0);
      result = c;
    } catch (e) { toast(errText(e), 'err'); }
    busy = false; render();
  }
  let deb = 0;
  const processSoon = () => { clearTimeout(deb); deb = setTimeout(process, 350); };

  function render() {
    const show = S.view === 'orig' || !result ? img : result;
    let vc = null;
    if (show) {
      vc = canvas(show.width || show.videoWidth, show.height || show.videoHeight);
      vc.getContext('2d').drawImage(show, 0, 0);
      vc.classList.add('view'); vc.style.maxHeight = '62vh'; vc.style.maxWidth = '100%'; vc.style.borderRadius = '10px';
    }
    const promptBox = S.prompt ? h('div.chat', h('div.row', h('b.small', { text: 'Prompt detail (AI)' }), h('span.grow'),
      button('Salin', { icon: 'clipboard-copy', cls: 'sm subtle', onClick: () => { navigator.clipboard.writeText(S.prompt).then(() => toast('Disalin.', 'ok'), () => toast('Gagal menyalin.', 'err')); } }),
      button('Ke Studio', { icon: 'send', cls: 'sm', onClick: async () => { await call('lab:toStudio', { prompt: S.prompt, images: path ? [path] : [], kind: 'image' }); toast('Prompt + gambar dipasang di Studio.', 'ok'); } })),
      h('div.prompt-box', { text: S.prompt })) : null;
    body.replaceChildren(
      vc ? h('div.row', vc) : null,
      img ? h('div.note', { text: busy ? 'Memproses…' : `${img.width}×${img.height} → ${result ? `${result.width}×${result.height}` : '…'} · ${S.view === 'orig' ? 'menampilkan asli' : 'menampilkan hasil upscale'}` }) : null,
      promptBox
    );
    if (!img) ctx.stage.replaceChildren(emptyStage('zoom-in', 'Pilih gambar untuk di-upscale', 'Perbesar 2x–4x dengan penajaman & denoise — cocok untuk hasil generate Flow yang masih kecil.',
      button('Pilih gambar…', { icon: 'folder-open', cls: 'primary', onClick: async () => { const p = (await io.pick('image')).images[0]; if (p) await load(p); } })));
    else if (body.parentNode !== ctx.stage) ctx.stage.replaceChildren(body);
    info.textContent = img ? `${img.width}×${img.height}${result ? ` → ${result.width}×${result.height}` : ''}` : '';
    saveBtn.disabled = !result || busy;
    viewBtn.disabled = !result;
    viewBtn.setText(S.view === 'orig' ? 'Lihat hasil' : 'Lihat asli');
  }

  async function aiPrompt() {
    if (!img) { toast('Pilih gambar dulu.', 'err'); return; }
    const r = await ai('Kamu ahli retouch foto. Lihat gambar ini dan tulis prompt Google Flow (Nano Banana) untuk membuat ulang gambar yang sama dengan detail jauh lebih tinggi: sebutkan subjek, tekstur, pencahayaan, lensa, dan kualitas. Jawab HANYA dengan satu blok ```prompt ... ``` berbahasa Inggris.', { image: dataUrlFor(img, 900, 0.88) });
    const m = /```(?:prompt)?\s*([\s\S]*?)```/i.exec(String(r || ''));
    S.prompt = (m ? m[1] : String(r || '')).trim().slice(0, 4000);
    S.$save(); render();
    if (!S.prompt) toast('AI tidak mengembalikan prompt.', 'err');
  }

  function build() {
    ctx.side.replaceChildren(
      section('Gambar', 'image',
        button(img ? 'Ganti gambar…' : 'Pilih gambar…', { icon: 'folder-open', cls: 'sm' + (img ? '' : ' primary'), onClick: async () => { const p = (await io.pick('image')).images[0]; if (p) await load(p); } }),
        img ? h('div.faint.small', { text: `${img.width}×${img.height}px · maks hasil 8192px / 48 MP` }) : null),
      section('Upscale', 'zoom-in',
        chipField('Skala', [[2, '2×'], [3, '3×'], [4, '4×']], S.scale, (v) => { S.scale = Number(v); S.$save(); processSoon(); }),
        slider('Penajaman', { min: 0, max: 200, value: S.sharpen, fmt: (v) => v + '%' }, (v) => { S.sharpen = v; S.$save(); processSoon(); }),
        slider('Denoise', { min: 0, max: 100, value: S.denoise, fmt: (v) => v + '%' }, (v) => { S.denoise = v; S.$save(); processSoon(); }),
        h('div.faint.small', { text: 'Penajaman menonjolkan tepi; denoise merapikan noise sebelum ditajamkan.' })),
      section('Ekspor', 'download',
        chipField('Format', [['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP']], S.format, (v) => { S.format = v; S.$save(); })),
      section('AI — buat ulang di Studio', 'wand-sparkles',
        button('AI: tulis prompt detail', { icon: 'wand-sparkles', cls: 'sm ai block', disabled: !img, onClick: aiPrompt }),
        h('div.faint.small', { text: 'Prompt dipakai Nano Banana di Studio dengan gambar ini sebagai referensi — hasil buat ulang biasanya lebih detail dari upscale piksel.' }))
    );
  }

  const viewBtn = button('Lihat asli', { icon: 'eye', cls: 'sm', onClick: () => { S.view = S.view === 'orig' ? 'result' : 'orig'; S.$save(); render(); } });
  const saveBtn = button('Simpan hasil upscale', {
    icon: 'download', cls: 'primary', onClick: async () => {
      if (!result) return;
      await io.save(`${path ? path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '') : 'gambar'} upscale ${S.scale}x ${stamp()}`, await toBlob(result, S.format), S.format);
    }
  });
  ctx.bar.append(info, h('div.grow'), viewBtn, saveBtn);
  ctx.onDrop((s) => { if (s.images[0]) load(s.images[0]); });
  render(); build();
}
