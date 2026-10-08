import { formatDayMonthYear } from "./date";

/** Add separators without inventing missing digits or changing an impossible calendar date. */
export function formatDateDraft(text: string): string {
  const clean = text.trim();
  const iso = parseDateInput(clean);
  if (iso) return formatDayMonthYear(iso)!;
  // Preserve separators typed by hand, including short days/months and incomplete years.
  if (/^\d{1,2}\/\d{0,2}(?:\/\d{0,4})?$/.test(clean)) return clean;
  if (!/^[\d/]*$/.test(clean)) return clean;
  const digits = clean.replaceAll("/", "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
}

/** A civil date typed as day/month/year or pasted as ISO. Reject rollover and ambiguous years. */
export function parseDateInput(text: string): string | null {
  const clean = text.trim();
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(clean);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (!local && !iso) return null;
  const [year, month, day] = local
    ? [Number(local[3]), Number(local[2]), Number(local[1])]
    : [Number(iso![1]), Number(iso![2]), Number(iso![3])];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    year < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
