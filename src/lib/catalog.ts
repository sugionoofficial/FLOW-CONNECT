/* ───────────── Konten landing page & tools ───────────── */

export const SHOWCASE_MEDIA = [
  '/media/space.jpg',
  '/media/city.jpg',
  '/media/golem.jpg',
  '/media/underwater.jpg',
  '/media/ricefield.jpg',
  '/media/portrait.jpg',
]

export const LANDING_MODELS = [
  {
    name: 'Gemini Omni',
    image: '/media/portrait.jpg',
    desc: 'Buat dan edit video dari referensi apa pun — nyata maupun hasil AI. Lompatan besar dalam pemahaman dunia, multimodal, dan editing lewat percakapan.',
  },
  {
    name: 'Nano Banana',
    image: '/media/golem.jpg',
    desc: 'Generasi gambar yang kuat dengan kontrol edit presisi. Unggul dalam konsistensi subjek, render teks, dan penalaran visual.',
  },
  {
    name: 'Veo 3.1',
    image: '/media/space.jpg',
    desc: 'Kontrol kreatif yang luas, audio native, dan video berkualitas. Unggul dalam fisika, realisme, dan kepatuhan pada prompt.',
  },
]

const TOOL_BASE = 'https://flow.google.com/shared/tool/'

export const TOOLS = [
  { name: 'Teks Animasi', desc: 'Tambahkan teks bergerak ke videomu', author: 'Google', icon: 'Type', url: `${TOOL_BASE}075ead65-520a-4f5e-88bd-f150caa24dc4` },
  { name: 'Ubah Ukuran Video', desc: 'Ubah video ke rasio aspek apa pun', author: 'Google', icon: 'Scaling', url: `${TOOL_BASE}b78766c3-4cd7-4c1e-b597-769d4cfcf37a` },
  { name: 'Editor Gambar', desc: 'Transformasi objek, tambah teks, dan atur ukuran dengan layer', author: 'Google', icon: 'Layers', url: `${TOOL_BASE}1b12bbd4-51d7-4c76-8b62-24ac2473e07e` },
  { name: 'Studio Storyboard', desc: 'Tulis naskah, buat pemeran, dan visualisasikan storyboard', author: 'Google', icon: 'LayoutPanelTop', url: `${TOOL_BASE}79c9d2e6-4ad6-4636-ad05-22022f8a5a74` },
  { name: 'Efek Shader', desc: 'Terapkan filter visual yang bisa diatur ke video & gambar', author: 'Google', icon: 'Sparkles', url: `${TOOL_BASE}63ca3af5-0058-4c7f-b104-dfc417db2e22` },
  { name: 'Mockup', desc: 'Tempatkan gambarmu ke berbagai lingkungan', author: 'Google', icon: 'Frame', url: `${TOOL_BASE}611fa902-797c-457d-92de-71a3dc714894` },
  { name: 'Ribbit', desc: 'Mainkan video secara live mengikuti ketukan musik', author: 'Kat Zhang', icon: 'AudioWaveform', url: `${TOOL_BASE}46270263-54a1-46fb-a68c-dae111f650fb` },
  { name: 'Converge', desc: 'Ubah sketsa kasarmu jadi render jadi', author: 'Chris Maestas', icon: 'PenTool', url: `${TOOL_BASE}f260ed2b-2a14-4ece-a8d3-88b8cf6e660f` },
  { name: 'Character X-ray', desc: 'Kembangkan karakter beserta latar ceritanya', author: 'MetaPuppet', icon: 'UserRoundSearch', url: `${TOOL_BASE}32f2b8f8-a1a9-43ed-899f-c0fbff2e9599` },
  { name: 'pixelBento', desc: 'Efek pasca-produksi seperti lo-fi dan glitch', author: 'László Gaal', icon: 'Tv', url: `${TOOL_BASE}44b73cc0-ad82-49a6-b118-86c31ec49a71` },
  { name: 'Grid Architect', desc: 'Buat grid gambar dan ekstrak gambar satuan', author: 'Henry Daubrez', icon: 'Grid3x3', url: `${TOOL_BASE}52da09f1-1da1-4a40-96c6-41d36b3b2392` },
  { name: 'Scout360', desc: 'Tangkap lingkungan 360 derajat dari sebuah gambar', author: 'PJ Ace', icon: 'Orbit', url: `${TOOL_BASE}2102cb9f-a06e-4590-8a53-aa34bdcb0dff` },
] as const

export type Tool = (typeof TOOLS)[number]

export const FILMS = [
  { title: 'Sampai Jumpa Lagi', desc: 'Di hutan yang terlupakan, persahabatan golem batu dan bunga dandelion yang tumbuh setiap musim semi.', author: 'Rani Wijaya', role: 'Art Director', image: '/media/golem.jpg' },
  { title: 'Celah Kecil Waktu', desc: 'Film pendek personal tentang momen singkat antara tidur dan terjaga.', author: 'Bima Pratama', role: 'Sutradara', image: '/media/space.jpg' },
  { title: 'Neon Jakarta', desc: 'Satu malam hujan di kota masa depan, dan seseorang yang mencari jalan pulang.', author: 'Studio Lentera', role: 'Creative Studio', image: '/media/city.jpg' },
  { title: 'Samudra Cahaya', desc: 'Seorang penyelam menemukan kota bercahaya di dasar laut.', author: 'Laras Putri', role: 'Filmmaker', image: '/media/underwater.jpg' },
  { title: 'Pagi di Jatiluwih', desc: 'Meditasi tentang keluarga, tanah, dan siklus alam.', author: 'Made Surya', role: 'Seniman', image: '/media/ricefield.jpg' },
]

export const PROMPT_IDEAS = [
  'Drone shot sawah terasering Bali saat matahari terbit, kabut tipis, sinematik',
  'Paus raksasa terbang di atas Monas saat senja, gaya film fantasi',
  'Close-up wanita dengan cahaya neon ungu dan cyan, hujan di jendela',
  'Golem batu berlumut duduk di hutan berkabut menatap bunga dandelion',
  'Jalanan Jakarta futuristik malam hari, lampu neon memantul di aspal basah',
]
