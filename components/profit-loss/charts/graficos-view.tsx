"use client";

import { useMemo, useState } from "react";
import { SpecCard } from "@/components/ui/chart-card";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency } from "@/lib/format";
import { buildGraficosCards } from "@/lib/profit-loss/charts/cards";
import { usePygAnalytics } from "../pyg-analytics-provider";
import { usePygData } from "../pyg-data-provider";
import { PygEmptyState } from "../pyg-empty-state";
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
  const { dataset, filters } = usePygData();
  const { context } = usePygAnalytics();
  const { periodName, tiles, cards, annex } = useMemo(
    () => buildGraficosCards(context, filters),
    [context, filters],
  );

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

      {/* El orden lo declara `buildGraficosCards`; esta vista solo lo dispone, y las cinco van al
          MISMO ancho: una retícula a medias dejaba una tarjeta angosta al lado de un hueco, que se
          lee como que algo no cargó. El ranking además lo NECESITA — con quince cuentas el canal
          de rótulos son 150 px fijos, y a media pantalla se truncan casi todos los nombres.

          La ÚNICA que responde al clic es la del anexo, y solo mientras esa vista está puesta: en
          las demás una barra no tiene un «dentro» al que entrar, y un gráfico que a veces reacciona
          y a veces no enseña a no pulsarlo. */}
      {cards.map((card, index) => (
        <SpecCard
          key={card.id}
          spec={card}
          {...(annex && index === 0 ? { onSelect: setOpenIndex } : {})}
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
