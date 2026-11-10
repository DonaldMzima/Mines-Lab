export type OddsFormat = "decimal" | "fractional" | "american";
/** Format must come from an explicit source contract, never from the value. */
export function normalizeOdds(value: unknown, format: OddsFormat, source: string) {
  if (!source.trim() || !["decimal", "fractional", "american"].includes(format)) throw new Error("An explicit odds format and source are required.");
  if (typeof value !== "number" && typeof value !== "string") throw new Error("Invalid quoted odds.");
  const text = String(value).trim();
  let decimal: number;
  if (format === "fractional") {
    const fraction = text.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (fraction) { if (Number(fraction[2]) <= 0) throw new Error("Invalid denominator."); decimal = 1 + Number(fraction[1]) / Number(fraction[2]); }
    else { if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error("Invalid fractional quote."); decimal = 1 + Number(text); }
  } else {
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) throw new Error("Invalid odds quote.");
    const number = Number(text);
    if (format === "american" && (!Number.isInteger(number) || Math.abs(number) < 100)) throw new Error("Invalid American quote.");
    decimal = format === "decimal" ? number : number > 0 ? 1 + number / 100 : 1 + 100 / Math.abs(number);
  }
  if (!Number.isFinite(decimal) || decimal < 1.01 || decimal > 1000) throw new Error("Unsupported decimal price.");
  return { decimalOdds: decimal, originalOdds: { value, format, source } };
}
