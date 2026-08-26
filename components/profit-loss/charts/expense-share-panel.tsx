"use client";

import { Fragment, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { ChartCard } from "@/components/ui/chart-card";
import { Modal } from "@/components/ui/modal";
import { CHART_SECTION } from "@/lib/charts/palette";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import {
  describeAccountBreakdown,
  type AccountBreakdown,
} from "@/lib/profit-loss/charts/account-breakdown";
import {
  breakdownTable,
  horizontalBarOption,
  shareOfTotalOption,
  shareOfTotalTable,
  type ShareOfTotalRow,
} from "@/lib/profit-loss/charts/option";

/**
 * El canal de rótulos del desglose, más ancho que los 150 px del ranking porque la ventana se hizo
 * ancha justamente para esto: un nombre de cuenta real («Honorarios Profesionales
 * Laboratorio-Externos») no cabe en 150 y sale truncado, y entonces las filas solo se distinguen
 * abriendo la tabla — que es pedirle al lector el trabajo que la gráfica existe para ahorrarle.
 */
const BREAKDOWN_LABEL = 260;

/** Un tramo del camino abierto: lo que la ventana necesita para hablar de una cuenta. */
export interface AccountStep {
  code: string;
  label: string;
  value: number;
}

/**
 * UNA CUENTA DEL ANEXO, al pulsar su barra: contra qué se mide y de qué se compone.
 *
 * Se abre desde el gráfico y no desde una lista porque las dos preguntas nacen mirándolo: se ve la
 * barra más alta y lo siguiente que se quiere saber es cuánto de todo el gasto es esa barra y qué
 * la compone. Va en una ventana CENTRADA y no en el cajón lateral de la ficha, y eso lo decide la
 * forma de lo que muestra: el cajón existe para leerse JUNTO a lo que lo abrió —la ficha contra su
 * fila de la tabla—, mientras que esto se lee SOLO y se cierra enseguida, así que interrumpir y
 * apagar el fondo es lo correcto. Además el cajón caería justo encima de las barras del anexo, que
 * son anchas, y taparía la que se acaba de pulsar.
 *
 * NO repite las cifras que ya están en el gráfico de detrás: la barra que se pulsó lleva su monto
 * encima. Lo que añade son los dos TODOS contra los que ese monto se mide —lo que una barra dentro
 * de un reparto no puede decir por sí sola— y el nivel siguiente del plan de cuentas.
 *
 * **Se BAJA aquí y no en la gráfica de atrás**, que es lo que la mantiene siendo el anexo: sus
 * diecisiete filas son la hoja que el contador coteja, y sustituirlas al pulsar una costaría la
 * comparación que se estaba haciendo. El camino puede tener varios tramos —`5.5.01.02` cuelga
 * veintisiete secciones y cada una sus cuentas—, y la miga de pan de arriba es la vuelta.
 */
export function ExpenseSharePanel({
  path,
  breakdown,
  totalExpenses,
  totalRevenue,
  periodName,
  onOpen,
  onBack,
  onClose,
}: {
  /** El camino abierto, del rubro del anexo hacia dentro. El último tramo es lo que se muestra. */
  path: readonly AccountStep[];
  /** El desglose del último tramo, o `null` mientras no haya nada que repartir. */
  breakdown: AccountBreakdown | null;
  totalExpenses: number | null;
  totalRevenue: number | null;
  periodName: string;
  onOpen: (step: AccountStep) => void;
  onBack: (depth: number) => void;
  onClose: () => void;
}) {
  const current = path[path.length - 1];
  const chart = useMemo(() => {
    const rows: ShareOfTotalRow[] = [
      { id: "gastos", label: "Sobre los gastos", value: current.value, total: totalExpenses },
      { id: "ingresos", label: "Sobre los ingresos", value: current.value, total: totalRevenue },
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
  }, [current.value, totalExpenses, totalRevenue]);

  const desglose = useMemo(() => {
    if (!breakdown || breakdown.rows.length === 0) {
      return null;
    }
    // UN SOLO color, la regla del anexo: cada barra lleva su rótulo y su cifra, así que repartir
    // tonos gastaría el canal de identidad en re-decir lo que la longitud ya dice.
    const colorOf = () => CHART_SECTION.cost;
    return {
      // El canal de rótulos manda sobre el de la barra: aquí las filas son NOMBRES DE CUENTA
      // («Honorarios Profesionales Laboratorio-Externos»), no los dos rótulos cortos y conocidos
      // de «Peso en el estado», y truncados obligan a abrir la tabla para saber cuál es cuál.
      option: horizontalBarOption([...breakdown.rows], { colorOf, labelWidth: BREAKDOWN_LABEL }),
      table: breakdownTable(breakdown.all, current.label),
      note: describeAccountBreakdown(breakdown, {
        label: current.label,
        format: (value) => formatCurrency(value, { cents: true }),
      }),
      height: breakdown.rows.length * 34 + 40,
    };
  }, [breakdown, current.label]);

  return (
    <Modal
      open
      title={current.label}
      eyebrow={
        <span className="font-mono text-[11px] font-semibold text-brand">{current.code}</span>
      }
      onClose={onClose}
      width={780}
    >
      {/* La miga de pan solo aparece cuando se ha bajado: con un tramo sería un rótulo que repite
          el título. Cada tramo anterior vuelve a su nivel; el actual es texto, no un botón que no
          lleva a ninguna parte. */}
      {path.length > 1 && (
        <nav className="mb-3 flex flex-wrap items-center gap-1 text-[11.5px] leading-snug">
          {path.map((step, index) => (
            <Fragment key={step.code}>
              {index > 0 && <ChevronRight className="size-3 shrink-0 text-faintest" />}
              {index === path.length - 1 ? (
                <span className="truncate font-semibold text-ink">{step.label}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onBack(index + 1)}
                  className="truncate rounded text-muted transition-colors hover:text-brand"
                >
                  {step.label}
                </button>
              )}
            </Fragment>
          ))}
        </nav>
      )}

      {/* El rótulo NO compone el nombre del periodo: en anual `periodName` ya ES «Total» —así se
          llama la única columna de esa frecuencia— y el anexo se lee siempre en anual, así que
          «Total {periodName}» imprimía «Total Total» en el caso normal, no en un borde. El periodo
          se dice UNA vez, en el subtítulo de la tarjeta de abajo. */}
      <dl className="mb-5">
        <Metric label="Monto del periodo">{formatCurrency(current.value, { cents: true })}</Metric>
      </dl>

      <div className="flex flex-col gap-4">
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
            El tramo no trae totales contra los que medir esta cuenta.
          </p>
        )}

        {desglose ? (
          <ChartCard
            title="De qué se compone"
            subtitle={`${breakdown?.all.length} ${breakdown?.all.length === 1 ? "cuenta" : "cuentas"} · ${periodName}`}
            option={desglose.option}
            table={desglose.table}
            height={desglose.height}
            note={desglose.note}
            // Bajar es pulsar una barra, el MISMO gesto que abrió esta ventana. Una cuenta de
            // movimiento no tiene dónde entrar y no reacciona, que es lo que evita prometer un
            // nivel que no existe.
            onSelect={(index) => {
              const row = breakdown?.rows[index];
              if (row?.hasChildren) {
                onOpen({ code: row.code, label: row.label, value: row.value });
              }
            }}
          />
        ) : (
          <p className={cn("text-[11.5px] leading-snug text-faint")}>
            {breakdown === null
              ? "Esta es una cuenta de movimiento: no tiene desglose."
              : "Sus cuentas no se movieron en el tramo."}
          </p>
        )}
      </div>
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
