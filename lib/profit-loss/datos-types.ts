/**
 * Shared shapes for the Pérdidas y Ganancias › Datos view. These are the contract the
 * table renders against; the Excel loader (built later) produces the same shapes, so
 * wiring real data in is a matter of swapping the source, not touching the components.
 */

/** One month/account intersection. `value` is `null` when the account has no entry (including
 * a month the by-centers workspace never loaded — distinct from a loaded month valued at 0). */
export interface DatosCell {
  value: number | null;
  comment?: string;
  /** True when the shown value comes from a user value-adjustment, not the file — leaf
   * (movement) cells only; a parent's rollup and the Total column never carry this. */
  edited?: boolean;
}

/** A row in the account tree. Rows nest via `children`; leaves omit it. */
export interface DatosRow {
  /** Account code, e.g. "4.1.01". Unique within a grid — used as the React key. */
  code: string;
  name: string;
  /** Tree depth, 1..n. Drives the name-column indent. */
  level: number;
  /**
   * True for a movement (leaf) account — the only kind whose value is editable. Comes from
   * the source tree, NOT the displayed one, so a level-capped parent shown without children
   * stays comment-only. Parents and the result row are false.
   */
  movement?: boolean;
  /** The "Utilidad o Pérdida" summary row, styled and pinned apart from accounts. */
  isResult?: boolean;
  /** One cell per month; `cells[i]` aligns to `DatosGrid.months[i]`. */
  cells: DatosCell[];
  children?: DatosRow[];
}

/** One editable grid — the whole company, or a single cost center. */
export interface DatosGrid {
  /** Cost-center id, or "default" when the data has no cost centers. */
  id: string;
  title: string;
  /** Header dot color (cost-center palette); omitted for the default grid. */
  dotColor?: string;
  /** Result badge shown top-right of the card header. */
  utilidad?: { label: string; positive: boolean };
  /** Month labels, in order, e.g. ["Ene", …, "Dic"]. */
  months: string[];
  rows: DatosRow[];
}

/** Which column the table is sorted by: the name column, or a data-column index. */
export type DatosSortKey = "name" | { col: number } | "total";
export type DatosSortDir = "asc" | "desc";

export interface DatosSort {
  key: DatosSortKey;
  dir: DatosSortDir;
}
