-- FLOW CONNECT — Skill dari admin (aplikasi desktop → Studio → Skill → "Dari admin").
-- Skill = templat prompt + setelan Flow. Kolom isian dibuat dari templat:
--   {Nama isian}               → kotak teks
--   {Nama isian:opsi 1|opsi 2} → pilihan (opsi pertama = bawaan)
--   {@1} / {@2}                → tag @ foto referensi ke-1 / ke-2
-- Admin mengelola dari situs (/app/admin → Skill); aplikasi membaca lewat ai_skills_catalog() tanpa perlu update.

create table public.ai_skills (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 200),
  category text not null default 'image' check (category in ('image', 'video')),
  icon text not null default 'sparkles' check (icon ~ '^[a-z0-9-]{1,40}$'),
  template text not null check (char_length(template) between 1 and 4000),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  refs jsonb not null default '{"min":0,"max":0}'::jsonb check (jsonb_typeof(refs) = 'object'),
  enabled boolean not null default true,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_skills_sort_idx on public.ai_skills (sort, name);

alter table public.ai_skills enable row level security;
create policy "ai_skills_admin_read" on public.ai_skills for select to authenticated using (public.is_admin());
create policy "ai_skills_admin_ins" on public.ai_skills for insert to authenticated with check (public.is_admin());
create policy "ai_skills_admin_upd" on public.ai_skills for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "ai_skills_admin_del" on public.ai_skills for delete to authenticated using (public.is_admin());
create trigger ai_skills_touch before update on public.ai_skills for each row execute function public.ai_touch();

-- katalog untuk aplikasi desktop (hanya skill aktif)
create or replace function public.ai_skills_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'name', s.name, 'description', s.description, 'category', s.category, 'icon', s.icon,
    'template', s.template, 'settings', s.settings, 'refs', s.refs, 'updated_at', s.updated_at
  ) order by s.sort, s.name), '[]'::jsonb)
  from public.ai_skills s
  where s.enabled;
$$;
grant execute on function public.ai_skills_catalog() to anon, authenticated;
