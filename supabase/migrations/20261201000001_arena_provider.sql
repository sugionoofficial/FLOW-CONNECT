-- FLOW CONNECT — Provider Arena (gateway OpenAI-compatible: https://api.arena.ai/v1).
-- Kunci API dibuat di https://platform.arena.ai/dashboard/keys, lalu disimpan lewat
-- Admin → Provider & Model → Arena → Kunci API (Supabase Vault). Biaya mengikuti
-- saldo workspace Arena; tidak ada harga per token yang dicatat di ai_usage.
-- Catatan: coding-router-preview disetel untuk tool coding (Claude Code/Codex/OpenCode).
-- Untuk Asisten Prompt & pembaca halaman, tambahkan model langsung lewat "Ambil model"
-- (GET https://api.arena.ai/v1/models) bila hasilnya kurang pas.

insert into public.ai_providers (id, name, kind, base_url, notes) values
  ('arena', 'Arena', 'openai_compat', 'https://api.arena.ai/v1',
   'Gateway OpenAI-compatible Arena (api.arena.ai). Kunci dibuat di platform.arena.ai/dashboard/keys; biaya mengikuti saldo workspace Arena.')
on conflict (id) do nothing;

-- Model router Arena: memilih model terbaik per permintaan. Mendukung input gambar
-- (vision=1) sehingga bisa dipakai pembaca halaman & skill "Rekayasa balik prompt".
insert into public.ai_models (provider_id, model_id, label, category, enabled, is_default, sort, price_note, config) values
  ('arena', 'coding-router-preview', 'Arena Coding Router', 'chat', true, false, 100,
   'Biaya dari saldo workspace Arena', '{"vision": 1}'::jsonb)
on conflict (provider_id, model_id, category) do nothing;
