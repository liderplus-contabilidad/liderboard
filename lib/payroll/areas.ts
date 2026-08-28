/**
 * The universe of ÁREAS an employee's form offers.
 *
 * It is the union of two things, and both are needed:
 *
 *   - **The standard ones**, in the order HOTEL BOUTIQUE CULTURA MANOR's rol lists them. Without
 *     them, the first employee of a freshly created client would have no option to pick: an empty
 *     período has nothing to derive an area from.
 *   - **The ones the período already brings.** The parser writes the area VERBATIM from the sheet's
 *     block (`rol-general-grid.ts`), so a client can have «MANTENIMIENTO» or «SPA» without this list
 *     knowing about it. If the form only offered the five standard ones, adding someone from that
 *     area would force filing them under another — and the area is the block the rol groups them in
 *     and the journal entry sums them under, so picking wrong is not cosmetic.
 *
 * It is therefore an OPEN list presented as a closed one: the standard set is the floor, the loaded
 * nómina is what widens it. What it does NOT do is invent a new area from the form; that is what
 * loading the file is for, which is where the real ones come from.
 */

/** The five areas of the real rol, in the order its `GENERAL` sheet stacks them. */
export const STANDARD_PAYROLL_AREAS: readonly string[] = [
  "ADMINISTRACION",
  "HOSPEDAJE",
  "RESTAURANTE",
  "COCINA",
  "VENTAS",
];

/** The key that decides whether two areas are the same: with no spare whitespace and ignoring case,
 *  so « cocina » does not open a second block next to «COCINA».
 *
 *  It is exported because there is a SECOND consumer —Sueldos por Áreas' grid, which crosses the area
 *  marked in the bar with the one each record declares— and a second definition of «same area» could
 *  drift from this one: it would be enough for one to trim spaces and the other not for an area to
 *  fall outside its own row with nothing giving it away. */
export function areaKey(area: string): string {
  return area.trim().toUpperCase();
}

/**
 * The eligible areas: the standard ones first —in the rol's order, which is how they are read— and
 * behind them the período's own, alphabetically. The alphabetical order is deliberate: taking them in
 * the order they appear in the nómina would make the list reorder itself on loading another month.
 */
export function areaOptions(lines: readonly { area: string }[]): string[] {
  const seen = new Set(STANDARD_PAYROLL_AREAS.map(areaKey));
  const extra = new Map<string, string>();

  for (const line of lines) {
    const trimmed = line.area.trim();
    if (trimmed === "" || seen.has(areaKey(trimmed))) {
      continue;
    }
    // The first spelling that appears is the one offered; the following ones are the same area.
    if (!extra.has(areaKey(trimmed))) {
      extra.set(areaKey(trimmed), trimmed);
    }
  }

  return [...STANDARD_PAYROLL_AREAS, ...[...extra.values()].sort((a, b) => a.localeCompare(b))];
}
