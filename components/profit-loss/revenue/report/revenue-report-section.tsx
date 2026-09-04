import { Chart } from "@/components/ui/chart";
import { ReportTable } from "@/components/ui/report-table";
import { cn } from "@/lib/cn";
import type { ChartCardSpec } from "@/lib/charts/types";
import { statementFit, WIDEST_FIGURE_CHARS } from "@/lib/report/page-fit";

/**
 * One section of the report: the table above, the chart below, and NEVER `ChartCard`'s «Ver como
 * tabla» switch — a printed control is a button nobody can press.
 *
 * `card` is the SAME `ChartCardSpec` the screen mounts, so the title, the table, the chart and the
 * note come from there without a second reading of the data.
 *
 * The fit is decided PER SECTION: the comparison of four years has four columns and the growth
 * against three bases has six, so one bound for the whole report would either waste the narrow ones
 * or clip the wide one.
 */
export function RevenueReportSection({
  card,
  breakBefore = false,
}: {
  card: ChartCardSpec;
  breakBefore?: boolean;
}) {
  // Measured against the LONGEST figure this table actually prints, not the default bound: here cents
  // are written over millions («$1,915,467.90», thirteen characters), and the ten-character bound of
  // an estado de resultados in whole dollars would clip the last digits with no mark at all.
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

      <ReportTable table={card.table} fit={fit} />

      {card.option && (
        <div className="print-keep rounded-[13px] border border-border bg-surface px-[18px] py-3.5">
          <Chart option={card.option} height={card.height} ariaLabel={card.title} />
        </div>
      )}

      {/* The note is what says WHICH span a percentage used, so on paper it matters more than on
          screen: whoever receives the PDF has no card beside it to check against. */}
      {card.note && <p className="text-[11.5px] leading-snug text-faint">{card.note}</p>}

      {card.warnings?.map((warning) => (
        <p key={warning} className="text-[11.5px] leading-snug text-warning">
          {warning}
        </p>
      ))}
    </section>
  );
}
