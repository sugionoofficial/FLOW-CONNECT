// Studio → Alat & Skill: data bawaan + mesin templat skill (tanpa akses DOM / Node).
//
// Templat skill (sama untuk skill bawaan, "Skill saya", dan skill dari admin):
//   {Nama isian}                      → kotak teks
//   {Nama isian:Opsi A|Opsi B}        → pilihan (opsi pertama = bawaan)
//   {Nama isian:Label=teks prompt|…}  → pilihan dengan teks prompt berbeda dari labelnya ("Tanpa=" = kosong)
//   {@1} {@2}                         → tag @ foto referensi ke-1 / ke-2
//   [ … ]                             → bagian opsional: dibuang bila ada isian di dalamnya yang kosong

const TOOL_BASE = 'https://flow.google.com/shared/tool/';

/** 12 alat Google Flow (sama dengan src/lib/catalog.ts di situs). */
export const FLOW_TOOLS = [
  ['Teks Animasi', 'Tambahkan teks bergerak ke videomu', 'Google', 'type', '075ead65-520a-4f5e-88bd-f150caa24dc4'],
  ['Ubah Ukuran Video', 'Ubah video ke rasio aspek apa pun', 'Google', 'scaling', 'b78766c3-4cd7-4c1e-b597-769d4cfcf37a'],
  ['Editor Gambar', 'Transformasi objek, tambah teks, dan atur ukuran dengan layer', 'Google', 'layers', '1b12bbd4-51d7-4c76-8b62-24ac2473e07e'],
  ['Studio Storyboard', 'Tulis naskah, buat pemeran, dan visualisasikan storyboard', 'Google', 'layout-panel-top', '79c9d2e6-4ad6-4636-ad05-22022f8a5a74'],
  ['Efek Shader', 'Terapkan filter visual yang bisa diatur ke video & gambar', 'Google', 'sparkles', '63ca3af5-0058-4c7f-b104-dfc417db2e22'],
  ['Mockup', 'Tempatkan gambarmu ke berbagai lingkungan', 'Google', 'frame', '611fa902-797c-457d-92de-71a3dc714894'],
  ['Ribbit', 'Mainkan video secara live mengikuti ketukan musik', 'Kat Zhang', 'audio-waveform', '46270263-54a1-46fb-a68c-dae111f650fb'],
  ['Converge', 'Ubah sketsa kasarmu jadi render jadi', 'Chris Maestas', 'pen-tool', 'f260ed2b-2a14-4ece-a8d3-88b8cf6e660f'],
  ['Character X-ray', 'Kembangkan karakter beserta latar ceritanya', 'MetaPuppet', 'user-round-search', '32f2b8f8-a1a9-43ed-899f-c0fbff2e9599'],
  ['pixelBento', 'Efek pasca-produksi seperti lo-fi dan glitch', 'László Gaal', 'tv', '44b73cc0-ad82-49a6-b118-86c31ec49a71'],
  ['Grid Architect', 'Buat grid gambar dan ekstrak gambar satuan', 'Henry Daubrez', 'grid-3x3', '52da09f1-1da1-4a40-96c6-41d36b3b2392'],
  ['Scout360', 'Tangkap lingkungan 360 derajat dari sebuah gambar', 'PJ Ace', 'orbit', '2102cb9f-a06e-4590-8a53-aa34bdcb0dff']
].map(([name, desc, author, icon, id]) => ({ id, name, desc, author, icon, url: TOOL_BASE + id }));

/** Alat lokal (gratis, offline, diproses di PC ini). */
export const LOCAL_TOOLS = [
  { id: 'frame', name: 'Frame dari video', desc: 'Ambil gambar dari detik awal, akhir, atau detik tertentu — langsung jadi foto awal/akhir mode Frame.', icon: 'film' },
  { id: 'crop', name: 'Potong & ubah rasio', desc: 'Potong gambar ke 16:9, 9:16, 1:1, 4:3, atau 3:4.', icon: 'crop' },
  { id: 'grid', name: 'Pecah grid gambar', desc: 'Pisahkan gambar grid 2×2 atau 3×3 menjadi gambar satuan.', icon: 'grid-2x2' },
  { id: 'convert', name: 'Konversi & kompres', desc: 'Ubah ke PNG / JPG / WebP, atur kualitas dan ukuran.', icon: 'file-output' },
  { id: 'bg', name: 'Hapus latar polos', desc: 'Latar putih / hijau / polos → transparan (PNG).', icon: 'eraser' },
  { id: 'rename', name: 'Ganti nama massal', desc: 'Rapikan nama berkas hasil di folder Unduhan sekaligus.', icon: 'text-cursor-input' }
];

