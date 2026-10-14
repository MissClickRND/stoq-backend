export function parseDurationMs(value: string): number {
  const v = value.trim().toLowerCase();

  // число без суффикса считаем секундами (как часто бывает в libs)
  if (/^\d+$/.test(v)) return Number(v) * 1000;

  const m = v.match(/^(\d+)\s*(ms|s|m|h|d)$/);
  if (!m) throw new Error(`Invalid duration: "${value}"`);

  const n = Number(m[1]);
  const unit = m[2];

  const mult: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return n * mult[unit];
}
