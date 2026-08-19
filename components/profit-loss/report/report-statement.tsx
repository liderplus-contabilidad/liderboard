import { cn } from "@/lib/cn";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { EntityLogo } from "@/lib/logos";
import { columnHeaderLabel } from "@/lib/profit-loss/datos-columns";
import { sectionTone } from "@/lib/profit-loss/datos-sections";
import { sharePct, variationPct } from "@/lib/profit-loss/report/accumulate";
import type { StatementFit } from "@/lib/report/page-fit";
import type { DatosGrid, DatosRow } from "@/lib/profit-loss/datos-types";
import { flattenSorted } from "../datos-utils";

const INDENT_STEP = 13;
const BASE_INDENT = 10;

/**
 * El alto del logo en la banda de una tabla, en px. Es el alto de la cabecera y ni uno más: un
 * membrete que engorda la banda le quita al estado las filas que la página tenía justas.
 */
const BAND_LOGO_HEIGHT = 22;

/**
 * Un logo de la banda, o nada. El ancho lo pone la proporción del propio logo (`w-auto` con el alto
 * fijo), que es el mismo `contain` que `fitLogoBox` aplica en el Excel y en el PDF del comprobante
 * — aquí lo resuelve el navegador porque hay caja donde resolverlo.
 *
 * El `alt` va VACÍO: el nombre del cliente está en la portada y el del centro, en el rótulo de al
 * lado, así que un texto alternativo lo repetiría en voz alta.
 */
function ReportBandLogo({ logo }: { logo: EntityLogo | undefined }) {
  if (!logo) {
    return null;
  }
  return (
    // Sin `next/image`: la fuente es un data URL de IndexedDB, no un asset con ruta.
    // oxlint-disable-next-line next/no-img-element
    <img
      src={logo.dataUrl}
      alt=""
      width={logo.width}
      height={logo.height}
      style={{ height: BAND_LOGO_HEIGHT }}
      className="w-auto shrink-0 object-contain"
    />
  );
}

/**
 * The widest a numeric column is allowed to get, in % of the table. Below four columns the extra
 * width goes to the ACCOUNT NAME instead of inflating figures that are already legible — a
 * six-level plan indents its deepest names by 75 px before the first letter.
 */
const MAX_COLUMN_PCT = 16;

/**
 * The Estado de Resultados as it prints.
 *
 * It does NOT reuse `DatosTable`, and that is deliberate: that component is the editable grid —
 * sortable sticky headers, a pinned ficha column, per-cell edit buttons, and a
 * `max-h-[62vh] overflow-auto` scroller which on paper would print only the part that happened
 * to be visible.
 *
 * **The column axis is the whole design, and it is not decided here.** The report reads in two
 * ways, and both arrive already built in `grid.columns`:
 *
 * - ACUMULADO (the default): `accumulate.ts` collapses the periods into one column per year, plus
 *   the variation between the two most recent and the weight over Ingresos. Four columns that fit
 *   A4 vertical with a third of each to spare, and that slack is what survives a client whose
 *   figures run a digit longer than the test data's.
 * - COMO EN DATOS: the very columns the screen shows. Thirteen of them do not fit vertical — which
 *   is why `statementFit` sends that reading to its own landscape sheet — and `Var.`/`% Ing.` are
 *   not printed there: a variation between two months is not what that header means, and they are
 *   the two columns that are in the way once there are thirteen.
 *
 * The tree arrives already pruned; nothing is decided here.
 */
