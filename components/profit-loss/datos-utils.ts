/**
 * Pure derivations for the Datos table. Kept out of the components so the expensive
 * work (flattening the tree, sorting, totals) can be wrapped in `useMemo` and
 * unit-reasoned in isolation.
 */
import { formatCurrencyOrDash } from "@/lib/format";
import type { DatosRow, DatosSort } from "@/lib/profit-loss/datos-types";
import { planSummaries } from "@/lib/profit-loss/derive";

/** A tree row, flattened for rendering, with the display flags a row needs. */
export interface FlatRow {
  row: DatosRow;
  hasChildren: boolean;
  isCollapsed: boolean;
}

/** Cell/total display: app-wide currency, or an en-dash for empty/zero. */
export function formatAmount(value: number | null): string {
  return formatCurrencyOrDash(value);
}

// Sorting by the Total column needs no case of its own any more: it is an ordinary column, so
// `{ col }` reaches it like any other.
function sortValue(row: DatosRow, sort: DatosSort): number | string {
  if (sort.key === "name") {
    return row.name;
  }
  return row.cells[sort.key.col]?.value ?? 0;
}

function compareRows(a: DatosRow, b: DatosRow, sort: DatosSort): number {
  const av = sortValue(a, sort);
  const bv = sortValue(b, sort);
  const raw =
    typeof av === "string" && typeof bv === "string"
      ? av.localeCompare(bv)
      : Number(av) - Number(bv);
  return sort.dir === "asc" ? raw : -raw;
}

/**
 * Flatten rows depth-first, respecting collapsed nodes and sort. Sorting only affects
 * siblings within the same parent. Anchored summary rows close their root unless sorting
 * or filtering applies. Unanchored summaries go at the end.
 */
export function flattenSorted(
  rows: DatosRow[],
  collapsed: Set<string>,
  sort: DatosSort | null,
): FlatRow[] {
  const out: FlatRow[] = [];
  const normal = rows.filter((row) => !row.isResult);
  const summary = (row: DatosRow): FlatRow => ({ row, hasChildren: false, isCollapsed: false });
  const { byAnchor, trailing } = planSummaries(
    rows,
    sort !== null,
    new Set(normal.map((row) => row.code)),
  );

  const walk = (list: DatosRow[], top: boolean) => {
    const ordered = sort ? [...list].sort((a, b) => compareRows(a, b, sort)) : list;
    for (const row of ordered) {
      const hasChildren = Boolean(row.children?.length);
      const isCollapsed = collapsed.has(row.code);
      out.push({ row, hasChildren, isCollapsed });
      if (hasChildren && !isCollapsed && row.children) {
        walk(row.children, false);
      }
      if (top) {
        out.push(...(byAnchor.get(row.code) ?? []).map(summary));
      }
    }
  };

  walk(normal, true);
  out.push(...trailing.map(summary));
  return out;
}
