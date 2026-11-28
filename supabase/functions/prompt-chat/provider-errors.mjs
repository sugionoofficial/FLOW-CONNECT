// Public codes only: never expose provider response bodies or credentials to clients.
export function providerError(status, message = '') {
  const text = String(message);
  if (status === 429 && /free-models-per-day|requests per day|daily.{0,30}(limit|quota)|per.day.{0,30}(limit|quota)/i.test(text)) return 'PROVIDER_DAILY_LIMIT';
  if (status === 429) return 'PROVIDER_RATE_LIMIT';
  if (status === 402 || /insufficient (credits|balance)|credit balance|payment required/i.test(text)) return 'PROVIDER_CREDITS';
  if (status === 401 || status === 403) return 'PROVIDER_AUTH';
  if (status === 404) return 'MODEL_UNAVAILABLE';
  if (/vision|image.{0,25}(not supported|unsupported)|does not support.{0,25}image/i.test(text)) return 'MODEL_NO_VISION';
  if (text === 'EMPTY_REPLY') return 'AI_EMPTY_REPLY';
  return 'PROVIDER_ERROR';
}
