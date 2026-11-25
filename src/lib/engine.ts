/**
 * Mock generation engine.
 *
 * Semua generate AI saat ini DISIMULASIKAN di sisi klien: baris dibuat di database
 * (kredit dipotong via RPC `create_generations`), lalu setelah beberapa detik
 * baris diperbarui menjadi `done` dengan output placeholder.
 *
 * Untuk menyambungkan API asli (Veo / Gemini / dll.), ganti `runMockJob` dengan
 * pemanggilan Supabase Edge Function yang memproses job dan mengisi `output_url`.
 * Komponen UI tidak perlu diubah — mereka hanya membaca kolom `status` & `output_url`.
 */
import { updateGeneration } from './api'
import type { Generation } from './types'

const LIBRARY: { keys: string[]; url: string }[] = [
  { keys: ['angkasa', 'luar angkasa', 'space', 'planet', 'galaksi', 'roket', 'astronot', 'bintang'], url: '/media/space.jpg' },
  { keys: ['kota', 'city', 'neon', 'jakarta', 'jalan', 'cyberpunk', 'malam', 'hujan'], url: '/media/city.jpg' },
  { keys: ['sawah', 'bali', 'rice', 'gunung', 'desa', 'drone', 'terasering', 'pagi'], url: '/media/ricefield.jpg' },
  { keys: ['laut', 'samudra', 'ocean', 'bawah air', 'underwater', 'ikan', 'penyelam', 'ubur', 'karang', 'paus'], url: '/media/underwater.jpg' },
  { keys: ['hutan', 'forest', 'golem', 'peri', 'dongeng', 'fantasi', 'bunga', 'dandelion'], url: '/media/golem.jpg' },
  { keys: ['wanita', 'pria', 'potret', 'portrait', 'wajah', 'orang', 'model', 'fashion', 'close-up'], url: '/media/portrait.jpg' },
]

export function pickMockImage(prompt: string, seed: string): string {
  const p = prompt.toLowerCase()
  const hit = LIBRARY.find((l) => l.keys.some((k) => p.includes(k)))
  if (hit) return hit.url
  const size = '1280/720'
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size}`
}

function mockOutput(gen: Generation): string {
  const first = gen.input_assets.find((a) => a.role === 'first_frame')
  if (gen.mode === 'frames_to_video' && first) return first.url
  const ingredient = gen.input_assets.find((a) => a.role === 'ingredient')
  if (gen.mode === 'ingredients_to_video' && ingredient && Math.random() > 0.5) return ingredient.url
  return pickMockImage(gen.prompt, gen.id)
}

const running = new Set<string>()

/** Simulasikan job; memanggil onUpdate ketika status berubah. */
export function runMockJob(gen: Generation, onUpdate: (g: Generation) => void, delayMs?: number) {
  if (running.has(gen.id) || gen.status === 'done' || gen.status === 'failed') return
  running.add(gen.id)
  const isVideo = gen.mode !== 'text_to_image'
  const delay = delayMs ?? (isVideo ? 5000 + Math.random() * 4000 : 2500 + Math.random() * 2000)

  window.setTimeout(async () => {
    try {
      const url = mockOutput(gen)
      const updated = await updateGeneration(gen.id, {
        status: 'done',
        output_url: url,
        thumbnail_url: url,
        completed_at: new Date().toISOString(),
        settings: { ...gen.settings, mock: true, duration: isVideo ? 8 : undefined },
      })
      onUpdate(updated)
    } catch (e) {
      console.error('mock job failed', e)
    } finally {
      running.delete(gen.id)
    }
  }, delay)
}

/** Lanjutkan job yang masih "processing" (mis. user me-refresh halaman). */
export function resumePending(gens: Generation[], onUpdate: (g: Generation) => void) {
  gens.filter((g) => g.status === 'processing' || g.status === 'queued').forEach((g) => runMockJob(g, onUpdate, 1500))
}

/** "Agen" sederhana: memperkaya prompt dengan detail sinematik. (Mock) */
export function enhancePrompt(prompt: string, kind: 'video' | 'image'): string {
  const base = prompt.trim().replace(/[.\s]+$/, '')
  if (!base) return prompt
  const video = ['gerakan kamera dolly perlahan', 'pencahayaan sinematik volumetrik', 'kedalaman bidang dangkal', 'color grading ungu-teal', 'resolusi 4K, 24fps']
  const image = ['komposisi rule of thirds', 'pencahayaan dramatis', 'detail tajam', 'warna kaya dan kontras', 'kualitas fotografi profesional']
  const extra = (kind === 'video' ? video : image).filter(() => Math.random() > 0.35).slice(0, 4)
  if (extra.length === 0) extra.push(kind === 'video' ? video[1] : image[1])
  return `${base}, ${extra.join(', ')}.`
}
