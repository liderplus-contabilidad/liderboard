import { formatCurrency, formatPercent } from "@/lib/format";
import type { CentersAnnex, CentersAnnexRow } from "@/lib/profit-loss/report/types";
import { cn } from "@/lib/cn";

/** What the center's name takes; the rest is split evenly among the concepts. */
const NAME_COLUMN_PCT = 30;

/**
 * The by-centers annex, TRANSPOSED against the shape `buildCentersAnnex` returns: a center is a
 * ROW here and a concept is a column.
 *
 * The builder is right to speak in centers-as-columns — that is the question it answers, «cuánto
 * aporta cada centro» — and it stays untouched. What transposing buys is a table whose width no
 * longer depends on the workspace: with centers across the top, a client with four of them and a
 * client with twelve get tables 380 px and 1.100 px wide, and only one of those is a page. The
 * concepts are four or five and always will be (the fifth appears only once the statement is
 * segmented), so downward is where the variable dimension belongs — a page has more room going
 * down than across, and centers are a list.
 */
export function ReportCentersAnnex({ annex }: { annex: CentersAnnex }) {
  const columnPct = (100 - NAME_COLUMN_PCT) / annex.rows.length;

  return (
    <div className="print-keep overflow-hidden rounded-[13px] border border-border bg-surface">
      <table className="w-full table-fixed border-collapse text-[10.5px]">
        <colgroup>
          <col style={{ width: `${NAME_COLUMN_PCT}%` }} />
          {annex.rows.map((concept) => (
            <col key={concept.id} style={{ width: `${columnPct}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-surface-header">
            <th className="border-b border-border px-2.5 py-2 text-left text-[9px] font-semibold uppercase tracking-[0.5px] text-muted">
              Centro de costo
            </th>
            {annex.rows.map((concept) => (
              <th
                key={concept.id}
                className={cn(
                  "border-b border-border px-2.5 py-2 text-right text-[9px] font-semibold text-muted",
                  concept.kind === "result" && "border-l border-border-soft text-ink",
                )}
              >
                {concept.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {annex.columns.map((center, index) => {
            // The Consolidado closes the table: the rule separates it from the centers it sums.
            const isTotal = index === annex.columns.length - 1;
            return (
              <tr key={center.id} className={isTotal ? "bg-surface-header" : undefined}>
                <th
                  scope="row"
                  className={cn(
                    "border-b border-border-faint px-2.5 py-1.5 text-left",
                    isTotal
                      ? "border-t border-border font-bold text-ink"
                      : "font-medium text-ink-soft",
                  )}
                >
                  {center.name}
                </th>
                {annex.rows.map((concept) => (
                  <td
                    key={concept.id}
                    className={cn(
                      "whitespace-nowrap border-b border-border-faint px-2.5 py-1.5 text-right font-mono tabular-nums",
                      concept.kind === "result" && "border-l border-border-soft",
                      isTotal ? "border-t border-border font-bold" : undefined,
                      tone(concept.values[index] ?? null, concept.kind, isTotal),
                    )}
                  >
                    {formatCell(concept.values[index] ?? null, concept.kind)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** An uncovered center is an em dash, never a zero — the same rule the whole module follows. */
function formatCell(value: number | null, kind: CentersAnnexRow["kind"]): string {
  if (value === null) {
    return "–";
  }
  return kind === "percent" ? formatPercent(value) : formatCurrency(value);
}

/** Negative is the SIGN of the value — the one thing that earns red on this page. */
function tone(value: number | null, kind: CentersAnnexRow["kind"], isTotal: boolean): string {
  if (value === null) {
    return "text-zero";
  }
  if (value < 0) {
    return "text-negative";
  }
  return kind === "result" || isTotal ? "text-ink" : "text-ink-soft";
}