export function ReportStatement({
  grid,
  baseRow,
  notes,
  collapsed,
  hiddenAccounts,
  fit,
  showComparison,
  trimmed,
  caption,
  captionColor,
  logo,
  centerLogo,
  breakBefore,
}: {
  /** The grid to print, with its columns already resolved to the chosen reading. */
  grid: DatosGrid;
  /** Ingresos over the same columns — the denominator of «% Ing.». */
  baseRow: DatosRow | undefined;
  /** Comparability notes from the accumulation, printed under the table. */
  notes: readonly string[];
  /** Parents folded by the report's level cap — their subtree does not print. */
  collapsed: ReadonlySet<string>;
  /** How many accounts the cap left out, said out loud under the table. */
  hiddenAccounts: number;
  /** Which sheet this table is on, and how big its type may be. */
  fit: StatementFit;
  /** Whether `Var.` and `% Ing.` are printed — only over accumulated years. */
  showComparison: boolean;
  /** Whether the «Periodo» filter trimmed the axis, which is what renames a Total. */
  trimmed: boolean;
  /** Qué centro es esta tabla; `null` cuando el informe imprime uno solo y ya lo dice la portada. */
  caption?: string | null;
  /** El punto de color del centro en el selector, para que la tabla se reconozca desde la barra. */
  captionColor?: string | undefined;
  /**
   * El logo del CLIENTE, a la izquierda de la banda. Se repite en cada tabla y no solo en la
   * portada porque cada una abre su propia página: separada de la portada, una hoja suelta tiene
   * que poder decir de quién es.
   */
  logo?: EntityLogo | undefined;
  /** El del CENTRO que esta tabla es, a la derecha. El Consolidado no tiene. */
  centerLogo?: EntityLogo | undefined;
  /** Abre página. Lo pone quien coloca las tablas, no la tabla: la primera no abre ninguna. */
  breakBefore?: boolean;
}) {
  // No sort — a printed statement reads in plan order. It DOES fold: the level cap is what keeps
  // a six-deep chart of accounts from arriving indented into a column too narrow for its names.
  const rows = flattenSorted(grid.rows, new Set(collapsed), null);

  // La variación existe solo con un año contra otro; con uno solo la columna no se declara, en
  // vez de dibujarse llena de rayas.
  const comparing = showComparison && grid.columns.length >= 2;
  const extra = showComparison ? (comparing ? 2 : 1) : 0;
  const columnCount = grid.columns.length + extra;
  const columnPct = Math.max(
    Math.min(MAX_COLUMN_PCT, 60 / columnCount),
    (fit.columnWidth / fit.sheetWidth) * 100,
  );
  const padX = fit.cellPaddingX / 2;

  if (grid.columns.length === 0) {
    return (
      <p className="rounded-[13px] border border-border bg-surface px-4 py-6 text-[11.5px] text-muted">
        {notes[0] ?? "No hay nada cargado dentro de lo que muestra el informe."}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[13px] border border-border bg-surface",
        breakBefore && "print-page-break",
      )}
    >
      {(caption || logo || centerLogo) && (
        <header className="flex items-center gap-2 border-b border-border bg-surface-header px-3 py-2">
          <ReportBandLogo logo={logo} />
          {captionColor && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: captionColor }}
            />
          )}
          <span className="text-[12.5px] font-semibold text-ink">{caption}</span>
          {/* Empuja al logo del centro contra el borde derecho aunque el rótulo sea corto: es la
              mitad derecha de la banda, no algo que siga al texto. */}
          <span className="ml-auto flex shrink-0 items-center">
            <ReportBandLogo logo={centerLogo} />
          </span>
        </header>
      )}
      {/*
        `table-layout: fixed` con `<colgroup>` fija el reparto: sin él cada columna reclama el
        ancho de su contenido y la última se sale del papel. Lo que NO hace por sí solo es que el
        contenido quepa —una cifra más ancha que su columna se dibuja encima de la vecina, en
        silencio—; eso lo decide `statementFit`, y por eso el ancho y la tipografía vienen de ahí.
      */}
      <table
        className="w-full table-fixed border-collapse"
        style={{ fontSize: `${fit.fontSize}px` }}
      >
        <colgroup>
          <col style={{ width: `${100 - columnCount * columnPct}%` }} />
          {Array.from({ length: columnCount }, (_, index) => (
            <col key={index} style={{ width: `${columnPct}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-surface-header">
            <th
              className="border-b border-border py-2 text-left text-[9px] font-semibold uppercase tracking-[0.5px] text-muted"
              style={{ paddingLeft: padX, paddingRight: padX }}
            >
              Cuenta
            </th>
            {grid.columns.map((column, index) => (
              <Head key={index} bordered={index > 0} padX={padX}>
                {columnHeaderLabel(column, trimmed)}
              </Head>
            ))}
            {comparing && (
              <Head bordered padX={padX}>
                Var.
              </Head>
            )}
            {showComparison && (
              <Head bordered padX={padX}>
                % Ing.
              </Head>
            )}
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

                {grid.columns.map((_, index) => {
                  const value = row.cells[index]?.value ?? null;
                  return (
                    <Cell
                      key={index}
                      bordered={index > 0}
                      bold={Boolean(row.isResult)}
                      tone={amountTone(value, Boolean(row.isResult))}
                      padX={padX}
                    >
                      {value === null || value === 0 ? "–" : formatCurrency(value)}
                    </Cell>
                  );
                })}

                {comparing && (
                  <Cell bordered bold={Boolean(row.isResult)} tone="text-ink-soft" padX={padX}>
                    <Variation value={variationPct(current, previous)} />
                  </Cell>
                )}

                {showComparison && (
                  <Cell
                    bordered
                    bold={Boolean(row.isResult)}
                    tone={row.isResult ? "text-ink" : "text-ink-soft"}
                    padX={padX}
                  >
                    {share(current, baseRow?.cells[0]?.value ?? null)}
                  </Cell>
                )}
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

function Head({
  children,
  bordered,
  padX,
}: {
  children: React.ReactNode;
  bordered?: boolean;
  padX: number;
}) {
  return (
    <th
      className={cn(
        "border-b border-border py-2 text-right text-[9px] font-semibold text-muted",
        bordered && "border-l border-border-soft",
      )}
      style={{ paddingLeft: padX, paddingRight: padX }}
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
  padX,
}: {
  children: React.ReactNode;
  bordered?: boolean;
  bold?: boolean;
  tone: string;
  padX: number;
}) {
  return (
    <td
      className={cn(
        "overflow-hidden whitespace-nowrap border-b border-border-soft py-1.5 text-right font-mono tabular-nums",
        bordered && "border-l border-border-soft",
        bold ? "font-bold" : "font-semibold",
        tone,
      )}
      style={{ paddingLeft: padX, paddingRight: padX }}
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
