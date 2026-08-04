import { cn } from "@/lib/cn";
import { formatCurrency, formatPercent } from "@/lib/format";
import { sectionTone } from "@/lib/profit-loss/datos-sections";
import type { AccumulatedPeriod } from "@/lib/profit-loss/report/accumulate";
import { sharePct, variationPct } from "@/lib/profit-loss/report/accumulate";
import type { DatosGrid, DatosRow } from "@/lib/profit-loss/datos-types";
import { flattenSorted } from "../datos-utils";

const INDENT_STEP = 13;
const BASE_INDENT = 10;

/**
 * The widest a numeric column is allowed to get, in % of the table. Below four columns the extra
 * width goes to the ACCOUNT NAME instead of inflating figures that are already legible — a
 * six-level plan indents its deepest names by 75 px before the first letter.
 */
const MAX_COLUMN_PCT = 16;

/**
 * The Estado de Resultados as it prints: one accumulated column per year, then the variation
 * between the two most recent, then the weight of each account over Ingresos.
 *
 * It does NOT reuse `DatosTable`, and that is deliberate: that component is the editable grid —
 * sortable sticky headers, a pinned ficha column, per-cell edit buttons, and a
 * `max-h-[62vh] overflow-auto` scroller which on paper would print only the part that happened
 * to be visible.
 *
 * **The column axis is the whole design.** Datos and the Excel carry the twelve months, and that
 * is where a month-by-month figure gets looked up. On a page those thirteen columns leave 27 px
 * per figure once the account names have taken their share, which is not a narrow table — it is
 * digits drawn on top of each other. `accumulate.ts` collapses them to the four columns below,
 * which fit A4 vertical with roughly a third of each column to spare, and that slack is the point:
 * it is what survives a client whose figures run a digit longer than the test data's.
 *
 * The tree arrives already accumulated and pruned; nothing is decided here.
 */
