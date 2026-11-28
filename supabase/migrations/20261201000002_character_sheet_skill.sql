-- FLOW CONNECT — Skill admin "Character Sheet Pro" (Studio → Skill → "Dari admin").
-- Templat riset dari referensi character sheet AI (hero + turnaround + ekspresi + palet,
-- kunci konsistensi: wajah/pakaian/warna tetap, hanya pose & ekspresi berubah).
-- Bisa diubah/dihapus dari situs → Admin → Skill tanpa update aplikasi.

insert into public.ai_skills (name, description, category, icon, template, settings, refs, enabled, sort)
select
  'Character Sheet Pro',
  'Lembar karakter lengkap: hero, turnaround, ekspresi & palet — untuk karakter konsisten di semua adegan.',
  'image',
  'id-card',
  'Character reference sheet of {Karakter}[, based on {@1}], {Tata letak:Panel besar + grid=one large hero portrait panel on the left (head to mid-torso) with a structured grid of smaller panels on the right|Turnaround bar=front, side and back views in one row on a shared baseline|Grid 3x3=a neat 3x3 grid of panels}, showing {Isi panel:Turnaround lengkap=front full body, three-quarter full body, side profile and back view, plus walking and sitting poses|Turnaround + ekspresi=front, side and back full-body views plus expression close-ups: neutral, happy, angry, surprised, sad and thinking|Hero + ekspresi=a large three-quarter hero pose plus expression close-ups}, full body, neutral standing pose, identical character in every panel — same face, hair, outfit, colors, proportions and accessories; only pose, angle and expression change, {Gaya:Realistis=photorealistic, high-resolution, realistic skin and fabric detail|Anime=anime style, cel shading|Kartun 3D=3D cartoon style, Pixar-like|Komik=comic book style}, {Latar:Latar terang polos=plain light neutral background|Studio abu-abu=neutral grey studio backdrop|Putih bersih=clean white background}, soft even studio lighting, small clean labels under each panel, production-ready AI video consistency sheet, no extra props, no additional characters, no watermark',
  '{"kind":"image","ratio":"3:4","count":1}'::jsonb,
  '{"min":0,"max":1}'::jsonb,
  true,
  90
where not exists (select 1 from public.ai_skills where name = 'Character Sheet Pro');
