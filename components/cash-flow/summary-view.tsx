"use client";

import { useMemo } from "react";
import { SpecCard } from "@/components/ui/chart-card";
import { StatTile } from "@/components/ui/stat-tile";
import { money } from "@/lib/cash-flow/derive";
import {
  agingTimelineCard,
  balanceByAccountCard,
  bankHistoryCard,
  outstandingChecksCard,
  paymentCalendarCard,
  supplierCard,
} from "@/lib/cash-flow/summary";
import { formatDayMonthYear } from "@/lib/date";
import { useCashFlowData } from "./cash-flow-data-provider";
import { CashFlowEmptyState } from "./cash-flow-empty-state";

/**
 * The first card takes the whole row; after it, cards pair up two per row. A card left alone on
 * the last row —an odd count after the first, or a partner the data did not answer— takes the
 * whole row too: half a row beside an empty rectangle reads as something missing.
 */
function spansRow(cards: { height: number }[], index: number): boolean {
  return index === 0 || (index === cards.length - 1 && index % 2 === 1);
}

function rowHeight(cards: { height: number }[], index: number): number {
  if (spansRow(cards, index)) {
    return cards[index].height;
  }
  const first = index % 2 === 1 ? index : index - 1;
  return Math.max(cards[first].height, cards[first + 1]?.height ?? 0);
}

/**
 * Resumen: five tiles and the cards of `lib/cash-flow/summary.ts`, all read off the SAME
 * `deriveFlow` the Flujo tab paints and the same aging the CxP tab lists, at the cut date. A card
 * whose question the open data cannot answer is not drawn (the builder returns `null`), so an
 * empresa with one account and no checks sees the three that speak to it and no empty rectangle.
 * Nothing here is stored and nothing is exported.
 */
export function SummaryView() {
  const { activeClientId, derived, scopedPayables, centers, accounts, checks, flows, asOf } =
    useCashFlowData();
  const hasChecks = checks.length > 0;
  const cards = useMemo(
    () =>
      [
        agingTimelineCard(scopedPayables, asOf),
        paymentCalendarCard(scopedPayables, asOf),
        supplierCard(scopedPayables),
        balanceByAccountCard(derived, centers),
        outstandingChecksCard(derived, centers, hasChecks),
        bankHistoryCard(flows, accounts, asOf),
      ].filter((card) => card !== null),
    [scopedPayables, asOf, derived, centers, hasChecks, flows, accounts],
  );
  const { totals } = derived;

  if (!activeClientId) {
    return <CashFlowEmptyState />;
  }

  // Readable with a cartera alone: none of the cards needs an account to say something.
  return (
    <CashFlowEmptyState needsAccounts={false}>
      <div className="flex flex-col gap-4 px-7 py-5">
        <div className="flex gap-3">
          <StatTile
            label="Total bancos"
            value={money(totals.bankTotal)}
            hint={`Al ${formatDayMonthYear(asOf)} · saldo + ingresos + sobregiro`}
          />
          {hasChecks && (
            <StatTile
              label="Cheques no cobrados"
              value={money(totals.outstanding)}
              hint="Girados y sin cobrar a la fecha"
            />
          )}
          <StatTile
            label="Urgente"
            value={money(totals.urgent)}
            hint="Marcado urgente en Cuentas por pagar"
          />
          <StatTile label="Pendiente" value={money(totals.pending)} hint="Marcado pendiente" />
          <StatTile
            label={totals.remaining < 0 ? "Saldo faltante" : "Saldo sobrante"}
            value={money(Math.abs(totals.remaining))}
            hint="Total bancos − cheques − marcados"
            sign={totals.remaining < 0 ? "negativo" : "positivo"}
          />
        </div>
        {cards.length === 0 ? (
          <p className="rounded-[13px] border border-border bg-surface px-4 py-6 text-center text-[12.5px] text-faint">
            Sin cartera abierta ni pagos marcados no hay nada que dibujar: carga una cartera en
            Cuentas por pagar.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {cards.map((card, index) => (
              <div key={card.id} className={spansRow(cards, index) ? "col-span-2" : undefined}>
                {/* Two cards on one row share the taller one's height, so the row's bottom edges
                    line up whatever each card asked for. */}
                <SpecCard spec={{ ...card, height: rowHeight(cards, index) }} expandable />
              </div>
            ))}
          </div>
        )}
      </div>
    </CashFlowEmptyState>
  );
}
