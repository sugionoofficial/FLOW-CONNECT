// Contoh hasil generate untuk halaman /contoh — prompt, model & pengaturan bisa disalin lalu dicoba di Studio aplikasi PC.
export type ExampleKind = 'video' | 'foto' | 'workflow' | 'project'

export type ExampleStep = { title: string; model: string; prompt: string; note?: string }

export type Example = {
  id: string
  kind: ExampleKind
  title: string
  desc: string
  image: string
  model: string
  prompt: string
  settings: Record<string, string>
  tags: string[]
  author: string
  /** workflow: langkah berantai; project: daftar adegan/shot */
  steps?: ExampleStep[]
}

export const EXAMPLE_KINDS: { id: ExampleKind | 'semua'; label: string }[] = [
  { id: 'semua', label: 'Semua' },
  { id: 'video', label: 'Video' },
  { id: 'foto', label: 'Foto' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'project', label: 'Project' },
]

export const EXAMPLES: Example[] = [
  // ───────── Video ─────────
  {
    id: 'v-sawah', kind: 'video', title: 'Drone pagi di Jatiluwih', image: '/media/ricefield.jpg', model: 'Veo 3.1',
    desc: 'Shot drone maju perlahan di atas sawah terasering saat matahari terbit.',
    prompt: 'Cinematic drone shot slowly flying forward over Balinese rice terraces at sunrise, thin mist between the terraces, golden light, a farmer with a conical hat walking on the ridge, gentle camera movement, ambient sound of birds and flowing water',
    settings: { Rasio: '16:9', Durasi: '8 detik', Kamera: 'Drone, dolly maju', Audio: 'Suara alam' },
    tags: ['alam', 'drone', 'Bali'], author: 'Made Surya',
  },
  {
    id: 'v-jakarta', kind: 'video', title: 'Neon Jakarta 2077', image: '/media/city.jpg', model: 'Veo 3.1',
    desc: 'Tracking shot malam hujan di jalanan kota futuristik dengan pantulan neon.',
    prompt: 'Night tracking shot through a futuristic Jakarta street in the rain, purple and cyan neon signs reflecting on wet asphalt, flying motorbikes, steam from street food carts, cyberpunk atmosphere, slow motion raindrops, synthwave ambience',
    settings: { Rasio: '16:9', Durasi: '8 detik', Kamera: 'Tracking, setinggi mata', Audio: 'Hujan + synthwave' },
    tags: ['sci-fi', 'kota', 'neon'], author: 'Studio Lentera',
  },
  {
    id: 'v-komodo', kind: 'video', title: 'Sang Penjaga Pulau', image: '/media/komodo.jpg', model: 'Veo 3.1 Fast',
    desc: 'Gaya dokumenter satwa liar: komodo berjalan di pantai saat senja.',
    prompt: 'Wildlife documentary shot, low angle, a Komodo dragon walking slowly toward the camera on a golden beach at sunset, waves in the background, film grain, shallow depth of field, narrator voice in Indonesian: "Di pulau ini, dialah sang penjaga."',
    settings: { Rasio: '16:9', Durasi: '8 detik', Kamera: 'Low angle statis', Audio: 'Narasi + ombak' },
    tags: ['dokumenter', 'satwa'], author: 'Laras Putri',
  },
  {
    id: 'v-kopi', kind: 'video', title: 'Iklan kopi 8 detik', image: '/media/coffee.jpg', model: 'Veo 3.1',
    desc: 'Video produk: uap kopi tubruk dengan cahaya pagi. Dibuat dari foto produk (Frames to Video).',
    prompt: 'Product commercial: slow push-in on a cup of Indonesian kopi tubruk on a teak table, steam swirling in morning light rays, coffee beans falling in slow motion around the cup, warm color grade, ends with a calm hold on the cup',
    settings: { Rasio: '9:16', Durasi: '8 detik', Mode: 'Frames to Video', Audio: 'Musik akustik lembut' },
    tags: ['iklan', 'produk', 'UMKM'], author: 'Kopi Nusantara',
  },
  {
    id: 'v-laut', kind: 'video', title: 'Kota di dasar laut', image: '/media/underwater.jpg', model: 'Veo 3.1',
    desc: 'Penyelam menemukan kota bercahaya — cocok sebagai pembuka film pendek.',
    prompt: 'A lone diver descends into deep blue water and discovers a glowing ancient city on the sea floor, bioluminescent coral, god rays from the surface, camera follows behind the diver, awe-inspiring, orchestral swell',
    settings: { Rasio: '21:9', Durasi: '8 detik', Kamera: 'Mengikuti dari belakang', Audio: 'Orkestra' },
    tags: ['fantasi', 'laut'], author: 'Laras Putri',
  },

  // ───────── Foto ─────────
  {
    id: 'f-batik', kind: 'foto', title: 'Editorial batik modern', image: '/media/batik.jpg', model: 'Nano Banana Pro',
    desc: 'Foto fashion bergaya majalah dengan pencahayaan rim ungu-cyan.',
    prompt: 'High fashion editorial photo of a young Indonesian woman wearing a modern indigo and gold batik dress, studio backdrop, soft purple and cyan rim lighting, elegant pose, magazine cover quality, 85mm lens, sharp fabric detail',
    settings: { Rasio: '9:16', Jumlah: '4 variasi', Gaya: 'Editorial', Lensa: '85 mm' },
    tags: ['fashion', 'potret'], author: 'Rani Wijaya',
  },
  {
    id: 'f-rendang', kind: 'foto', title: 'Foto menu rendang', image: '/media/food.jpg', model: 'Nano Banana',
    desc: 'Foto makanan top-down siap untuk menu restoran & GoFood.',
    prompt: 'Top-down food photography of Indonesian beef rendang with steamed rice, sambal and fresh herbs on a banana leaf, dark slate background, moody side lighting, glossy appetizing texture, restaurant menu quality',
    settings: { Rasio: '16:9', Jumlah: '4 variasi', Gaya: 'Food photography', Sudut: 'Top-down' },
    tags: ['kuliner', 'UMKM', 'menu'], author: 'Dapur Minang',
  },
  {
    id: 'f-potret', kind: 'foto', title: 'Potret neon di balik hujan', image: '/media/portrait.jpg', model: 'Nano Banana Pro',
    desc: 'Close-up sinematik dengan cahaya neon dan tetesan hujan di kaca.',
    prompt: 'Cinematic close-up portrait of a woman behind a rain-covered window, purple and cyan neon light, raindrops in sharp focus, bokeh city lights, melancholic mood, film still',
    settings: { Rasio: '4:5', Jumlah: '2 variasi', Gaya: 'Sinematik', Lensa: '50 mm' },
    tags: ['potret', 'neon'], author: 'Bima Pratama',
  },
  {
    id: 'f-borobudur', kind: 'foto', title: 'Borobudur saat fajar', image: '/media/temple.jpg', model: 'Nano Banana',
    desc: 'Foto lanskap epik untuk poster pariwisata.',
    prompt: 'Epic aerial view of Borobudur temple at sunrise surrounded by mist and volcanoes, pink and golden sky, hot air balloons in the distance, ultra wide, atmospheric, travel poster quality',
    settings: { Rasio: '16:9', Jumlah: '4 variasi', Gaya: 'Lanskap', Sudut: 'Aerial' },
    tags: ['wisata', 'lanskap'], author: 'Wonderful ID',
  },
  {
    id: 'f-golem', kind: 'foto', title: 'Golem & dandelion', image: '/media/golem.jpg', model: 'Gemini Omni',
    desc: 'Concept art karakter untuk film animasi pendek.',
    prompt: 'Concept art of a giant moss-covered stone golem sitting in a misty ancient forest, gently looking at a single glowing dandelion, soft volumetric light, Studio Ghibli inspired, painterly',
    settings: { Rasio: '16:9', Jumlah: '4 variasi', Gaya: 'Concept art' },
    tags: ['karakter', 'fantasi'], author: 'Rani Wijaya',
  },

  // ───────── Workflow ─────────
  {
    id: 'w-produk', kind: 'workflow', title: 'Foto produk → video iklan', image: '/media/coffee.jpg', model: 'Nano Banana → Veo 3.1',
    desc: 'Dari satu foto HP produkmu menjadi video iklan vertikal untuk Reels/TikTok.',
    prompt: 'Product commercial: slow push-in on the product from the reference image, steam and particles in warm morning light, premium advertising look',
    settings: { Hasil: 'Video 9:16, 8 detik', Langkah: '3', Waktu: '± 5 menit' },
    tags: ['iklan', 'UMKM'], author: 'Tim FLOW CONNECT',
    steps: [
      { title: 'Rapikan foto produk', model: 'Nano Banana', prompt: 'Remove the background of the reference photo and place the product on a dark teak wooden table, soft morning window light, commercial product photography', note: 'Unggah foto produk dari HP sebagai gambar referensi.' },
      { title: 'Buat frame awal & akhir', model: 'Nano Banana', prompt: 'Same scene, add rising steam and scattered coffee beans, warmer light, close-up framing', note: 'Simpan dua gambar: frame awal (lebar) dan frame akhir (dekat).' },
      { title: 'Hidupkan jadi video', model: 'Veo 3.1 · Frames to Video', prompt: 'Slow cinematic push-in from the first frame to the last frame, steam swirling, beans falling in slow motion, calm acoustic music', note: 'Pilih rasio 9:16 untuk Reels/TikTok.' },
    ],
  },
  {
    id: 'w-karakter', kind: 'workflow', title: 'Karakter konsisten di banyak adegan', image: '/media/wayang.jpg', model: 'Gemini Omni → Veo 3.1',
    desc: 'Buat satu karakter, lalu pakai sebagai bahan (Ingredients) agar wajah & kostumnya sama di setiap video.',
    prompt: 'Stylized 3D character inspired by Javanese wayang kulit, heroic puppet warrior with intricate carved leather patterns glowing gold',
    settings: { Hasil: '3 klip video', Langkah: '3', Fitur: 'Ingredients to Video' },
    tags: ['animasi', 'karakter'], author: 'Tim FLOW CONNECT',
    steps: [
      { title: 'Desain karakter', model: 'Gemini Omni', prompt: 'Character sheet of a stylized 3D hero inspired by Javanese wayang kulit, front, side and back view, golden carved leather patterns, neutral background' },
      { title: 'Simpan sebagai bahan', model: 'Google Flow', prompt: 'Simpan gambar karakter ke koleksi, lalu tandai sebagai Ingredient.', note: 'Langkah ini dilakukan di Google Flow (tanpa prompt).' },
      { title: 'Adegan dengan karakter yang sama', model: 'Veo 3.1 · Ingredients', prompt: 'The wayang hero leaps across a shadow-play stage, dramatic backlight, camera orbits around him, gamelan percussion' },
    ],
  },
  {
    id: 'w-foto-lama', kind: 'workflow', title: 'Hidupkan foto keluarga lama', image: '/media/portrait.jpg', model: 'Nano Banana → Veo 3.1 Fast',
    desc: 'Pulihkan foto lama lalu buat gerakan halus yang menyentuh.',
    prompt: 'Restore the old photo: fix scratches, enhance sharpness, natural colorization, keep the faces exactly the same',
    settings: { Hasil: 'Foto + video 8 detik', Langkah: '2' },
    tags: ['keluarga', 'restorasi'], author: 'Tim FLOW CONNECT',
    steps: [
      { title: 'Restorasi & pewarnaan', model: 'Nano Banana', prompt: 'Restore the old photo: fix scratches and dust, enhance sharpness, natural colorization, keep the faces exactly the same' },
      { title: 'Gerakan halus', model: 'Veo 3.1 Fast · Frames to Video', prompt: 'Very subtle natural motion: gentle smile, blinking, hair moving slightly in the breeze, static camera, warm nostalgic mood' },
    ],
  },

  // ───────── Project ─────────
  {
    id: 'p-golem', kind: 'project', title: 'Film pendek: Sampai Jumpa Lagi', image: '/media/golem.jpg', model: 'Veo 3.1 + Nano Banana',
    desc: 'Project lengkap 4 adegan (± 32 detik) tentang golem batu dan bunga dandelion, disusun di Scenebuilder.',
    prompt: 'Short film, Studio Ghibli inspired: a moss-covered stone golem and a dandelion that returns every spring',
    settings: { Durasi: '± 32 detik', Adegan: '4', Rasio: '16:9', Alat: 'Scenebuilder' },
    tags: ['film pendek', 'animasi'], author: 'Rani Wijaya',
    steps: [
      { title: 'Adegan 1 — Hutan sunyi', model: 'Veo 3.1', prompt: 'Wide establishing shot of an ancient misty forest at dawn, a giant moss-covered stone golem sits motionless, birds land on its shoulders, soft ambient music' },
      { title: 'Adegan 2 — Pertemuan', model: 'Veo 3.1', prompt: 'Close-up: a single dandelion sprouts and blooms in front of the golem, its stone eyes slowly glow as it notices the flower' },
      { title: 'Adegan 3 — Musim berganti', model: 'Veo 3.1', prompt: 'Time-lapse of seasons changing around the golem and the dandelion, leaves falling, snow, then spring again, the golem gently shields the flower' },
      { title: 'Adegan 4 — Sampai jumpa lagi', model: 'Veo 3.1 · Extend', prompt: 'The dandelion seeds float away in the wind, the golem raises its hand as if waving goodbye, warm sunset light, music swells, fade out' },
    ],
  },
  {
    id: 'p-umkm', kind: 'project', title: 'Kampanye UMKM: Kopi Nusantara', image: '/media/food.jpg', model: 'Nano Banana + Veo 3.1',
    desc: 'Satu project berisi foto katalog, video Reels, dan poster promo untuk peluncuran produk.',
    prompt: 'Brand campaign for an Indonesian coffee and food brand: warm, authentic, premium',
    settings: { Hasil: '6 foto · 2 video · 1 poster', Rasio: '1:1, 9:16', Alat: 'Collection' },
    tags: ['bisnis', 'kampanye'], author: 'Kopi Nusantara',
    steps: [
      { title: 'Foto katalog', model: 'Nano Banana', prompt: 'Product catalog photos of coffee packaging on a clean beige background, soft shadows, square format, consistent lighting' },
      { title: 'Video Reels', model: 'Veo 3.1', prompt: 'Vertical video: barista pours latte art shaped like a wayang figure, slow motion, cozy cafe ambience' },
      { title: 'Poster promo', model: 'Nano Banana Pro', prompt: 'Promotional poster with the coffee cup hero shot, space for the text "Diskon 20% minggu ini", warm palette' },
    ],
  },
  {
    id: 'p-wisata', kind: 'project', title: 'Video wisata: Pesona Jawa Tengah', image: '/media/temple.jpg', model: 'Veo 3.1',
    desc: 'Video promosi wisata 3 adegan dengan transisi mulus memakai fitur Extend.',
    prompt: 'Tourism promo video of Central Java: Borobudur, rice fields, and local culture',
    settings: { Durasi: '± 24 detik', Adegan: '3', Rasio: '16:9' },
    tags: ['wisata', 'promosi'], author: 'Wonderful ID',
    steps: [
      { title: 'Pembuka — Borobudur', model: 'Veo 3.1', prompt: 'Aerial sunrise shot rising above Borobudur temple through the mist, hot air balloons, epic orchestral opening' },
      { title: 'Sawah & desa', model: 'Veo 3.1 · Extend', prompt: 'Continue: the camera glides down to green rice terraces where farmers work, children run along the ridge, gamelan joins the music' },
      { title: 'Penutup — budaya', model: 'Veo 3.1', prompt: 'A wayang kulit performance at night, warm lamp light, the shadow puppet bows to the audience, title space at the end' },
    ],
  },
]
