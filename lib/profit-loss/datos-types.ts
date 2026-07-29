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

/**
 * Which summary a result row is. An unsegmented statement closes on a single `ejercicio` row
 * («Utilidad o Pérdida»); segmenting adds the other three.
 */
export type DatosResultKind = "operacional" | "no-operacional" | "total-gastos" | "ejercicio";

/**
 * One column of the grid. The type deliberately speaks in COLUMNS rather than in months: a grid
 * can show several years side by side, and each column has to say which year it belongs to.
 *
 * The year's Total is a column like any other — not a case outside the list. With two years in
 * one row, a total computed over every cell would add 2025 to 2026; carrying the year on the
 * column makes each total its own year's by construction, and removes the separate `showTotal`
 * flag and `"total"` sort key that the single-year model needed.
 */
export type DatosColumn =
  | {
      kind: "period";
      /** Header label: "Ene" with one year visible, "Ene 25" with several. */
      label: string;
      year: number;
      /** Period index within its own year — what an edit writes against. */
      index: number;
    }
  | {
      kind: "total";
      /** "Total" with one year visible, "Total 25" with several. */
      label: string;
      year: number;
    };

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
  /** A summary row, styled and pinned apart from accounts. */
  isResult?: boolean;
  /** Which summary it is (result rows only) — also its React key, since they carry no code. */
  resultKind?: DatosResultKind;
  /**
   * The root whose block this summary closes in the natural order, e.g. "5" for the operating
   * result. Undefined closes the grid. Honored only while unsorted: sorting reorders the roots
   * themselves, so "after section 5" stops meaning anything and every summary falls to the end.
   */
  anchorCode?: string;
  /** One cell per column; `cells[i]` aligns to `DatosGrid.columns[i]`, total columns included. */
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
  /**
   * Every column, in order: each year's periods followed by that year's Total, years ascending.
   * A year contributes no Total column in annual granularity, where the year IS one column.
   */
  columns: DatosColumn[];
  rows: DatosRow[];
}

/** Which column the table is sorted by: the name column, or a data-column index. */
export type DatosSortKey = "name" | { col: number };
export type DatosSortDir = "asc" | "desc";

export interface DatosSort {
  key: DatosSortKey;
  dir: DatosSortDir;
}
