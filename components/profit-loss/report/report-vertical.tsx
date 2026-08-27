import { ReportBand } from "@/components/ui/report-layer";
import { cn } from "@/lib/cn";
import { formatPercent, formatPoints } from "@/lib/format";
import { sectionTone } from "@/lib/profit-loss/datos-sections";
import type { AccumulatedPeriod } from "@/lib/profit-loss/report/accumulate";
import { sharePct } from "@/lib/profit-loss/report/accumulate";
import type { EntityLogo } from "@/lib/logos";
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
  logo,
  centerLogo,
}: {
  /** The accumulated, pruned grid — the same one the statement prints. */
  grid: DatosGrid;
  /** Newest year first; `grid.columns[i]` is `periods[i]`. */
  periods: readonly AccumulatedPeriod[];
  /** The account every row divides by; `undefined` when it is not in this center. */
  baseRow: DatosRow | undefined;
  centerName: string;
  collapsed: ReadonlySet<string>;
  /** The CLIENT's logo, on the left of the band — the same letterhead the statement carries. */
  logo?: EntityLogo | undefined;
  /** The one of the CENTER this table is, on the right. The Consolidado has none. */
  centerLogo?: EntityLogo | undefined;
}) {
  const rows = flattenSorted(grid.rows, new Set(collapsed), null).filter(
    // The summary rows are not accounts of the plan: «Utilidad» over Ingresos is the margin, which
    // the statement already closes with. Here it would be superfluous and would break the reading of
    // a breakdown that adds up to 100 %.
    ({ row }) => !row.isResult,
  );

  const comparing = periods.length >= 2;
  const columnCount = periods.length + (comparing ? 1 : 0);
  const columnPct = Math.min(MAX_COLUMN_PCT, 60 / Math.max(columnCount, 1));

  const caption = baseRow
    ? `% sobre ${baseRow.code} ${baseRow.name} · ${centerName}`
    : `${centerName}`;

  // A column whose base is worth nothing has no percentages, and that is said ONCE and not once for
  // each of the dozens of accounts left showing a dash.
  const blind = periods.filter((_, index) => {
    const base = baseRow?.cells[index]?.value ?? null;
    return base === null || base === 0;
  });

  return (
    <div className="print-keep overflow-hidden rounded-[13px] border border-border bg-surface">
      <ReportBand
        {...(logo ? { leftLogo: logo } : {})}
        {...(centerLogo ? { rightLogo: centerLogo } : {})}
        className="border-b border-border bg-surface-header px-[18px] py-2.5 text-center"
      >
        <h3 className="text-[13px] font-semibold text-ink">Análisis vertical</h3>
        <p className="mt-0.5 text-[11px] text-muted">{caption}</p>
      </ReportBand>

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

      {/* The same declared split as the statement, for the same reason: the width is fixed by the
          colgroup and the number of columns is what makes the content fit inside it. */}
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
                  // The name goes here too because the cell composes it from two pieces.
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
                    {/* Percentage points, not the variation of the percentage: going from 20 % to
                        25 % is +5 p.p., and calling it «+25 %» is two different readings of the same
                        move in a table that is already full of percentages. */}
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
