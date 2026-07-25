/**
 * Channel ids and cost-center ids share this one rule, so a name typed by hand and the same
 * name read from a workbook resolve to the same record.
 */

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Stable id, so renaming keeps the data behind it. */
export function slugify(name: string): string {
  return normalize(name).replace(/ /g, "-");
}
