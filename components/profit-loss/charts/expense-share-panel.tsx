"use client";

import { useMemo } from "react";
import { ChartCard } from "@/components/ui/chart-card";
import { Modal } from "@/components/ui/modal";
import { CHART_SECTION } from "@/lib/charts/palette";
import { formatCurrency } from "@/lib/format";
import type { ExpenseCategory } from "@/lib/profit-loss/charts/expense-distribution";
import {
  shareOfTotalOption,
  shareOfTotalTable,
  type ShareOfTotalRow,
} from "@/lib/profit-loss/charts/option";

/**
 * El peso de UN rubro del anexo, al pulsar su barra.
 *
 * Se abre desde el gráfico y no desde una lista porque la pregunta nace mirándolo: se ve la barra
 * más alta y lo siguiente que se quiere saber es cuánto de todo el gasto —y de todo el ingreso— es
 * esa barra. Va en una ventana CENTRADA y no en el cajón lateral de la ficha, y eso lo decide la
 * forma de lo que muestra: el cajón existe para leerse JUNTO a lo que lo abrió —la ficha contra su
 * fila de la tabla—, mientras que esto se lee SOLO y se cierra enseguida, así que interrumpir y
 * apagar el fondo es lo correcto. Además el cajón caería justo encima de las barras del anexo, que
 * son anchas, y taparía la que se acaba de pulsar.
 *
 * NO repite las cifras que ya están en el gráfico de detrás: la barra que se pulsó ya lleva su
 * monto encima. Lo que esta ventana añade son los dos TODOS contra los que ese monto se mide, que
 * es justo lo que una barra dentro de un reparto no puede decir por sí sola.
 */
export function ExpenseSharePanel({
  category,
  totalExpenses,
  totalRevenue,
  periodName,
  onClose,
}: {
  category: ExpenseCategory;
  totalExpenses: number | null;
  totalRevenue: number | null;
  periodName: string;
  onClose: () => void;
}) {
  const chart = useMemo(() => {
    const rows: ShareOfTotalRow[] = [
      { id: "gastos", label: "Sobre los gastos", value: category.value, total: totalExpenses },
      { id: "ingresos", label: "Sobre los ingresos", value: category.value, total: totalRevenue },
    ];
    const drawable = rows.filter((row) => row.total !== null && row.total !== 0);
    if (drawable.length === 0) {
      return null;
    }
    // El color lo pone el BLOQUE contra el que se mide y no el rubro: es lo que dice de un vistazo
    // cuál de las dos barras habla del gasto y cuál del ingreso, la regla de `CHART_SECTION`.
    const colorOf = (id: string) => (id === "ingresos" ? CHART_SECTION.income : CHART_SECTION.cost);
    return {
      option: shareOfTotalOption(drawable, { colorOf }),
      table: shareOfTotalTable(drawable, { colorOf }),
      rows: drawable.length,
    };
  }, [category.value, totalExpenses, totalRevenue]);

  return (
    <Modal
      open
      title={category.label}
      eyebrow={
        <span className="font-mono text-[11px] font-semibold text-brand">{category.code}</span>
      }
      onClose={onClose}
      width={470}
    >
      {/* El rótulo NO compone el nombre del periodo: en anual `periodName` ya ES «Total» —así se
          llama la única columna de esa frecuencia— y el anexo se lee siempre en anual, así que
          «Total {periodName}» imprimía «Total Total» en el caso normal, no en un borde. El periodo
          se dice UNA vez, en el subtítulo de la tarjeta de abajo. */}
      <dl className="mb-5">
        <Metric label="Monto del periodo">{formatCurrency(category.value, { cents: true })}</Metric>
      </dl>

      {chart ? (
        <ChartCard
          title="Peso en el estado"
          subtitle={periodName}
          option={chart.option}
          table={chart.table}
          height={chart.rows * 46 + 24}
          tableToggle={false}
        />
      ) : (
        <p className="text-[11.5px] leading-snug text-faint">
          El tramo no trae totales contra los que medir este rubro.
        </p>
      )}
    </Modal>
  );
}

/** La misma línea rótulo/valor de la ficha de cuenta; `<dl>` porque es exactamente ese par. */
function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-faint py-2.5">
      <dt className="min-w-0 text-[12.5px] leading-snug text-muted">{label}</dt>
      <dd className="shrink-0 font-mono text-[13px] tabular-nums text-ink">{children}</dd>
    </div>
  );
}
