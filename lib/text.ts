/** Shared label normalization kept free of workbook/parser dependencies. */
export function normalizeLabel(value: string | number | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export function compactLabel(value: string | number | null): string {
  return normalizeLabel(value).replace(/\s+/g, " ");
}
