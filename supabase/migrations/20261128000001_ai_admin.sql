-- FLOW CONNECT — Admin & provider AI (chat pembuat prompt; disiapkan juga untuk gambar, video, audio).
-- Kunci API provider disimpan TERENKRIPSI di Supabase Vault dan hanya dibaca Edge Function (service role);
-- aplikasi desktop & browser tidak pernah menerima kunci provider.

-- ───────── admin ─────────
create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
create policy "app_admins_select_self" on public.app_admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid());
$$;

-- ───────── provider & model ─────────
create table public.ai_providers (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'openai_compat' check (kind in ('openai_compat', 'anthropic', 'google', 'fal', 'replicate', 'elevenlabs')),
  base_url text not null check (base_url ~ '^https://'),
  enabled boolean not null default true,
  notes text check (char_length(notes) <= 500),
  key_hint text,                 -- 4 karakter terakhir kunci (tampilan admin)
  key_secret_id uuid,            -- vault.secrets.id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_models (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.ai_providers (id) on delete cascade,
  model_id text not null check (char_length(model_id) between 1 and 120),
  label text not null check (char_length(label) between 1 and 80),
  category text not null check (category in ('chat', 'image', 'video', 'audio')),
  enabled boolean not null default false,
  is_default boolean not null default false,
  sort integer not null default 100,
  price_note text check (char_length(price_note) <= 120),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider_id, model_id, category)
);
create unique index ai_models_one_default on public.ai_models (category) where is_default;

create table public.ai_settings (
  id integer primary key default 1 check (id = 1),
  chat_daily_limit integer not null default 60 check (chat_daily_limit between 0 and 10000),
  chat_max_tokens integer not null default 1200 check (chat_max_tokens between 100 and 8000),
  chat_system_prompt text not null default '' check (char_length(chat_system_prompt) <= 8000),
  updated_at timestamptz not null default now()
);
insert into public.ai_settings (id) values (1);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  license_id uuid references public.licenses (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  provider_id text,
  model_id text,
  category text not null default 'chat',
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12, 6),
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index ai_usage_license_day on public.ai_usage (license_id, created_at desc);
create index ai_usage_created on public.ai_usage (created_at desc);

alter table public.ai_providers enable row level security;
alter table public.ai_models enable row level security;
alter table public.ai_settings enable row level security;
alter table public.ai_usage enable row level security;

-- katalog: semua orang boleh melihat yang aktif; admin melihat & mengubah semuanya
create policy "ai_providers_read" on public.ai_providers for select using (enabled or public.is_admin());
create policy "ai_providers_admin_ins" on public.ai_providers for insert to authenticated with check (public.is_admin());
create policy "ai_providers_admin_upd" on public.ai_providers for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "ai_providers_admin_del" on public.ai_providers for delete to authenticated using (public.is_admin());
create policy "ai_models_read" on public.ai_models for select using (
  public.is_admin() or (enabled and exists (select 1 from public.ai_providers p where p.id = provider_id and p.enabled))
);
create policy "ai_models_admin_ins" on public.ai_models for insert to authenticated with check (public.is_admin());
create policy "ai_models_admin_upd" on public.ai_models for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "ai_models_admin_del" on public.ai_models for delete to authenticated using (public.is_admin());
create policy "ai_settings_admin_read" on public.ai_settings for select to authenticated using (public.is_admin());
create policy "ai_settings_admin_upd" on public.ai_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "ai_usage_admin_read" on public.ai_usage for select to authenticated using (public.is_admin());

-- kolom kunci tidak boleh diubah langsung (hanya lewat admin_set_provider_key)
create or replace function public.ai_providers_protect_key()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.key_hint := null; new.key_secret_id := null;
    else
      new.key_hint := old.key_hint; new.key_secret_id := old.key_secret_id;
    end if;
  end if;
  return new;
end $$;
create trigger ai_providers_protect before insert or update on public.ai_providers
  for each row execute function public.ai_providers_protect_key();
-- hapus provider → hapus juga kuncinya dari Vault
create or replace function public.ai_providers_drop_key()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.key_secret_id is not null then delete from vault.secrets where id = old.key_secret_id; end if;
  return old;
end $$;
create trigger ai_providers_drop after delete on public.ai_providers
  for each row execute function public.ai_providers_drop_key();

create or replace function public.ai_touch()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger ai_providers_touch before update on public.ai_providers for each row execute function public.ai_touch();
create trigger ai_settings_touch before update on public.ai_settings for each row execute function public.ai_touch();

-- model bawaan baru → bawaan lama di kategori yang sama dilepas
create or replace function public.ai_models_single_default()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_default then
    update public.ai_models set is_default = false where category = new.category and id <> new.id and is_default;
  end if;
  return new;
end $$;
create trigger ai_models_default before insert or update of is_default on public.ai_models
  for each row when (new.is_default) execute function public.ai_models_single_default();

