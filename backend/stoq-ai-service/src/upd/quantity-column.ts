import { ApiError } from '../common/api-error';

/** Converts the literal quantity cell without inferring anything from other columns. */
export function parseQuantityColumn3(text: string | null): number | null {
  if (text === null) return null;
  const trimmed = text.trim();
  if (!/^(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[,.]\d+)?$/.test(trimmed)) {
    throw new ApiError(502, 'INVALID_MODEL_RESPONSE', 'Не удалось однозначно прочитать значение графы 3 Количество (объем)');
  }
  const value = Number(trimmed.replace(/[ \u00a0\u202f]/g, '').replace(',', '.'));
  if (!Number.isFinite(value)) throw new ApiError(502, 'INVALID_MODEL_RESPONSE', 'Некорректное количество в графе 3');
  return value;
}