// ---------- Skill bawaan ----------
const IMG = (o) => ({ category: 'image', ...o, settings: { kind: 'image', ...o.settings } });
const VID = (o) => ({ category: 'video', ...o, settings: { kind: 'video', sub: 'ingredients', ratio: '16:9', ...o.settings } });

export const BUILTIN_SKILLS = [
  // ── Gambar (B1–B12) ──
  IMG({
    id: 'b-product', name: 'Foto Produk', icon: 'package', desc: 'Foto katalog / iklan produk yang bersih dan menjual.',
    settings: { ratio: '1:1', count: 2 }, refs: { min: 0, max: 3 },
    template: 'Professional commercial product photograph of {Produk}[, exactly matching the product in {@1}], placed on {Latar:Marmer putih=a clean white marble surface|Kayu hangat=a warm rustic wooden table|Latar polos=a seamless solid-color backdrop|Alam=a natural outdoor scene with soft bokeh|Gaya hidup=a lifestyle scene showing it in use}, {Cahaya:Softbox studio=soft diffused studio softbox lighting|Golden hour=warm golden hour sunlight|Dramatis=dramatic low-key lighting with rim light|Cerah=bright high-key lighting}, {Sudut:Depan=eye-level front view|45 derajat=three-quarter 45 degree angle|Flat lay=top-down flat lay|Makro=extreme close-up macro detail}[, {Detail tambahan}], sharp focus, realistic textures and reflections, high-end advertising look, no text, no watermark'
  }),
  IMG({
    id: 'b-portrait', name: 'Potret / foto profil', icon: 'user-round', desc: 'Headshot profesional, potret editorial, atau foto profil.',
    settings: { ratio: '3:4', count: 2 }, refs: { min: 0, max: 1 },
    template: '{Jenis:Foto profil profesional=Professional headshot|Potret editorial=Editorial portrait|Potret kasual=Candid lifestyle portrait|Formal=Formal studio portrait} of {Subjek}[, keeping the face and identity of {@1}][, wearing {Pakaian}], {Latar:Studio abu-abu=neutral grey studio backdrop|Kantor modern=blurred modern office background|Taman=outdoor park with creamy bokeh|Kafe=cozy cafe interior}, {Cahaya:Jendela lembut=soft window light|Rembrandt=Rembrandt lighting|Golden hour=golden hour backlight|Studio cerah=bright clean studio lighting}, {Ekspresi:Senyum ramah=friendly confident smile|Serius=serious confident expression|Tertawa=natural laughing expression}, 85mm lens f/1.8, shallow depth of field, natural skin texture, sharp eyes'
  }),
  IMG({
    id: 'b-poster', name: 'Poster / flyer', icon: 'megaphone', desc: 'Poster acara, flyer promo, poster film, pengumuman.',
    settings: { ratio: '3:4', count: 2 }, refs: { min: 0, max: 2 },
    template: 'Eye-catching {Jenis:Poster acara=event poster|Flyer promo=promotional flyer|Poster film=movie poster|Pengumuman=announcement poster} design about {Topik}[ featuring {@1}][, headline text "{Judul}"][, subheading "{Subjudul}"][, small details "{Info (tanggal, lokasi)}"], {Gaya:Modern minimal=modern minimalist layout with bold typography|Retro=retro vintage print style|Neon=vibrant neon cyberpunk style|Elegan=elegant luxury style with gold accents|Ceria=playful colorful illustration style}, strong visual hierarchy, clean readable typography, balanced composition, print-ready quality'
  }),
  IMG({
    id: 'b-logo', name: 'Logo / ikon', icon: 'shapes', desc: 'Logo merek, ikon aplikasi, maskot, monogram.',
    settings: { ratio: '1:1', count: 4 },
    template: '{Jenis:Logo=A professional logo|Ikon aplikasi=An app icon|Maskot=A mascot logo|Monogram=A monogram logo} for "{Nama merek}"[, a {Bidang usaha} brand], {Gaya:Flat minimal=flat minimalist vector style|Gradien modern=modern gradient style|Line art=clean line art style|3D mengilap=glossy 3D style|Badge vintage=vintage badge emblem style}[, colors: {Warna}], simple memorable shape, centered on a plain white background, crisp edges, scalable, no mockup'
  }),
  IMG({
    id: 'b-thumb', name: 'Thumbnail YouTube', icon: 'square-play', desc: 'Thumbnail 16:9 yang kontras dan mengundang klik.',
    settings: { ratio: '16:9', count: 2 }, refs: { min: 0, max: 2 },
    template: 'YouTube thumbnail for a video about {Topik}[, bold large text "{Teks besar}"][, featuring {@1}][ with {Subjek / ekspresi}], {Gaya:Kontras tinggi=high-contrast vibrant colors|Dramatis=dramatic cinematic lighting|Bersih=clean modern style|Kartun=bold cartoon style}, strong focal point, rule of thirds, highly clickable, readable at small size, sharp details'
  }),
  IMG({
    id: 'b-social', name: 'Konten medsos (feed / story)', icon: 'smartphone', desc: 'Postingan feed, cover story/Reels, slide carousel.',
    settings: { ratio: '1:1', count: 2 }, refs: { min: 0, max: 2 },
    template: 'Social media {Format:Postingan feed=feed post|Cover story / Reels=vertical story cover|Slide carousel=carousel slide} for {Merek / akun} about {Isi pesan}[ featuring {@1}][, include the text "{Teks}"], {Gaya:Estetik pastel=aesthetic pastel palette|Bold & cerah=bold bright colors|Minimal=minimal clean layout|Foto lifestyle=authentic lifestyle photography}, trendy Instagram look, scroll-stopping composition, consistent brand style'
  }),
  IMG({
    id: 'b-infographic', name: 'Infografis', icon: 'chart-pie', desc: 'Data dan langkah jadi visual yang mudah dipahami.',
    settings: { ratio: '3:4', count: 2 },
    template: 'Clean infographic about {Topik}[ showing: {Poin-poin data}], {Gaya:Flat vektor=flat vector illustrations and icons|Isometrik=isometric 3D illustrations|Korporat=corporate minimal style|Ceria=playful colorful style}, clear sections with headings, icons and simple charts, readable labels[, color palette {Warna}], white background, well-organized layout'
  }),
  IMG({
    id: 'b-ui', name: 'UI / mockup', icon: 'layout-template', desc: 'Tampilan aplikasi, dasbor, landing page, mockup perangkat.',
    settings: { ratio: '16:9', count: 2 }, refs: { min: 0, max: 1 },
    template: 'High-fidelity {Jenis:Aplikasi mobile=mobile app UI screens|Dasbor web=web dashboard UI|Landing page=website landing page|Mockup perangkat=device mockup on a desk} for {Produk / aplikasi}[, featuring {Fitur utama}][, showing {@1} on screen], {Gaya:Modern bersih=modern clean design|Mode gelap=dark mode design|Glassmorphism=glassmorphism design|Neubrutalism=neubrutalism design}, consistent spacing, realistic UI components, Dribbble-quality presentation'
  }),
  IMG({
    id: 'b-landscape', name: 'Pemandangan', icon: 'mountain-snow', desc: 'Lanskap alam / kota yang memukau.',
    settings: { ratio: '16:9', count: 2 },
    template: 'Breathtaking landscape of {Tempat}, {Waktu:Matahari terbit=at sunrise|Golden hour=during golden hour|Senja=at dusk with a colorful sky|Malam berbintang=at night under a starry sky|Berkabut=on a misty morning}, {Cuaca:Cerah=clear weather|Awan dramatis=dramatic clouds|Hujan=light rain|Salju=gentle snowfall}, {Gaya:Foto realistis=ultra-realistic landscape photography, wide-angle lens|Cat minyak=oil painting|Fantasi=epic fantasy concept art|Ghibli=Studio Ghibli inspired painting}[, {Detail tambahan}], rich colors, depth and atmosphere, high detail'
  }),
  IMG({
    id: 'b-illustration', name: 'Ilustrasi', icon: 'palette', desc: 'Kartun, anime, 3D, cat air, flat vektor, pixel art.',
    settings: { ratio: '1:1', count: 2 }, refs: { min: 0, max: 2 },
    template: '{Gaya:Kartun=cute cartoon illustration|Anime=anime illustration, cel shading|3D Pixar=3D animated render, Pixar-like style|Cat air=soft watercolor painting|Flat vektor=flat vector illustration|Pixel art=detailed pixel art} of {Subjek}[ in the style of {@1}][, {Latar}], {Suasana:Ceria=cheerful and bright|Hangat=warm and cozy|Misterius=mysterious|Epik=epic and dramatic} mood, clean composition, vibrant harmonious colors, high detail'
  }),
  IMG({
    id: 'b-edit', name: 'Edit foto dengan referensi', icon: 'image-up', desc: 'Ubah bagian tertentu dari foto (@foto), sisanya tetap.',
    settings: { ratio: '1:1', count: 2 }, refs: { min: 1, max: 3 },
    template: 'Edit the photo {@1}: {Perubahan yang diinginkan}[, using {@2} as reference]. Keep everything else unchanged — same subject, pose, framing and lighting[, {Gaya hasil:Tanpa=|Lebih sinematik=with a more cinematic color grade|Lebih cerah=brighter and more vibrant|Hitam putih=in black and white}]. Photorealistic, seamless result'
  }),
  IMG({
    id: 'b-charsheet', name: 'Lembar karakter', icon: 'id-card', desc: 'Tampak depan, samping, belakang — untuk karakter konsisten.',
    settings: { ratio: '16:9', count: 1 }, refs: { min: 0, max: 1 },
    template: 'Character reference sheet of {Karakter}[, based on {@1}], showing front view, side view and back view side by side, full body, neutral standing pose, consistent design across all views, {Gaya:Anime=anime style|Kartun 3D=3D cartoon style|Realistis=realistic style|Komik=comic book style}, plain light grey background, clean lines, character turnaround design sheet'
  }),

  // ── Video (B13–B21) ──
  VID({
    id: 'b-ad', name: 'Iklan produk', icon: 'shopping-bag', desc: 'Video iklan pendek dengan gerak kamera komersial.',
    refs: { min: 0, max: 3 },
    template: 'Commercial video ad for {Produk}[ featuring {@1}]. {Adegan:Hero shot berputar=Slow cinematic orbit around the product on a pedestal|Dipakai orang=A person happily using the product in daily life|Bahan berjatuhan=Ingredients and splashes falling around the product in slow motion|Unboxing=Hands unboxing the product with a satisfying reveal}, {Suasana:Mewah=luxurious premium mood|Segar=fresh energetic mood|Hangat=warm family mood|Futuristik=sleek futuristic mood}, smooth camera movement, studio-quality lighting[, ends with the tagline "{Tagline}"], crisp details, commercial grade'
  }),
  VID({
    id: 'b-cinematic', name: 'Sinematik / trailer', icon: 'clapperboard', desc: 'Adegan ala film dengan kamera dan warna sinematik.',
    refs: { min: 0, max: 3 },
    template: 'Cinematic {Genre:Aksi=action|Drama=drama|Fiksi ilmiah=sci-fi|Horor=horror|Fantasi=fantasy|Petualangan=adventure} trailer shot: {Adegan}[ with {@1}]. {Kamera:Dolly in=slow dolly-in|Drone=sweeping aerial drone shot|Handheld=intense handheld tracking shot|Crane=rising crane shot|Orbit=slow orbit around the subject}, {Warna:Teal & orange=teal and orange color grade|Muram=moody desaturated grade|Hangat=warm golden grade|Neon=neon-lit night palette}, anamorphic lens flares, shallow depth of field, film grain, epic atmosphere[, sound: {Suara}]'
  }),
  VID({
    id: 'b-documentary', name: 'Dokumenter', icon: 'camera', desc: 'Rekaman realistis bergaya dokumenter.',
    refs: { min: 0, max: 2 },
    template: 'Documentary-style footage of {Subjek}[ in {Lokasi}], {Gaya:Observasional=observational handheld camera, natural light|Wawancara=interview framing with a soft key light|Alam liar=wildlife cinematography with a telephoto lens|Sejarah=archival-inspired look with slow pans}, authentic and realistic, natural colors, calm narration-friendly pacing[, ambient sound of {Suara latar}]'
  }),
  VID({
    id: 'b-vertical', name: 'Vertikal 9:16 (Reels / TikTok / Shorts)', icon: 'smartphone', desc: 'Video tegak dengan hook di detik pertama.',
    settings: { ratio: '9:16' }, refs: { min: 0, max: 3 },
    template: 'Vertical 9:16 {Platform:Reels=Instagram Reels|TikTok=TikTok|Shorts=YouTube Shorts} video: {Isi video}[ featuring {@1}]. Strong hook in the first second, {Gaya:Dinamis=fast dynamic movement|Estetik=aesthetic smooth slow motion|POV=first-person POV|Tutorial=clear step-by-step demonstration}, subject centered for mobile framing, bright punchy colors, trendy social media look[, on-screen text "{Teks di layar}"]'
  }),
  VID({
    id: 'b-cartoon', name: 'Animasi kartun', icon: 'drama', desc: 'Animasi 3D, anime, kartun 2D, claymation.',
    refs: { min: 0, max: 3 },
    template: '{Gaya:3D Pixar=3D animated Pixar-style|Anime=2D anime style|Kartun 2D=classic 2D cartoon style|Claymation=stop-motion claymation style|Cat air=watercolor animated style} animation: {Cerita singkat}[, characters: {Karakter}][, character design from {@1}]. Expressive character animation, smooth motion, vibrant colors, {Suasana:Lucu=funny and playful|Hangat=heartwarming|Petualangan=adventurous|Ajaib=magical} mood'
  }),
  VID({
    id: 'b-animate', name: 'Hidupkan foto', icon: 'wand-sparkles', desc: 'Satu foto (Bahan) jadi video bergerak.',
    refs: { min: 1, max: 1 },
    template: 'Bring {@1} to life: {Gerakan:Gerak halus alami=subtle natural motion, gentle breathing and blinking|Tertiup angin=hair and clothes gently moving in the wind|Kamera mendekat=slow cinematic push-in camera|Parallax 3D=3D parallax camera movement|Tersenyum & melambai=the person smiles and waves}[, {Detail gerakan}]. Keep the original composition, identity and style of the photo, realistic, stable and smooth motion'
  }),
  VID({
    id: 'b-transition', name: 'Transisi awal → akhir', icon: 'arrow-right-left', desc: 'Mode Frame: 2 foto (awal & akhir) jadi transisi mulus.',
    settings: { sub: 'frames' }, refs: { min: 2, max: 2 },
    template: 'Smooth {Transisi:Morph mulus=seamless morphing transformation|Gerak kamera=continuous camera move|Waktu berlalu=time-lapse progression|Ajaib=magical particle transformation} from the first frame to the last frame[, {Apa yang terjadi}]. Consistent lighting, natural motion, cinematic quality'
  }),
  VID({
    id: 'b-story', name: 'Cerita multi-adegan', icon: 'list-video', desc: 'AI memecah cerita jadi 3–6 adegan → antrean Otomatis.', ai: 'scenes',
    refs: { min: 0, max: 3 },
    template: 'Pecah cerita berikut menjadi {Jumlah adegan:4|3|5|6} adegan video Google Flow yang berurutan dan konsisten (karakter, pakaian, latar, dan gaya {Gaya:Sinematik realistis=sinematik realistis|Animasi 3D=animasi 3D ala Pixar|Anime=anime|Dokumenter=dokumenter}). Tulis SETIAP adegan sebagai satu blok ```prompt``` terpisah berbahasa Inggris (8–10 detik per adegan, sebutkan subjek, aksi, kamera, cahaya), tanpa penjelasan panjang.\n\nCerita: {Cerita}'
  }),
  VID({
    id: 'b-music', name: 'Klip musik / visualizer', icon: 'music', desc: 'Visual yang mengikuti irama lagu.',
    refs: { min: 0, max: 2 },
    template: '{Jenis:Klip musik=Music video scene|Visualizer=Abstract audio visualizer|Video lirik=Lyric video background|Konser=Live concert shot} for a {Genre:Pop=pop|Rock=rock|EDM=EDM|Lo-fi=lo-fi chill|Dangdut=dangdut|Jazz=jazz} song[ about {Tema}][ featuring {@1}], {Visual:Neon berdenyut=neon lights pulsing to the beat|Partikel=flowing particles and waveforms reacting to the music|Penari=a dancer moving in rhythm|Panggung=stage lights and crowd silhouettes}, rhythmic camera movement synced to the beat, vibrant color palette, loopable'
  }),

  // ── AI (B22–B24) — memakai model chat dari admin ──
  {
    id: 'b-director', category: 'ai', ai: 'director', name: 'Creative Director', icon: 'lightbulb', desc: 'Brief → konsep kreatif + 3 variasi prompt (di Asisten Prompt).',
    settings: {}, refs: { min: 0, max: 0 }, modeField: 'Jenis',
    template: 'Bertindaklah sebagai Creative Director. Jenis: {Jenis:Video=video|Gambar=gambar}. Tujuan: {Tujuan:Iklan=iklan|Konten medsos=konten media sosial|Film pendek=film pendek|Branding=branding}.[ Target penonton: {Target penonton}.] Brief: {Brief}\n\nSusun konsep kreatif singkat (big idea, gaya visual, palet warna, mood, gerak kamera), lalu tulis 3 variasi prompt Google Flow yang siap pakai, masing-masing dalam blok ```prompt``` terpisah.'
  },
  {
    id: 'b-reverse', category: 'ai', ai: 'reverse', name: 'Rekayasa balik prompt', icon: 'scan-eye', desc: 'Gambar → prompt yang mirip (butuh model chat yang bisa melihat gambar).',
    settings: {}, refs: { min: 1, max: 1 }, modeField: 'Jenis',
    template: 'Lihat gambar terlampir, lalu tulis prompt {Jenis:Gambar=gambar|Video=video} Google Flow yang paling mungkin menghasilkan gambar ini: subjek, komposisi, gaya, pencahayaan, palet warna, lensa/kamera, dan suasana.[ Fokus khusus: {Fokus}.] Balas dengan satu blok ```prompt``` berbahasa Inggris.'
  },
  {
    id: 'b-fix', category: 'ai', ai: 'fix', name: 'Perbaiki prompt', icon: 'spell-check', desc: 'Prompt seadanya → prompt detail dan jelas.',
    settings: {}, refs: { min: 0, max: 0 }, modeField: 'Jenis',
    template: 'Perbaiki dan sempurnakan prompt Google Flow ({Jenis:Video=video|Gambar=gambar}) berikut agar lebih detail dan jelas (subjek, aksi, latar, gaya, kamera, cahaya). Pertahankan maksudnya dan semua tag @ yang ada. Balas dengan satu blok ```prompt```.\n\nPrompt: {Prompt}'
  }
];

