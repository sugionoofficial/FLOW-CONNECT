-- FLOW CONNECT — initial schema
-- Profiles, projects, generations (AI outputs), scenes (scenebuilder timeline),
-- credit system, and storage bucket for user uploads.

-- ───────────────────────── profiles ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  credits integer not null default 100 check (credits >= 0),
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Prevent users from editing their own credits / plan directly.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  -- Direct updates from the API run as role "authenticated"; SECURITY DEFINER
  -- functions (create_generations, refund_generation) run as the owner.
  if current_user in ('authenticated', 'anon') then
    new.credits := old.credits;
    new.plan := old.plan;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── projects ─────────────────────────
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Project tanpa judul',
  description text,
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_idx on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;
create policy "projects_owner_all" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────── generations ─────────────────────────
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode text not null check (mode in ('text_to_video', 'frames_to_video', 'ingredients_to_video', 'text_to_image')),
  model text not null,
  prompt text not null,
  aspect_ratio text not null default '16:9',
  status text not null default 'processing' check (status in ('queued', 'processing', 'done', 'failed')),
  output_url text,
  thumbnail_url text,
  input_assets jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  cost integer not null default 0,
  error text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists generations_project_idx on public.generations (project_id, created_at desc);

alter table public.generations enable row level security;
create policy "generations_owner_select" on public.generations
  for select using (auth.uid() = user_id);
create policy "generations_owner_update" on public.generations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "generations_owner_delete" on public.generations
  for delete using (auth.uid() = user_id);
-- Inserts only through public.create_generations() (credit check).

-- ───────────────────────── scenes (scenebuilder) ─────────────────────────
create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  generation_id uuid not null references public.generations (id) on delete cascade,
  position integer not null default 0,
  trim_start numeric not null default 0,
  trim_end numeric,
  created_at timestamptz not null default now()
);
create index if not exists scenes_project_idx on public.scenes (project_id, position);

alter table public.scenes enable row level security;
create policy "scenes_owner_all" on public.scenes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────── credit ledger ─────────────────────────
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  reason text not null,
  generation_id uuid references public.generations (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.credit_transactions enable row level security;
create policy "credit_tx_select_own" on public.credit_transactions
  for select using (auth.uid() = user_id);

-- Atomically spend credits and create N generations.
create or replace function public.create_generations(
  p_project_id uuid,
  p_mode text,
  p_model text,
  p_prompt text,
  p_aspect_ratio text,
  p_count integer,
  p_cost_each integer,
  p_input_assets jsonb default '[]'::jsonb,
  p_settings jsonb default '{}'::jsonb
) returns setof public.generations
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_total integer := greatest(p_count, 1) * greatest(p_cost_each, 0);
  v_credits integer;
  v_row public.generations;
  i integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_count < 1 or p_count > 4 then raise exception 'invalid_count'; end if;
  if not exists (select 1 from projects where id = p_project_id and user_id = v_uid) then
    raise exception 'project_not_found';
  end if;

  select credits into v_credits from profiles where id = v_uid for update;
  if v_credits is null then
    insert into profiles (id) values (v_uid) returning credits into v_credits;
  end if;
  if v_credits < v_total then raise exception 'insufficient_credits'; end if;

  update profiles set credits = credits - v_total where id = v_uid;

  for i in 1..p_count loop
    insert into generations (project_id, user_id, mode, model, prompt, aspect_ratio, status, input_assets, settings, cost)
    values (p_project_id, v_uid, p_mode, p_model, p_prompt, p_aspect_ratio, 'processing', p_input_assets, p_settings, p_cost_each)
    returning * into v_row;
    insert into credit_transactions (user_id, amount, reason, generation_id)
    values (v_uid, -p_cost_each, 'generation:' || p_mode, v_row.id);
    return next v_row;
  end loop;

  update projects set updated_at = now() where id = p_project_id;
end $$;

-- Refund credits when a generation fails.
create or replace function public.refund_generation(p_generation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_gen public.generations;
begin
  select * into v_gen from generations where id = p_generation_id and user_id = auth.uid();
  if v_gen.id is null or v_gen.status <> 'failed' or v_gen.cost = 0 then return; end if;
  if exists (select 1 from credit_transactions where generation_id = v_gen.id and reason = 'refund') then return; end if;
  update profiles set credits = credits + v_gen.cost where id = v_gen.user_id;
  insert into credit_transactions (user_id, amount, reason, generation_id)
  values (v_gen.user_id, v_gen.cost, 'refund', v_gen.id);
end $$;

revoke execute on function public.create_generations(uuid, text, text, text, text, integer, integer, jsonb, jsonb) from public, anon;
revoke execute on function public.refund_generation(uuid) from public, anon;
grant execute on function public.create_generations(uuid, text, text, text, text, integer, integer, jsonb, jsonb) to authenticated;
grant execute on function public.refund_generation(uuid) to authenticated;

-- ───────────────────────── storage ─────────────────────────
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

create policy "assets_read_public" on storage.objects
  for select using (bucket_id = 'assets');
create policy "assets_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "assets_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text);
