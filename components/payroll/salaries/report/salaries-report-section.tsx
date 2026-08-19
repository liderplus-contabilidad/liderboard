import { Chart } from "@/components/ui/chart";
import { cn } from "@/lib/cn";
import type { ChartCardSpec } from "@/lib/charts/types";
import type { StatementFit } from "@/lib/report/page-fit";
import { SalariesReportTable } from "./salaries-report-table";

/**
 * Una sección del informe: el consolidado, o el detalle de un área. Imprime las DOS lecturas a la
 * vez —la tabla arriba, la gráfica debajo— y nunca el interruptor «Ver como tabla / Ver como
 * gráfica» de `ChartCard`: un control impreso es un botón que nadie puede pulsar.
 *
 * `card` es el MISMO `ChartCardSpec` que `SalariesView` monta en pantalla — el título, la tabla y
 * la gráfica salen de ahí sin ninguna segunda lectura del grid.
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
