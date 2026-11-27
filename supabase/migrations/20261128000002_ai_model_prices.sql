-- Harga per 1 juta token (USD) untuk menghitung biaya di ai_usage.
update public.ai_models set config = config || jsonb_build_object('input_per_m', v.i, 'output_per_m', v.o)
from (values
  ('gpt-5-nano', 0.05, 0.40),
  ('deepseek-v4.1-flash', 0.12, 0.48),
  ('glm-5.3-flash', 0.15, 0.50),
  ('gpt-6-luna', 0.10, 0.50),
  ('claude-haiku-5-5', 0.10, 0.50)
) as v(m, i, o)
where ai_models.provider_id = 'opencode' and ai_models.model_id = v.m;
