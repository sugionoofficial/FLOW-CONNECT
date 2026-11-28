-- Expose capabilities, not provider secrets, to the desktop model selectors.
create or replace function public.ai_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'provider', p.id, 'provider_name', p.name, 'model', m.model_id, 'label', m.label,
    'category', m.category, 'is_default', m.is_default, 'price_note', m.price_note,
    'ready', p.key_secret_id is not null,
    'vision', coalesce(m.config->>'vision', 'false') in ('true', '1')
  ) order by m.category, m.sort, m.label), '[]'::jsonb)
  from public.ai_models m join public.ai_providers p on p.id = m.provider_id
  where m.enabled and p.enabled;
$$;
grant execute on function public.ai_catalog() to anon, authenticated;