// ---------- Mesin templat ----------
const TOKEN_RE = /\[([^[\]]*)\]|\{(@\d|[^{}]+)\}/g;
const PH_RE = /\{(@\d|[^{}]+)\}/g;
const LONG_RE = /cerita|naskah|deskripsi|detail|prompt|brief|poin|perubahan|isi video|isi pesan/i;

function splitPh(inner) {
  const i = inner.indexOf(':');
  return i < 0 ? [inner.trim(), null] : [inner.slice(0, i).trim(), inner.slice(i + 1)];
}
function parseOptions(raw) {
  return raw.split('|').map((o) => {
    const i = o.indexOf('=');
    return i >= 0 ? { label: o.slice(0, i).trim(), value: o.slice(i + 1).trim() } : { label: o.trim(), value: o.trim() };
  }).filter((o) => o.label);
}

/** Kolom isian dari templat: [{label, options|null, long}] (urutan kemunculan, tanpa duplikat). */
export function parseFields(tpl) {
  const out = [];
  const seen = new Set();
  for (const m of String(tpl || '').matchAll(PH_RE)) {
    if (m[1][0] === '@') continue;
    const [label, raw] = splitPh(m[1]);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const options = raw != null ? parseOptions(raw) : null;
    out.push({ label: label.slice(0, 40), options: options && options.length ? options : null, long: !options && LONG_RE.test(label) });
  }
  return out;
}

