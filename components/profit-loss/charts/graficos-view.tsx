"use client";

import { useMemo } from "react";
import { SpecCard } from "@/components/ui/chart-card";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency } from "@/lib/format";
import { buildGraficosCards } from "@/lib/profit-loss/charts/cards";
import { usePygAnalytics } from "../pyg-analytics-provider";
import { usePygData } from "../pyg-data-provider";
import { PygEmptyState } from "../pyg-empty-state";

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
  const { periodName, tiles, cards } = useMemo(
    () => buildGraficosCards(context, filters),
    [context, filters],
  );

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
            value={tile.value === null ? null : formatCurrency(tile.value)}
            hint={periodName}
            sign={tile.sign}
          />
        ))}
      </div>

      {/* El orden lo declara `buildGraficosCards`; esta vista solo lo dispone — las dos del eje
          temporal a lo ancho, las dos del tramo en retícula, y la cascada cerrando con la
          historia completa. La distribución va a lo ancho porque apila hasta seis cuentas sobre
          doce columnas: a media pantalla la leyenda se come el gráfico. */}
      <SpecCard spec={cards[0]} />
      <SpecCard spec={cards[1]} />

      <div className="grid grid-cols-2 gap-4">
        <SpecCard spec={cards[2]} />
        <SpecCard spec={cards[3]} />
      </div>

      <SpecCard spec={cards[4]} />
    </div>
  );
}
