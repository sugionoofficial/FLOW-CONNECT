-- FLOW CONNECT v2 — hub akun Google.
-- Proses generate berjalan di Google Flow dengan akun Google masing-masing user,
-- jadi sistem project/generate/kredit simulasi dihapus.

-- ───────── hapus sistem simulasi lama ─────────
drop function if exists public.create_generations(uuid, text, text, text, text, integer, integer, jsonb, jsonb);
drop function if exists public.refund_generation(uuid);
drop table if exists public.scenes;
drop table if exists public.credit_transactions;
drop table if exists public.generations;
drop table if exists public.projects;

drop trigger if exists profiles_protect on public.profiles;
drop function if exists public.protect_profile_columns();
alter table public.profiles drop column if exists credits;
alter table public.profiles drop column if exists plan;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop policy if exists "assets_read_public" on storage.objects;
drop policy if exists "assets_insert_own" on storage.objects;
drop policy if exists "assets_delete_own" on storage.objects;

-- ───────── akun Google yang ditautkan ─────────
create table public.google_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  label text check (char_length(label) <= 60),
  display_name text,
  avatar_url text,
  verified boolean not null default false,   -- true hanya jika ditautkan via OAuth (Edge Function)
  is_default boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email)
);
create unique index google_accounts_one_default on public.google_accounts (user_id) where is_default;
create index google_accounts_user_idx on public.google_accounts (user_id, created_at);

alter table public.google_accounts enable row level security;

create policy "ga_select_own" on public.google_accounts
  for select using (auth.uid() = user_id);
-- Tambah manual (email) — tidak boleh mengklaim terverifikasi.
create policy "ga_insert_own_unverified" on public.google_accounts
  for insert with check (auth.uid() = user_id and verified = false);
create policy "ga_update_own" on public.google_accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ga_delete_own" on public.google_accounts
  for delete using (auth.uid() = user_id);

-- Sebelum insert: batas 10 akun, akun pertama otomatis jadi default.
create or replace function public.google_accounts_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from google_accounts where user_id = new.user_id) >= 10 then
    raise exception 'account_limit';
  end if;
  if not exists (select 1 from google_accounts where user_id = new.user_id and is_default) then
    new.is_default := true;
  else
    new.is_default := false;
  end if;
  return new;
end $$;
create trigger google_accounts_bi before insert on public.google_accounts
  for each row execute function public.google_accounts_before_insert();

-- Update dari API: email, status verifikasi & default tidak bisa diubah langsung.
create or replace function public.google_accounts_before_update()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.email := old.email;
    new.verified := old.verified;
    new.is_default := old.is_default;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger google_accounts_bu before update on public.google_accounts
  for each row execute function public.google_accounts_before_update();

-- Setelah hapus akun default: akun terbaru lain jadi default.
create or replace function public.google_accounts_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_default then
    update google_accounts set is_default = true
    where id = (select id from google_accounts where user_id = old.user_id order by coalesce(last_used_at, created_at) desc limit 1);
  end if;
  return null;
end $$;
create trigger google_accounts_ad after delete on public.google_accounts
  for each row execute function public.google_accounts_after_delete();

-- Jadikan default.
create or replace function public.set_default_google_account(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from google_accounts where id = p_id and user_id = auth.uid()) then
    raise exception 'not_found';
  end if;
  update google_accounts set is_default = false where user_id = auth.uid() and is_default and id <> p_id;
  update google_accounts set is_default = true where id = p_id;
end $$;

revoke execute on function public.set_default_google_account(uuid) from public, anon;
grant execute on function public.set_default_google_account(uuid) to authenticated;
