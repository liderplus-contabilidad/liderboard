/**
 * Shared calendar labels (Spanish). Any module that lays out monthly columns should
 * pull from here rather than re-declaring the list, so month order and spelling stay
 * consistent across the app.
 */

/** Short month labels, January-first: ["Ene", …, "Dic"]. */
export const MONTHS_SHORT_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

/**
 * Full month names, index-aligned with `MONTHS_SHORT_ES`. Used where labels must be
 * unabbreviated — the PyG export header (which parse reads back, matching these names).
 */
export const MONTHS_FULL_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * `"2025-10-07"` → `"07/10/2025"`. La forma en que esta app escribe una fecha CIVIL —la de
 * ingreso de un empleado, los extremos de un período de nómina—, que es día/mes/año en Ecuador.
 *
 * `null` cuando no hay fecha o cuando no se puede leer, nunca una cadena rota: el parser del rol
 * ya deja `null` en una fecha de ingreso ilegible, pero un dato viejo o tecleado a mano puede
 * llegar mal y una pantalla no debe pintar «NaN/NaN/NaN».
 *
 * Parte la cadena en vez de construir un `Date`: `new Date("2026-03-01")` se interpreta como
 * medianoche UTC y, leída en un huso al oeste, retrocede al 28 de febrero. Un rol que empieza el
 * día anterior al que dice es un error que casi nadie mira dos veces.
 */
export function formatDayMonthYear(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) {
    return null;
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Los dos extremos de un mes, ya formateados: `monthBounds(2026, 2)` → `01/03/2026` y
 * `31/03/2026`. `monthIndex` es 0–11, como en el resto de la app.
 *
 * El último día sale de `new Date(year, monthIndex + 1, 0)`, que es el día 0 del mes siguiente
 * —o sea, el último del pedido— y por eso acierta febrero bisiesto sin una tabla de longitudes
 * ni un caso especial. Construido con el constructor LOCAL de tres argumentos, que no sufre el
 * corrimiento de huso del que se guarda `formatDayMonthYear`.
 */
export function monthBounds(year: number, monthIndex: number): { start: string; end: string } {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const month = pad2(monthIndex + 1);
  return { start: `01/${month}/${year}`, end: `${pad2(lastDay)}/${month}/${year}` };
}
