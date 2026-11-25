# FLOW CONNECT

Studio kreatif AI untuk video, gambar, dan tools kustom — terinspirasi alur [Google Flow](https://flow.google.com/) dengan tampilan baru **Aurora Neon**.

## Stack
- **Frontend:** Vite + React 19 + TypeScript + Tailwind CSS v4 + React Router
- **Backend:** Supabase (Auth, Postgres + RLS, Storage) — project `FLOW-CONNECT` (`rwoizblpvfcarhgggclv`, ap-southeast-1)

## Menjalankan
```bash
npm install
cp .env.example .env   # sudah berisi URL & publishable key Supabase
npm run dev            # http://localhost:5173
```

## Alur aplikasi
| Halaman | Rute | Isi |
|---|---|---|
| Landing | `/` | Hero + prompt, Model, Alur (Rencanakan/Buat/Sempurnakan), Tools, Karya kreator, FAQ |
| Masuk/Daftar | `/masuk` | Email + kata sandi (Supabase Auth), user baru dapat 100 kredit |
| Dashboard | `/app` | Daftar project, buat / ganti nama / hapus, cari |
| Workspace | `/app/project/:id` | Galeri hasil + composer prompt + Scenebuilder |
| Tools | `/app/tools` | Galeri tools (placeholder) |

### Workspace
- **Mode generate:** Teks→Video, Frame→Video (frame awal/akhir), Bahan→Video (≤3 referensi), Buat Gambar
- **Pengaturan:** model, rasio aspek (16:9, 9:16, 1:1), jumlah output 1–4, biaya kredit tampil langsung
- **Agen “Sempurnakan”:** memperkaya prompt (mock)
- **Detail hasil:** putar, pakai ulang prompt, *Animasikan* gambar → Frame→Video, *Jadikan bahan*, favorit, jadikan sampul, unduh, hapus
- **Scenebuilder:** rangkai klip, drag & drop / geser urutan, putar semua berurutan

## Database (`supabase/migrations`)
- `profiles` — kredit & paket (kolom kredit dilindungi trigger, tidak bisa diubah user)
- `projects`, `generations`, `scenes` — semua dengan RLS (hanya pemilik)
- `credit_transactions` — ledger kredit
- RPC `create_generations()` — potong kredit secara atomik + buat job
- RPC `refund_generation()` — kembalikan kredit jika gagal (anti double-refund)
- Storage bucket `assets` — upload per folder `user_id/`

## Generate AI (saat ini: simulasi)
Logika ada di `src/lib/engine.ts`. Saat ini hasil di-*mock* (gambar placeholder, video = animasi Ken Burns).
Untuk API asli: buat Supabase Edge Function yang memproses job lalu mengisi `output_url` (mp4/png) dan `status='done'` — UI otomatis memutar file video asli.

## Struktur
```
src/
  components/      UI umum, landing/, workspace/
  context/         Auth & Toast
  lib/             supabase client, api, catalog (model/mode/konten), engine (mock)
  pages/           Landing, Login, Dashboard, Workspace, Tools
design/            Pilihan template dark (referensi)
supabase/migrations
```