-- ───────── kunci provider (Vault) ─────────
create or replace function public.admin_set_provider_key(p_provider text, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_prov public.ai_providers;
  v_key text := btrim(coalesce(p_key, ''));
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  select * into v_prov from public.ai_providers where id = p_provider;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_key = '' then
    if v_prov.key_secret_id is not null then delete from vault.secrets where id = v_prov.key_secret_id; end if;
    update public.ai_providers set key_secret_id = null, key_hint = null where id = p_provider;
    return jsonb_build_object('ok', true, 'has_key', false);
  end if;
  if char_length(v_key) > 500 then raise exception 'KEY_TOO_LONG'; end if;
  if v_prov.key_secret_id is not null and exists (select 1 from vault.secrets where id = v_prov.key_secret_id) then
    perform vault.update_secret(v_prov.key_secret_id, v_key);
    v_id := v_prov.key_secret_id;
  else
    v_id := vault.create_secret(v_key, 'ai_provider_' || p_provider || '_' || substr(gen_random_uuid()::text, 1, 8), 'FLOW CONNECT provider key');
  end if;
  update public.ai_providers set key_secret_id = v_id, key_hint = '…' || right(v_key, 4) where id = p_provider;
  return jsonb_build_object('ok', true, 'has_key', true, 'key_hint', '…' || right(v_key, 4));
end $$;

-- hanya untuk Edge Function (service role)
create or replace function public.ai_provider_secret(p_provider text)
returns text language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from public.ai_providers p join vault.decrypted_secrets s on s.id = p.key_secret_id where p.id = p_provider;
$$;
revoke all on function public.ai_provider_secret(text) from public, anon, authenticated;
grant execute on function public.ai_provider_secret(text) to service_role;

-- ───────── katalog untuk aplikasi desktop ─────────
create or replace function public.ai_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'provider', p.id, 'provider_name', p.name, 'model', m.model_id, 'label', m.label,
    'category', m.category, 'is_default', m.is_default, 'price_note', m.price_note, 'ready', p.key_secret_id is not null
  ) order by m.category, m.sort, m.label), '[]'::jsonb)
  from public.ai_models m join public.ai_providers p on p.id = m.provider_id
  where m.enabled and p.enabled;
$$;
grant execute on function public.ai_catalog() to anon, authenticated;

-- ───────── admin: lisensi & pemakaian ─────────
create or replace function public.admin_licenses()
returns table (id uuid, email text, label text, key_hint text, max_devices int, devices bigint, expires_at timestamptz,
               revoked_at timestamptz, last_used_at timestamptz, created_at timestamptz, chat_today bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return query
    select l.id, u.email::text, l.label, l.key_hint, l.max_devices,
           (select count(*) from public.license_devices d where d.license_id = l.id),
           l.expires_at, l.revoked_at, l.last_used_at, l.created_at,
           (select count(*) from public.ai_usage a where a.license_id = l.id and a.created_at >= date_trunc('day', now()))
    from public.licenses l left join auth.users u on u.id = l.user_id
    order by l.created_at desc;
end $$;

create or replace function public.admin_update_license(p_id uuid, p_revoked boolean default null, p_max_devices int default null,
                                                      p_expires_at timestamptz default null, p_clear_expiry boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  update public.licenses set
    revoked_at = case when p_revoked is null then revoked_at when p_revoked then coalesce(revoked_at, now()) else null end,
    max_devices = coalesce(least(greatest(p_max_devices, 1), 10), max_devices),
    expires_at = case when p_clear_expiry then null else coalesce(p_expires_at, expires_at) end
  where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

create or replace function public.admin_usage_summary(p_days int default 7)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  select jsonb_build_object(
    'requests', count(*), 'failed', count(*) filter (where not ok),
    'input_tokens', coalesce(sum(input_tokens), 0), 'output_tokens', coalesce(sum(output_tokens), 0),
    'cost_usd', coalesce(sum(cost_usd), 0),
    'by_model', coalesce((select jsonb_agg(x) from (
       select provider_id, model_id, count(*) requests, coalesce(sum(cost_usd), 0) cost_usd
       from public.ai_usage where created_at >= now() - make_interval(days => greatest(p_days, 1))
       group by provider_id, model_id order by count(*) desc limit 20) x), '[]'::jsonb)
  ) into v
  from public.ai_usage where created_at >= now() - make_interval(days => greatest(p_days, 1));
  return v;
end $$;

-- ───────── data awal ─────────
insert into public.ai_providers (id, name, kind, base_url, notes) values
  ('opencode', 'OpenCode Console', 'openai_compat', 'https://opencode.ai/inference/openai/v1',
   'Kunci dari opencode.ai/console (Account → Personal API keys). Model gratis OpenCode hanya bisa dipakai di aplikasi OpenCode (HTTP 403 dari aplikasi lain), jadi pakai model berbayar murah.');

insert into public.ai_models (provider_id, model_id, label, category, enabled, is_default, sort, price_note) values
  ('opencode', 'gpt-5-nano', 'GPT 5 Nano', 'chat', true, true, 10, '$0.05 / $0.40 per 1 juta token'),
  ('opencode', 'deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', 'chat', true, false, 20, '$0.12 / $0.48 per 1 juta token'),
  ('opencode', 'glm-5.3-flash', 'GLM 5.3 Flash', 'chat', true, false, 30, '$0.15 / $0.50 per 1 juta token'),
  ('opencode', 'gpt-6-luna', 'GPT 6 Luna', 'chat', false, false, 40, '$0.10 / $0.50 per 1 juta token'),
  ('opencode', 'claude-haiku-5-5', 'Claude Haiku 5.5', 'chat', false, false, 50, '$0.10 / $0.50 per 1 juta token');

update public.ai_settings set chat_system_prompt =
'Kamu adalah asisten penulis prompt untuk Google Flow (gambar: Nano Banana; video: Omni / Veo). Bantu pengguna menyusun prompt yang jelas, sinematik, dan spesifik: subjek, aksi, latar, komposisi/sudut kamera, pencahayaan, gaya visual, suasana, dan (untuk video) gerakan kamera serta tempo. Jawab dalam bahasa pengguna. Bila diminta membuat prompt, tulis prompt final di dalam blok ```prompt ... ``` agar bisa langsung dipakai; tulis prompt dalam bahasa Inggris kecuali pengguna meminta lain. Jangan membuat konten yang melanggar kebijakan Google.'
where id = 1;

-- pemilik aplikasi menjadi admin pertama
insert into public.app_admins (user_id)
select id from auth.users where lower(email) = 'sugionoofficial88@gmail.com'
on conflict do nothing;