export function ReportStatement({
  grid,
  periods,
  baseRow,
  notes,
  collapsed,
  hiddenAccounts,
}: {
  /** The accumulated grid: `grid.columns[i]` is `periods[i]`. */
  grid: DatosGrid;
  /** Newest year first — `[0]` is the report's period, the rest its comparatives. */
  periods: readonly AccumulatedPeriod[];
  /** Ingresos, accumulated over the same columns — the denominator of «% Ing.». */
  baseRow: DatosRow | undefined;
  /** Comparability notes from the accumulation, printed under the table. */
  notes: readonly string[];
  /** Parents folded by the report's level cap — their subtree does not print. */
  collapsed: ReadonlySet<string>;
  /** How many accounts the cap left out, said out loud under the table. */
  hiddenAccounts: number;
}) {
  // No sort — a printed statement reads in plan order. It DOES fold: the level cap is what keeps
  // a six-deep chart of accounts from arriving indented into a column too narrow for its names.
  const rows = flattenSorted(grid.rows, new Set(collapsed), null);

  // La variación existe solo con un año contra otro; con uno solo la columna no se declara, en
  // vez de dibujarse llena de rayas.
  const comparing = periods.length >= 2;
  const columnCount = periods.length + (comparing ? 1 : 0) + 1;
  const columnPct = Math.min(MAX_COLUMN_PCT, 60 / columnCount);

  if (periods.length === 0) {
    return (
      <p className="rounded-[13px] border border-border bg-surface px-4 py-6 text-[11.5px] text-muted">
        {notes[0]}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-[13px] border border-border bg-surface">
      {/*
        `table-layout: fixed` con `<colgroup>` fija el reparto: sin él cada columna reclama el
        ancho de su contenido y la última se sale del papel. Lo que NO hace por sí solo es que el
        contenido quepa —una cifra más ancha que su columna se dibuja encima de la vecina, en
        silencio—; eso lo decide el número de columnas, y por eso son cuatro.
      */}
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
              <Head key={period.year} bordered={index > 0}>
                {period.label}
              </Head>
            ))}
            {comparing && <Head bordered>Var.</Head>}
            <Head bordered>% Ing.</Head>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row }) => {
            const emphasized = row.isResult || row.level === 1;
            const current = row.cells[0]?.value ?? null;
            const previous = row.cells[1]?.value ?? null;
            return (
              <tr
                key={row.code || row.resultKind}
                className={
                  row.isResult ? "bg-surface-header" : sectionTone(row.code, row.level)?.print
                }
              >
                <th
                  scope="row"
                  className={cn(
                    "border-b border-border-soft py-1.5 pr-3 text-left align-top",
                    row.isResult ? "font-bold" : row.movement ? "font-normal" : "font-semibold",
                    emphasized ? "text-brand" : "text-ink-soft",
                  )}
                  style={{
                    paddingLeft: row.isResult
                      ? BASE_INDENT
                      : BASE_INDENT + (row.level - 1) * INDENT_STEP,
                  }}
                >
                  <span className="flex items-baseline gap-1.5">
                    {row.code && (
                      <span className="font-mono text-[9px] text-faint">{row.code}</span>
                    )}
                    <span>{row.name}</span>
                  </span>
                </th>

                {periods.map((period, index) => {
                  const value = row.cells[index]?.value ?? null;
                  return (
                    <Cell
                      key={period.year}
                      bordered={index > 0}
                      bold={Boolean(row.isResult)}
                      tone={amountTone(value, Boolean(row.isResult))}
                    >
                      {value === null || value === 0 ? "–" : formatCurrency(value)}
                    </Cell>
                  );
                })}

                {comparing && (
                  <Cell bordered bold={Boolean(row.isResult)} tone="text-ink-soft">
                    <Variation value={variationPct(current, previous)} />
                  </Cell>
                )}

                <Cell
                  bordered
                  bold={Boolean(row.isResult)}
                  tone={row.isResult ? "text-ink" : "text-ink-soft"}
                >
                  {share(current, baseRow?.cells[0]?.value ?? null)}
                </Cell>
              </tr>
            );
          })}
        </tbody>
      </table>

      {(notes.length > 0 || hiddenAccounts > 0) && (
        <div className="space-y-1 border-t border-border-soft bg-surface-header px-3 py-2 text-[9.5px] text-faint">
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
          {hiddenAccounts > 0 && (
            <p>
              Se muestra la estructura hasta el nivel elegido; {hiddenAccounts}{" "}
              {hiddenAccounts === 1 ? "cuenta de detalle queda" : "cuentas de detalle quedan"}{" "}
              fuera. El Excel las trae todas.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Head({ children, bordered }: { children: React.ReactNode; bordered?: boolean }) {
  return (
    <th
      className={cn(
        "border-b border-border px-2.5 py-2 text-right text-[9px] font-semibold text-muted",
        bordered && "border-l border-border-soft",
      )}
    >
      {children}
    </th>
  );
}

function Cell({
  children,
  bordered,
  bold,
  tone,
}: {
  children: React.ReactNode;
  bordered?: boolean;
  bold?: boolean;
  tone: string;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap border-b border-border-soft px-2.5 py-1.5 text-right font-mono tabular-nums",
        bordered && "border-l border-border-soft",
        bold ? "font-bold" : "font-semibold",
        tone,
      )}
    >
      {children}
    </td>
  );
}

/**
 * A variation reads as DIRECTION, not as good news: expenses growing is an increase, and painting
 * it `positive` green would tell the reader the opposite of what happened. So the glyph carries
 * the sign — never colour alone, which is the module's rule everywhere — and the ink stays
 * neutral, leaving `negative` red for what it means in a statement: an amount below zero.
 */
function Variation({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-zero">–</span>;
  }
  return (
    <span className="whitespace-nowrap">
      <span aria-hidden="true">{value >= 0 ? "▲" : "▼"}</span> {formatPercent(Math.abs(value), 1)}
    </span>
  );
}

/** The weight over Ingresos, or the `zero` dash — never «0.0 %», a number nobody computed. */
function share(value: number | null, base: number | null) {
  const pct = sharePct(value, base);
  return pct === null ? <span className="text-zero">–</span> : formatPercent(pct);
}

/** Negative is the SIGN of the value, and it is why red appears here at all. */
function amountTone(value: number | null, isResult: boolean): string {
  if (value !== null && value < 0) {
    return "text-negative";
  }
  if (value === null || value === 0) {
    return "text-zero";
  }
  return isResult ? "text-ink" : "text-ink-soft";
}
