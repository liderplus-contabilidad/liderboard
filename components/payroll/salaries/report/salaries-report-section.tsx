import { Chart } from "@/components/ui/chart";
import { cn } from "@/lib/cn";
import type { ChartCardSpec } from "@/lib/charts/types";
import type { StatementFit } from "@/lib/report/page-fit";
import { SalariesReportTable } from "./salaries-report-table";

/**
 * One section of the report: the consolidado, or one area's detail. It prints BOTH readings at once
 * —the table above, the chart below— and never `ChartCard`'s «Ver como tabla / Ver como gráfica»
 * switch: a printed control is a button nobody can press.
 *
 * `card` is the SAME `ChartCardSpec` `SalariesView` mounts on screen — the title, the table and the
 * chart come from there without any second reading of the grid.
 */
export function SalariesReportSection({
  card,
  fit,
  breakBefore,
}: {
  card: ChartCardSpec;
  fit: StatementFit;
  breakBefore: boolean;
}) {
  return (
    <section className={cn("print-section flex flex-col gap-4", breakBefore && "print-page-break")}>
      <header className="border-b border-border pb-2.5">
        <h2 className="text-[17px] font-semibold text-ink">{card.title}</h2>
        {card.subtitle && <p className="mt-0.5 text-[12px] text-muted">{card.subtitle}</p>}
      </header>

      <SalariesReportTable table={card.table} fit={fit} />

      {card.option && (
        <div className="print-keep rounded-[13px] border border-border bg-surface px-[18px] py-3.5">
          <Chart option={card.option} height={card.height} ariaLabel={card.title} />
        </div>
      )}

      {card.note && <p className="text-[11.5px] leading-snug text-faint">{card.note}</p>}
    </section>
  );
}
