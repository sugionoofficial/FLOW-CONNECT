-- AI pembaca halaman: aplikasi desktop membaca halaman Google Flow (daftar tombol + tangkapan layar) saat login /
-- membuat project, lalu model AI memutuskan tombol mana yang ditekan (bukan menebak dari pola teks).
alter table public.ai_settings
  add column if not exists page_reader_model_id uuid references public.ai_models(id) on delete set null,
  add column if not exists page_reader_daily_limit integer not null default 300
    check (page_reader_daily_limit between 0 and 100000),
  add column if not exists page_reader_enabled boolean not null default true;

-- model yang bisa membaca gambar (tangkapan layar)
update public.ai_models set config = coalesce(config, '{}'::jsonb) || '{"vision": 1}'::jsonb
where model_id in ('nvidia/nemotron-3.5-super-vl:free', 'google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free',
                   'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free');

update public.ai_settings set page_reader_model_id = (select id from public.ai_models where model_id = 'google/gemma-4-31b-it:free' limit 1)
where id = 1 and page_reader_model_id is null;

create index if not exists ai_usage_license_cat_day on public.ai_usage (license_id, category, created_at);
