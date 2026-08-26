import { Chart } from "@/components/ui/chart";
import { cn } from "@/lib/cn";
import type { ChartCardSpec } from "@/lib/charts/types";
import { statementFit, WIDEST_FIGURE_CHARS } from "@/lib/report/page-fit";
import { SalesReportTable } from "./sales-report-table";

/**
 * Una sección del informe. Imprime las DOS lecturas a la vez —la tabla arriba, la gráfica debajo—
 * y NUNCA el interruptor «Ver como tabla / Ver como gráfica» de `ChartCard`: un control impreso es
 * un botón que nadie puede pulsar, la misma regla que ya siguen los otros dos informes.
 *
 * `card` es el MISMO `ChartCardSpec` que la pantalla monta, así que el título, la tabla, la
 * gráfica y la nota salen de ahí sin una segunda lectura de los datos.
 *
 * El encaje se decide POR SECCIÓN y no por informe, al revés que en Sueldos por Áreas: allí todas
 * las tablas tienen exactamente las mismas columnas, y aquí una tiene tres y otra doce.
 *
 * Y se dimensiona con la CIFRA MÁS LARGA que esta tabla va a imprimir, no con la cota por defecto
 * de `statementFit`: esa vale diez caracteres (`-$1,171,420`), que es lo que mide un estado de
 * resultados en dólares enteros, y aquí se escriben centavos sobre millones (`$1,446,789.21`, trece).
 * Con la cota corta la columna salía más estrecha que su propio contenido y `overflow-hidden` se
 * comía los últimos dígitos de cada importe grande —sin marca ninguna, que es lo peor que puede
 * hacer un informe con una cifra—. Contar CARACTERES es fiel porque la columna es monoespaciada,
 * que es el mismo argumento por el que `page-fit.ts` mide por cota en vez de por canvas.
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
