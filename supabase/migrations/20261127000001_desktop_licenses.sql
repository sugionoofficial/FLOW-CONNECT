-- FLOW CONNECT Desktop — lisensi aplikasi PC.
-- Kunci lisensi dibuat pengguna di web (/app/lisensi). Yang disimpan hanya hash SHA-256-nya;
-- kunci asli hanya ditampilkan sekali saat dibuat. Aplikasi desktop mengaktifkan kunci lewat
-- RPC activate_license (boleh dipanggil anon: pemegang kunci = pemilik lisensi).

create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'Lisensi' check (char_length(label) between 1 and 60),
  key_hash text not null unique,
  key_hint text not null,
  max_devices integer not null default 3 check (max_devices between 1 and 10),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index licenses_user_idx on public.licenses (user_id, created_at desc);

create table public.license_devices (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses (id) on delete cascade,
  device_id text not null check (char_length(device_id) between 8 and 100),
  device_name text not null default '' check (char_length(device_name) <= 100),
  platform text check (char_length(platform) <= 30),
  app_version text check (char_length(app_version) <= 30),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (license_id, device_id)
);

alter table public.licenses enable row level security;
alter table public.license_devices enable row level security;

-- Pemilik hanya bisa MEMBACA; perubahan lewat fungsi di bawah.
create policy "licenses_select_own" on public.licenses
  for select to authenticated using (user_id = auth.uid());
create policy "license_devices_select_own" on public.license_devices
  for select to authenticated using (
    exists (select 1 from public.licenses l where l.id = license_id and l.user_id = auth.uid())
  );

-- ───────── membuat kunci (pengguna yang login) ─────────
create or replace function public.create_license(p_label text default null)
returns table (id uuid, license_key text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  v_bytes bytea;
  v_raw text := '';
  v_key text;
  v_id uuid;
  i int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if (select count(*) from public.licenses l where l.user_id = v_uid and l.revoked_at is null) >= 5 then
    raise exception 'LICENSE_LIMIT';
  end if;
  v_bytes := extensions.gen_random_bytes(25);
  for i in 0..24 loop
    v_raw := v_raw || substr(v_alpha, (get_byte(v_bytes, i) % 30) + 1, 1);
  end loop;
  v_key := 'FC-' || substr(v_raw, 1, 5) || '-' || substr(v_raw, 6, 5) || '-' || substr(v_raw, 11, 5) || '-' ||
           substr(v_raw, 16, 5) || '-' || substr(v_raw, 21, 5);
  insert into public.licenses (user_id, label, key_hash, key_hint)
  values (
    v_uid,
    coalesce(nullif(btrim(left(p_label, 60)), ''), 'Lisensi'),
    encode(extensions.digest(v_key, 'sha256'), 'hex'),
    'FC-' || substr(v_raw, 1, 5) || '-•••••-•••••-•••••-' || substr(v_raw, 21, 5)
  )
  returning licenses.id into v_id;
  return query select v_id, v_key;
end $$;

create or replace function public.revoke_license(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.licenses set revoked_at = coalesce(revoked_at, now())
  where id = p_id and user_id = auth.uid();
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

create or replace function public.rename_license(p_id uuid, p_label text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.licenses set label = coalesce(nullif(btrim(left(p_label, 60)), ''), label)
  where id = p_id and user_id = auth.uid();
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

create or replace function public.remove_license_device(p_device uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.license_devices d
  using public.licenses l
  where d.id = p_device and l.id = d.license_id and l.user_id = auth.uid();
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- ───────── aktivasi / verifikasi dari aplikasi desktop ─────────
create or replace function public.activate_license(
  p_key text, p_device_id text, p_device_name text default '', p_platform text default null, p_app_version text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := upper(regexp_replace(coalesce(p_key, ''), '\s', '', 'g'));
  v_lic public.licenses;
  v_count int;
  v_email text;
begin
  if v_key !~ '^FC(-[A-Z0-9]{5}){5}$' then return jsonb_build_object('ok', false, 'error', 'INVALID_KEY'); end if;
  if p_device_id is null or char_length(p_device_id) not between 8 and 100 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_DEVICE');
  end if;
  select * into v_lic from public.licenses where key_hash = encode(extensions.digest(v_key, 'sha256'), 'hex');
  if not found then return jsonb_build_object('ok', false, 'error', 'INVALID_KEY'); end if;
  if v_lic.revoked_at is not null then return jsonb_build_object('ok', false, 'error', 'REVOKED'); end if;
  if v_lic.expires_at is not null and v_lic.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'EXPIRED'); end if;

  update public.license_devices
     set last_seen_at = now(),
         device_name = left(coalesce(p_device_name, ''), 100),
         platform = left(p_platform, 30),
         app_version = left(p_app_version, 30)
   where license_id = v_lic.id and device_id = p_device_id;
  if not found then
    select count(*) into v_count from public.license_devices where license_id = v_lic.id;
    if v_count >= v_lic.max_devices then
      return jsonb_build_object('ok', false, 'error', 'DEVICE_LIMIT', 'max_devices', v_lic.max_devices);
    end if;
    insert into public.license_devices (license_id, device_id, device_name, platform, app_version)
    values (v_lic.id, p_device_id, left(coalesce(p_device_name, ''), 100), left(p_platform, 30), left(p_app_version, 30));
  end if;
  update public.licenses set last_used_at = now() where id = v_lic.id;
  select count(*) into v_count from public.license_devices where license_id = v_lic.id;
  select email into v_email from auth.users where id = v_lic.user_id;
  return jsonb_build_object(
    'ok', true, 'license_id', v_lic.id, 'label', v_lic.label, 'email', v_email,
    'expires_at', v_lic.expires_at, 'max_devices', v_lic.max_devices, 'devices', v_count, 'checked_at', now()
  );
end $$;

-- Keluar dari lisensi di aplikasi → lepaskan slot perangkat.
create or replace function public.deactivate_license(p_key text, p_device_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_key text := upper(regexp_replace(coalesce(p_key, ''), '\s', '', 'g'));
begin
  delete from public.license_devices d
  using public.licenses l
  where l.key_hash = encode(extensions.digest(v_key, 'sha256'), 'hex') and d.license_id = l.id and d.device_id = p_device_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.create_license(text) from public, anon;
revoke all on function public.revoke_license(uuid) from public, anon;
revoke all on function public.rename_license(uuid, text) from public, anon;
revoke all on function public.remove_license_device(uuid) from public, anon;
revoke all on function public.activate_license(text, text, text, text, text) from public;
revoke all on function public.deactivate_license(text, text) from public;
grant execute on function public.create_license(text) to authenticated;
grant execute on function public.revoke_license(uuid) to authenticated;
grant execute on function public.rename_license(uuid, text) to authenticated;
grant execute on function public.remove_license_device(uuid) to authenticated;
grant execute on function public.activate_license(text, text, text, text, text) to anon, authenticated;
grant execute on function public.deactivate_license(text, text) to anon, authenticated;
