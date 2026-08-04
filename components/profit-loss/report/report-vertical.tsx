import { cn } from "@/lib/cn";
import { formatPercent, formatPoints } from "@/lib/format";
import { sectionTone } from "@/lib/profit-loss/datos-sections";
import type { AccumulatedPeriod } from "@/lib/profit-loss/report/accumulate";
import { sharePct } from "@/lib/profit-loss/report/accumulate";
import type { DatosGrid, DatosRow } from "@/lib/profit-loss/datos-types";
import { flattenSorted } from "../datos-utils";

const INDENT_STEP = 13;
const BASE_INDENT = 10;
const MAX_COLUMN_PCT = 16;

/**
 * The vertical analysis as it prints: what each account weighs over a base, on the SAME axis the
 * statement uses — the accumulated period, and the year before it.
 *
 * It reads the accumulated grid rather than `buildVerticalAnalysis`, which the Análisis tab keeps
 * using: the screen answers «cómo cambia el peso mes a mes», which needs a column per period and
 * has a scroller to hold them. The page answers «cómo se reparte el periodo, y en qué cambió
 * respecto al año pasado», which is three columns. Both divide with the same rule — `sharePct`,
 * `null` on a base that is missing or zero, never a `0.0 %` nobody computed.
 *
 * The section is only declared when it has something the statement's own «% Ing.» column does not
 * (see `reportSections`), so this table never repeats a column already printed two pages down.
 *
 * The base account is a SENTENCE here rather than a dropdown. On screen it names what one card
 * divides by and can be changed; on paper it is the fact that makes every percentage readable, so
 * it goes in the caption where it cannot be missed.
 */
export function ReportVertical({
  grid,
  periods,
  baseRow,
  centerName,
  collapsed,
}: {
  /** The accumulated, pruned grid — the same one the statement prints. */
  grid: DatosGrid;
  /** Newest year first; `grid.columns[i]` is `periods[i]`. */
  periods: readonly AccumulatedPeriod[];
  /** The account every row divides by; `undefined` when it is not in this center. */
  baseRow: DatosRow | undefined;
  centerName: string;
  collapsed: ReadonlySet<string>;
}) {
  const rows = flattenSorted(grid.rows, new Set(collapsed), null).filter(
    // Las filas de resumen no son cuentas del plan: «Utilidad» sobre Ingresos es el margen, que
    // ya cierra el estado. Aquí sobraría y rompería la lectura de un reparto que suma 100 %.
    ({ row }) => !row.isResult,
  );

  const comparing = periods.length >= 2;
  const columnCount = periods.length + (comparing ? 1 : 0);
  const columnPct = Math.min(MAX_COLUMN_PCT, 60 / Math.max(columnCount, 1));

  const caption = baseRow
    ? `% sobre ${baseRow.code} ${baseRow.name} · ${centerName}`
    : `${centerName}`;

  // Una columna cuya base no vale nada no tiene porcentajes, y eso se dice UNA vez y no una por
  // cada una de las decenas de cuentas que quedan en raya.
  const blind = periods.filter((_, index) => {
    const base = baseRow?.cells[index]?.value ?? null;
    return base === null || base === 0;
  });

  return (
    <div className="print-keep overflow-hidden rounded-[13px] border border-border bg-surface">
      <header className="border-b border-border bg-surface-header px-[18px] py-2.5">
        <h3 className="text-[13px] font-semibold text-ink">Análisis vertical</h3>
        <p className="mt-0.5 text-[11px] text-muted">{caption}</p>
      </header>

      {(!baseRow || blind.length > 0) && (
        <ul className="border-b border-border-soft bg-surface-muted px-[18px] py-2 text-[10.5px] text-warning">
          {!baseRow && (
            <li>La cuenta base no está en este centro; la tabla queda sin porcentajes.</li>
          )}
          {blind.map((period) => (
            <li key={period.year}>
              La cuenta base no tuvo movimiento en {period.spanLabel} {period.year}: esa columna
              queda sin porcentaje.
            </li>
          ))}
        </ul>
      )}

      {/* Mismo reparto declarado que el estado, por la misma razón: el ancho lo fija el colgroup
          y el número de columnas es lo que hace que el contenido quepa dentro de él. */}
      <table className="w-full table-fixed border-collapse text-[10.5px]">
        <colgroup>
          <col style={{ width: `${100 - columnCount * columnPct}%` }} />
          {Array.from({ length: columnCount }, (_, index) => (
            <col key={index} style={{ width: `${columnPct}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-surface-header">
            <th className="border-b border-border px-2.5 py-2 text-left text-[9px] font-semibold uppercase tracking-[0.5px] text-muted">
              Cuenta
            </th>
            {periods.map((period, index) => (
              <th
                key={period.year}
                className={cn(
                  "whitespace-nowrap border-b border-border px-2.5 py-2 text-right text-[9px] font-semibold text-muted",
                  index > 0 && "border-l border-border-soft",
                )}
              >
                {period.spanLabel} {period.year}
              </th>
            ))}
            {comparing && (
              <th className="whitespace-nowrap border-b border-l border-border-soft px-2.5 py-2 text-right text-[9px] font-semibold text-muted">
                Var. p.p.
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row }) => {
            const shares = periods.map((_, index) =>
              sharePct(row.cells[index]?.value ?? null, baseRow?.cells[index]?.value ?? null),
            );
            const isBase = row.code === baseRow?.code;
            return (
              <tr key={row.code} className={sectionTone(row.code, row.level)?.print}>
                <th
                  scope="row"
                  // El nombre va también aquí porque la celda lo compone de dos trozos.
                  aria-label={`${row.code} ${row.name}`}
                  className={cn(
                    "border-b border-border-faint py-1.5 pr-3 text-left align-top",
                    isBase || row.level === 1 ? "font-semibold text-ink" : "font-normal",
                  )}
                  style={{ paddingLeft: BASE_INDENT + (row.level - 1) * INDENT_STEP }}
                >
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-mono text-[9px] text-faint">{row.code}</span>
                    <span className={isBase ? undefined : "text-ink-soft"}>{row.name}</span>
                  </span>
                </th>
                {shares.map((value, index) => (
                  <Cell key={index} bordered={index > 0}>
                    {value === null ? null : formatPercent(value)}
                  </Cell>
                ))}
                {comparing && (
                  <Cell bordered>
                    {/* Puntos porcentuales, no la variación del porcentaje: pasar del 20 % al
                        25 % es +5 p.p., y llamarlo «+25 %» son dos lecturas distintas del mismo
                        movimiento en una tabla que ya está llena de porcentajes. */}
                    {points(shares[0] ?? null, shares[1] ?? null)}
                  </Cell>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ children, bordered }: { children: React.ReactNode; bordered?: boolean }) {
  return (
    <td
      className={cn(
        "whitespace-nowrap border-b border-border-faint px-2.5 py-1.5 text-right font-mono tabular-nums",
        bordered && "border-l border-border-faint",
        children === null ? "text-zero" : "text-ink",
      )}
    >
      {children ?? "–"}
    </td>
  );
}

/** The gap in percentage points, with the glyph that carries its sign. */
function points(current: number | null, previous: number | null) {
  if (current === null || previous === null) {
    return null;
  }
  const delta = current - previous;
  return (
    <span className="whitespace-nowrap text-ink-soft">
      <span aria-hidden="true">{delta >= 0 ? "▲" : "▼"}</span> {formatPoints(Math.abs(delta))}
    </span>
  );
}
