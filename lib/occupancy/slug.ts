/** Channel and cost-center ids share this rule, so a hand-typed name and a parsed one match. */
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
