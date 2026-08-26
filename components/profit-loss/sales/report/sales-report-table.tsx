import { cn } from "@/lib/cn";
import type { ChartTable } from "@/lib/charts/types";
import type { StatementFit } from "@/lib/report/page-fit";

/** Bajo cuatro columnas, el ancho extra va al nombre de la fila en vez de inflar cifras que ya se
 *  leen bien — el mismo tope que las tablas del informe de PyG. */
const MAX_COLUMN_PCT = 16;
const BASE_INDENT = 10;

/**
 * La tabla impresa de una sección, a partir del MISMO `ChartTable` que la pantalla ya construye —
 * nunca una segunda lectura de los datos.
 *
 * No reusa el `TableTwin` de `chart-card.tsx`: aquella tiene afordancias de PANTALLA —columna
 * pegajosa, `hover`, cuerpo fijo de 12 px— que en papel no significan nada, y no acepta el cuerpo
 * de letra que dicta `fit`.
 *
 * Es la SEGUNDA tabla de informe con esta forma (la otra está en `payroll/salaries/report/`), y la
 * diferencia real entre las dos es qué hacen con las filas largas. Cuando aparezca una tercera,
 * conviene plegar las tres en `components/ui/` en vez de mantener tres — la misma nota que
 * `modal.tsx` lleva sobre `ConfirmDialog`.
 */
export function SalesReportTable({ table, fit }: { table: ChartTable; fit: StatementFit }) {
  const columnCount = table.columns.length;
  const columnPct = Math.max(
    Math.min(MAX_COLUMN_PCT, 60 / Math.max(columnCount, 1)),
    (fit.columnWidth / fit.sheetWidth) * 100,
  );
  const padX = fit.cellPaddingX / 2;

  return (
    <div className="overflow-hidden rounded-[13px] border border-border bg-surface">
      <table
        className="w-full table-fixed border-collapse"
        style={{ fontSize: `${fit.fontSize}px` }}
      >
        <colgroup>
          <col style={{ width: `${Math.max(20, 100 - columnCount * columnPct)}%` }} />
          {table.columns.map((column) => (
            <col key={column} style={{ width: `${columnPct}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-surface-header">
            <th
              className="border-b border-border py-2 text-left text-[9px] font-semibold uppercase tracking-[0.5px] text-muted"
              style={{ paddingLeft: BASE_INDENT, paddingRight: padX }}
            >
              Concepto
            </th>
            {table.columns.map((column, index) => (
              <th
                key={column}
                className={cn(
                  "border-b border-border py-2 text-right text-[9px] font-semibold text-muted",
                  index > 0 && "border-l border-border-soft",
                )}
                style={{ paddingLeft: padX, paddingRight: padX }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.id}>
              <th
                scope="row"
                aria-label={row.label}
                className={cn(
                  "border-b border-border-soft py-1.5 text-left align-top",
                  row.emphasis ? "font-bold text-ink" : "font-medium text-ink-soft",
                )}
                style={{ paddingLeft: BASE_INDENT, paddingRight: padX }}
              >
                <span className="flex items-baseline gap-1.5">
                  {row.color !== undefined && (
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: row.color }}
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate">{row.label}</span>
                    {row.sublabel && (
                      <span className="block truncate font-mono text-[9px] font-normal text-faint">
                        {row.sublabel}
                      </span>
                    )}
                  </span>
                </span>
              </th>
              {row.values.map((value, index) => (
                <td
                  key={table.columns[index] ?? index}
                  className={cn(
                    "overflow-hidden whitespace-nowrap border-b border-border-soft py-1.5 text-right font-mono tabular-nums",
                    index > 0 && "border-l border-border-soft",
                    row.emphasis ? "font-bold text-ink" : "font-semibold text-ink-soft",
                  )}
                  style={{ paddingLeft: padX, paddingRight: padX }}
                >
                  {/* La RAYA de una celda sin nada que decir viaja YA ESCRITA en el `ChartTable`;
                      un `null` aquí solo puede venir de una fila más corta que sus columnas. */}
                  {value ?? "–"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
