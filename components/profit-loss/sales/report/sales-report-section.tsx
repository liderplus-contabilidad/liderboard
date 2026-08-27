import { Chart } from "@/components/ui/chart";
import { cn } from "@/lib/cn";
import type { ChartCardSpec } from "@/lib/charts/types";
import { statementFit, WIDEST_FIGURE_CHARS } from "@/lib/report/page-fit";
import { SalesReportTable } from "./sales-report-table";

/**
 * One section of the report. It prints BOTH readings at once —the table above, the chart below— and
 * NEVER `ChartCard`'s «Ver como tabla / Ver como gráfica» switch: a printed control is a button
 * nobody can press, the same rule the other two reports already follow.
 *
 * `card` is the SAME `ChartCardSpec` the screen mounts, so the title, the table, the chart and the
 * note come from there without a second reading of the data.
 *
 * The fit is decided PER SECTION and not per report, unlike in Sueldos por Áreas: there every table
 * has exactly the same columns, and here one has three and another twelve.
 *
 * And it is sized by the LONGEST FIGURE this table is going to print, not by `statementFit`'s default
 * bound: that one is worth ten characters (`-$1,171,420`), which is what an estado de resultados in
 * whole dollars measures, and here cents are written over millions (`$1,446,789.21`, thirteen). With
 * the short bound the column came out narrower than its own content and `overflow-hidden` ate the
 * last digits of every large amount —with no mark at all, which is the worst thing a report can do to
 * a figure—. Counting CHARACTERS is faithful because the column is monospaced, which is the same
 * argument by which `page-fit.ts` measures by bound instead of by canvas.
 */
export function SalesReportSection({
  card,
  breakBefore = false,
}: {
  card: ChartCardSpec;
  breakBefore?: boolean;
}) {
  const widest = Math.max(
    WIDEST_FIGURE_CHARS,
    ...card.table.rows.flatMap((row) => row.values.map((value) => (value ?? "").length)),
  );
  const fit = statementFit(card.table.columns.length, widest);

  return (
    <section className={cn("print-section flex flex-col gap-4", breakBefore && "print-page-break")}>
      <header className="border-b border-border pb-2.5">
        <h2 className="text-[17px] font-semibold text-ink">{card.title}</h2>
        {card.subtitle && <p className="mt-0.5 text-[12px] text-muted">{card.subtitle}</p>}
      </header>

      <SalesReportTable table={card.table} fit={fit} />

      {card.option && (
        <div className="print-keep rounded-[13px] border border-border bg-surface px-[18px] py-3.5">
          <Chart option={card.option} height={card.height} ariaLabel={card.title} />
        </div>
      )}

      {card.note && <p className="text-[11.5px] leading-snug text-faint">{card.note}</p>}
    </section>
  );
}
