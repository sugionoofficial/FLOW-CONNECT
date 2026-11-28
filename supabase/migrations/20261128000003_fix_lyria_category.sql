-- Lyria generates music, not prompt text. Preserve models but remove them from chat selectors.
update public.ai_models m
set category = 'audio', is_default = false,
    config = m.config || '{"output_modalities":["audio"]}'::jsonb
where m.provider_id = 'flow' and m.category = 'chat'
  and m.model_id in ('google/lyria-3-pro-preview', 'google/lyria-3-clip-preview')
  and not exists (
    select 1 from public.ai_models a
    where a.provider_id = m.provider_id and a.model_id = m.model_id and a.category = 'audio'
  );
