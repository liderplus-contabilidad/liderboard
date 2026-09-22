/**
 * The set's one PRNG: mulberry32 over a string seed, with no `Math.random` and no dates, so
 * regenerating produces the same bytes and a test can pin figures. Shared by the PyG generator and
 * the Cuentas por Pagar one — two copies would be two sets of figures for one seed.
 */

function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 over the seed's hash: [0, 1). */
export function rand(seed: string): number {
  let t = (hashString(seed) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(seed: string, min: number, max: number): number {
  return min + rand(seed) * (max - min);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Excel's date serial (days since 30/12/1899), which is how the books store their dates. */
export function excelSerial(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month, day) - Date.UTC(1899, 11, 30)) / 86_400_000);
}