/** Jumlah foto yang dirujuk templat ({@1}, {@2}, …). */
export function refsUsed(tpl) {
  let n = 0;
  for (const m of String(tpl || '').matchAll(/\{@(\d)\}/g)) n = Math.max(n, Number(m[1]));
  return n;
}

function tidy(s) {
  return s.split('\n').map((l) => l
    .replace(/[ \t]+/g, ' ')
    .replace(/""|“”|\(\s*\)/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;])(\s*[,;])+/g, '$1')
    .replace(/,(\s*\.)/g, '$1')
    .replace(/^[\s,;]+|[\s,;]+$/g, ''))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim()
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

/** Jenis hasil skill AI dari isian modeField ("Gambar" → image, selain itu video). */
export function aiMode(skill, values = {}) {
  if (!skill.modeField) return skill.settings && skill.settings.kind === 'image' ? 'image' : 'video';
  const f = parseFields(skill.template).find((x) => x.label === skill.modeField);
  const v = values[skill.modeField] || (f && f.options ? f.options[0].label : '');
  return /gambar|image/i.test(v) ? 'image' : 'video';
}

/**
 * Susun prompt dari templat.
 * @param {string} tpl
 * @param {Record<string,string>} values  label → isi (untuk pilihan: label opsi)
 * @param {string[]} tags  tag @ foto referensi (urut)
 */
