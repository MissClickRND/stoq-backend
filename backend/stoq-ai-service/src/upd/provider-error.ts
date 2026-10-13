import OpenAI from 'openai';
import { ApiError } from '../common/api-error';

export function mapProviderError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError) return new ApiError(504, 'OPENROUTER_TIMEOUT', 'Превышено время ожидания OpenRouter');
  if (error instanceof OpenAI.APIConnectionError) return new ApiError(503, 'OPENROUTER_CONNECTION_ERROR', 'Не удалось соединиться с OpenRouter');
  if (error instanceof OpenAI.APIError) {
    if (error.status === 402) return new ApiError(503, 'OPENROUTER_BILLING_ERROR', 'OpenRouter отклонил запрос из-за баланса или лимита расходов (402). Пополните OpenRouter Credits или проверьте лимиты ключа');
    if (error.status === 401) return new ApiError(503, 'OPENROUTER_AUTHENTICATION_ERROR', 'OpenRouter отклонил авторизацию (401). Проверьте API-ключ, проект и разрешения');
    if (error.status === 403) {
      if (error.code === 'unsupported_country_region_territory') {
        return new ApiError(503, 'OPENROUTER_REGION_UNSUPPORTED', 'OpenRouter запретил запрос из неподдерживаемой страны или региона (403)');
      }
      return new ApiError(503, 'OPENROUTER_ACCESS_DENIED', 'OpenRouter запретил доступ (403). Проверьте права проекта и поддерживаемый регион');
    }
    if (error.status === 404) {
      return new ApiError(503, 'OPENROUTER_MODEL_UNAVAILABLE', 'Настроенная модель OpenRouter не найдена или недоступна проекту (404). Проверьте OPENROUTER_MODEL');
    }
    if (error.status === 429) {
      const billingCodes = ['credit_balance_exhausted', 'insufficient_quota', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded'];
      if (billingCodes.includes(error.code ?? '') || error.type === 'insufficient_quota') {
        return new ApiError(503, 'OPENROUTER_BILLING_ERROR', 'OpenRouter отклонил запрос из-за баланса, квоты или лимита расходов (429). Проверьте Billing и Limits');
      }
      return new ApiError(503, 'OPENROUTER_RATE_LIMIT', 'OpenRouter ограничил частоту запросов (429). Повторите позже');
    }
    return new ApiError(502, 'OPENROUTER_UPSTREAM_ERROR', 'Ошибка OpenRouter; проверьте модель, параметры и доступность API');
  }
  return new ApiError(502, 'OPENROUTER_UNEXPECTED_ERROR', 'Не удалось обработать ответ OpenRouter');
}
