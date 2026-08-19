"use client";

import { useCallback, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpecCard } from "@/components/ui/chart-card";
import { StatTile } from "@/components/ui/stat-tile";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import { buildGraficosCards } from "@/lib/profit-loss/charts/cards";
import { usePygAnalytics } from "../pyg-analytics-provider";
import { usePygData } from "../pyg-data-provider";
import { PygEmptyState } from "../pyg-empty-state";
import { BusinessLineLegend } from "./business-line-legend";
import { ExpenseSharePanel } from "./expense-share-panel";

/**
 * Gráficos answers *how much and of what*: amounts per period, comparisons between accounts
 * and centers, composition of a total. No transformation selector — that is Análisis, and no
 * shape selector either — every card here is always bars (or the pie/ranking shape it owns).
 *
 * With an Excel loaded it shows something useful before the user marks anything, because a
 * blank panel next to a loaded file hands the reader the job of guessing what can be asked. The
 * filter bar's marks feed every card at once: the evolution card draws whatever accounts (and
 * centers) are marked, and falls back to Ingresos contra Costos y Gastos when nothing is.
 *
 * WHAT each card asks lives in `buildGraficosCards`, where it is pure and tested; what is left
 * here is where each one goes on screen. The printable report reads that same list, which is why
 * it cannot come back into this file.
 */
export function GraficosView() {
  const { dataset, filters, frequency } = usePygData();
  const { context } = usePygAnalytics();
  /**
   * Los meses del eje en los que el estado no movió nada —los que el archivo nunca trajo y los que
   * trajo en cero, que en pantalla son la misma columna vacía—. Es estado local de esta pantalla y no un
   * `PygFilters`: lo leen las cinco tarjetas de aquí y ninguna de Datos ni de Análisis, así que no
   * se guarda, no produce chip y el informe imprimible —que llama a `buildGraficosCards` por su
   * cuenta— sigue sacando el eje completo.
   */
  const [hideEmptyPeriods, setHideEmptyPeriods] = useState(false);
  /**
   * Las líneas de negocio apagadas en la leyenda de su tarjeta. Es estado local por lo mismo que el
   * interruptor de arriba: lo lee UNA tarjeta y ninguna de Datos ni de Análisis, así que no se
   * guarda, no produce chip y el informe imprimible —que llama a `buildGraficosCards` por su
   * cuenta— sigue sacando todas. Una marca de un plan que ya no está abierto se ignora al leer, así
   * que cambiar de cliente no deja nada colgando.
   */
  const [hiddenLines, setHiddenLines] = useState<readonly string[]>([]);
  const { periodName, tiles, cards, annex, emptyPeriods, lines } = useMemo(
    () => buildGraficosCards(context, filters, { hideEmptyPeriods, hiddenLines }),
    [context, filters, hideEmptyPeriods, hiddenLines],
  );
  const toggleLine = useCallback((id: string) => {
    setHiddenLines((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }, []);
  // Solo asoma en MENSUAL —un trimestre cubierto agrega tres meses y no es «un mes en 0»— y solo si
  // hay alguno que ocultar: un control que no puede hacer nada enseña a no leer el de al lado.
  // `emptyPeriods` se cuenta sobre el eje sin podar, así que el botón no se esfuma al pulsarlo.
  const canHideEmptyPeriods = frequency === "mensual" && emptyPeriods > 0;

  /**
   * El rubro cuyo peso se está mirando, por su posición en el reparto. Es un ÍNDICE y no un código
   * porque es lo que el gráfico entrega al clicar, y resolverlo aquí contra la misma lista que lo
   * dibujó es lo que impide que la ventana hable de un rubro distinto del que se pulsó.
   */
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const openCategory = openIndex === null ? undefined : annex?.categories[openIndex];

  if (!dataset) {
    return <PygEmptyState />;
  }

  return (
    <div className="flex flex-col gap-4 px-7 py-5">
      <div className="flex gap-4">
        {tiles.map((tile) => (
          <StatTile
            key={tile.id}
            label={tile.label}
            value={tile.value === null ? null : formatCurrency(tile.value, { cents: true })}
            hint={periodName}
            sign={tile.sign}
          />
        ))}
      </div>

      {canHideEmptyPeriods && (
        <div className="flex justify-end">
          {/* Mismo aspecto que el de la tarjeta de Datos, para que se lean como el mismo gesto. Va
              aquí y no en la barra de filtros porque lo leen las tarjetas de ESTA pestaña y ninguna
              de las otras dos: en la barra sería un control muerto en Datos y en Análisis. */}
          <Button
            size="sm"
            variant="secondary"
            aria-pressed={hideEmptyPeriods}
            onClick={() => setHideEmptyPeriods((current) => !current)}
            icon={hideEmptyPeriods ? <Eye size={14} /> : <EyeOff size={14} />}
            className={cn(
              "font-medium",
              hideEmptyPeriods && "border-brand/40 bg-brand-soft text-brand hover:bg-brand-soft",
            )}
          >
            {/* Encendido lleva la CUENTA de lo que quitó: aquí no hay pie de tabla donde ponerla,
                así que sin ella el eje se encogería sin decir cuánto. */}
            {hideEmptyPeriods
              ? `Mostrar ${emptyPeriods} ${emptyPeriods === 1 ? "mes" : "meses"} en 0`
              : "Ocultar meses en 0"}
          </Button>
        </div>
      )}

      {/* El orden lo declara `buildGraficosCards`; esta vista solo lo dispone, y las cinco van al
          MISMO ancho: una retícula a medias dejaba una tarjeta angosta al lado de un hueco, que se
          lee como que algo no cargó. El ranking además lo NECESITA — con quince cuentas el canal
          de rótulos son 150 px fijos, y a media pantalla se truncan casi todos los nombres.

          La ÚNICA que responde al clic es la del anexo, y solo mientras esa vista está puesta: en
          las demás una barra no tiene un «dentro» al que entrar, y un gráfico que a veces reacciona
          y a veces no enseña a no pulsarlo. */}
      {/* La leyenda de líneas cuelga de la PRIMERA tarjeta, la única que las dibuja, y se rinde
          fuera de esa vista: `lines` llega vacío y no hay nada que ofrecer. */}
      {cards.map((card, index) => (
        <SpecCard
          key={card.id}
          spec={card}
          collapsible
          {...(annex && index === 0 ? { onSelect: setOpenIndex } : {})}
          {...(index === 0 && lines.length > 0
            ? {
                footerSlot: (
                  <BusinessLineLegend lines={lines} hidden={hiddenLines} onToggle={toggleLine} />
                ),
              }
            : {})}
        />
      ))}

      {annex && openCategory && (
        <ExpenseSharePanel
          category={openCategory}
          totalExpenses={annex.totalExpenses}
          totalRevenue={annex.totalRevenue}
          periodName={periodName}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </div>
  );
}