export function compose(tpl, values = {}, tags = []) {
  const fill = (inner, track) => {
    let v;
    if (inner[0] === '@') { const t = tags[Number(inner.slice(1)) - 1]; v = t ? '@' + t : ''; }
    else {
      const [label, raw] = splitPh(inner);
      const opts = raw != null ? parseOptions(raw) : null;
      const cur = values[label];
      if (opts && opts.length) {
        const o = opts.find((x) => x.label === cur) || (cur == null || cur === '' ? opts[0] : null);
        v = o ? o.value : String(cur);
      } else v = cur == null ? '' : String(cur).replace(/\s+/g, ' ');
    }
    v = String(v).trim();
    if (!v && track) track.empty = true;
    return v;
  };
  const out = String(tpl || '').replace(TOKEN_RE, (m, seg, ph) => {
    if (ph != null) return fill(ph, null);
    const track = { empty: false };
    const r = seg.replace(PH_RE, (_, inner) => fill(inner, track));
    return track.empty ? '' : r;
  });
  return tidy(out);
}

/** Isian wajib yang masih kosong (kotak teks di luar bagian opsional [ … ]). */
export function missingFields(tpl, values = {}) {
  const outside = String(tpl || '').replace(/\[[^[\]]*\]/g, '');
  const miss = [];
  for (const m of outside.matchAll(PH_RE)) {
    if (m[1][0] === '@') continue;
    const [label, raw] = splitPh(m[1]);
    if (raw == null && !String(values[label] || '').trim() && !miss.includes(label)) miss.push(label);
  }
  return miss;
}

/** Ikon yang boleh dipakai skill (admin / Skill saya). */
export const SKILL_ICONS = ['sparkles', 'wand-sparkles', 'package', 'user-round', 'megaphone', 'shapes', 'square-play', 'smartphone', 'chart-pie',
  'layout-template', 'mountain-snow', 'palette', 'image-up', 'id-card', 'shopping-bag', 'clapperboard', 'camera', 'drama', 'arrow-right-left',
  'list-video', 'music', 'lightbulb', 'film', 'image', 'video', 'star', 'paintbrush', 'book-open', 'gem', 'zap', 'layers'];
