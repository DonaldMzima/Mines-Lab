/** Timezone-aware ISO time; preserve microsecond ordering in existing saved data. */
export function awareTimestamp(value: unknown, label: string): bigint {
  if (typeof value !== "string") throw new Error(`${label} must be an ISO timestamp.`);
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new Error(`${label} must be an ISO timestamp with a timezone.`);
  const [, year, month, day, hour, minute, second, fraction = "", zone] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const zoneParts = zone === "Z" ? [0, 0] : zone.slice(1).split(":").map(Number);
  const milliseconds = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${zone}`);
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1] || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || zoneParts[0] > 23 || zoneParts[1] > 59 || !Number.isFinite(milliseconds)) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
  return BigInt(milliseconds) * BigInt(1000) + BigInt(fraction.padEnd(6, "0"));
}

