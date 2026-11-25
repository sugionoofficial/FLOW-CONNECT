import type { AspectRatio, GenerationMode } from './types'

/* ───────────── Models & modes (mirip alur Google Flow) ───────────── */

export interface ModelDef {
  id: string
  name: string
  tagline: string
  cost: number
  kind: 'video' | 'image'
  badge?: string
}

export const MODELS: Record<string, ModelDef> = {
  'motion-3-fast': { id: 'motion-3-fast', name: 'Aurora Motion 3 · Fast', tagline: 'Cepat & hemat, cocok untuk eksplorasi', cost: 10, kind: 'video' },
  'motion-3-quality': { id: 'motion-3-quality', name: 'Aurora Motion 3 · Quality', tagline: 'Kualitas sinematik tertinggi + audio', cost: 40, kind: 'video', badge: 'PRO' },
  'omni-1': { id: 'omni-1', name: 'Aurora Omni', tagline: 'Gabungkan referensi gambar jadi satu video', cost: 20, kind: 'video', badge: 'BARU' },
  'aurora-image': { id: 'aurora-image', name: 'Aurora Image', tagline: 'Gambar cepat dengan konsistensi subjek', cost: 2, kind: 'image' },
  'aurora-image-pro': { id: 'aurora-image-pro', name: 'Aurora Image Pro', tagline: 'Detail & teks presisi tinggi', cost: 5, kind: 'image', badge: 'PRO' },
}

export interface ModeDef {
  id: GenerationMode
  label: string
  short: string
  description: string
  models: string[]
  needs?: { firstFrame?: boolean; lastFrame?: boolean; ingredients?: number }
}

export const MODES: ModeDef[] = [
  {
    id: 'text_to_video',
    label: 'Teks ke Video',
    short: 'Teks→Video',
    description: 'Tulis deskripsi adegan, AI membuat klip videonya.',
    models: ['motion-3-fast', 'motion-3-quality'],
  },
  {
    id: 'frames_to_video',
    label: 'Frame ke Video',
    short: 'Frame→Video',
    description: 'Unggah frame awal (dan opsional frame akhir), AI menganimasikan di antaranya.',
    models: ['motion-3-fast', 'motion-3-quality'],
    needs: { firstFrame: true, lastFrame: true },
  },
  {
    id: 'ingredients_to_video',
    label: 'Bahan ke Video',
    short: 'Bahan→Video',
    description: 'Gabungkan hingga 3 gambar referensi (karakter, objek, gaya) dalam satu video.',
    models: ['omni-1'],
    needs: { ingredients: 3 },
  },
  {
    id: 'text_to_image',
    label: 'Buat Gambar',
    short: 'Gambar',
    description: 'Hasilkan gambar berkualitas tinggi dari teks.',
    models: ['aurora-image', 'aurora-image-pro'],
  },
]

export const modeById = (id: GenerationMode) => MODES.find((m) => m.id === id)!

export const ASPECT_RATIOS: { id: AspectRatio; label: string }[] = [
  { id: '16:9', label: 'Lanskap 16:9' },
  { id: '9:16', label: 'Potret 9:16' },
  { id: '1:1', label: 'Persegi 1:1' },
]

/* ───────────── Konten landing page ───────────── */

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
    name: 'Aurora Omni',
    image: '/media/portrait.jpg',
    desc: 'Buat dan edit video dari referensi apa pun — nyata maupun hasil AI. Lompatan besar dalam pemahaman dunia, multimodal, dan editing lewat percakapan.',
  },
  {
    name: 'Aurora Image',
    image: '/media/golem.jpg',
    desc: 'Generasi gambar yang kuat dengan kontrol edit presisi. Unggul dalam konsistensi subjek, render teks, dan penalaran visual.',
  },
  {
    name: 'Aurora Motion 3',
    image: '/media/space.jpg',
    desc: 'Kontrol kreatif yang luas, audio native, dan video berkualitas. Unggul dalam fisika, realisme, dan kepatuhan pada prompt.',
  },
]

export const TOOLS = [
  { name: 'Teks Animasi', desc: 'Tambahkan teks bergerak ke videomu', author: 'FLOW CONNECT', icon: 'Type' },
  { name: 'Ubah Ukuran Video', desc: 'Ubah video ke rasio aspek apa pun', author: 'FLOW CONNECT', icon: 'Scaling' },
  { name: 'Editor Gambar', desc: 'Transformasi objek, tambah teks, dan atur ukuran dengan layer', author: 'FLOW CONNECT', icon: 'Layers' },
  { name: 'Studio Storyboard', desc: 'Tulis naskah, buat pemeran, dan visualisasikan storyboard', author: 'FLOW CONNECT', icon: 'LayoutPanelTop' },
  { name: 'Efek Shader', desc: 'Terapkan filter visual yang bisa diatur ke video & gambar', author: 'FLOW CONNECT', icon: 'Sparkles' },
  { name: 'Mockup', desc: 'Tempatkan gambarmu ke berbagai lingkungan', author: 'FLOW CONNECT', icon: 'Frame' },
  { name: 'Beat Sync', desc: 'Mainkan video secara live mengikuti ketukan musik', author: 'Komunitas', icon: 'AudioWaveform' },
  { name: 'Sketsa ke Render', desc: 'Ubah sketsa kasarmu jadi render jadi', author: 'Komunitas', icon: 'PenTool' },
  { name: 'Profil Karakter', desc: 'Kembangkan karakter beserta latar ceritanya', author: 'Komunitas', icon: 'UserRoundSearch' },
  { name: 'Efek Retro', desc: 'Efek pasca-produksi seperti lo-fi dan glitch', author: 'Komunitas', icon: 'Tv' },
  { name: 'Arsitek Grid', desc: 'Buat grid gambar dan ekstrak gambar satuan', author: 'Komunitas', icon: 'Grid3x3' },
  { name: 'Scout 360', desc: 'Tangkap lingkungan 360 derajat dari sebuah gambar', author: 'Komunitas', icon: 'Orbit' },
] as const

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
