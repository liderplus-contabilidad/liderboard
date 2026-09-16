"use client";

import { useMemo } from "react";
import { SpecCard } from "@/components/ui/chart-card";
import { StatTile } from "@/components/ui/stat-tile";
import { money } from "@/lib/cash-flow/derive";
import { agingCard, balanceByAccountCard, supplierCard } from "@/lib/cash-flow/summary";
import { formatDayMonthYear } from "@/lib/date";
import { useCashFlowData } from "./cash-flow-data-provider";
import { CashFlowEmptyState } from "./cash-flow-empty-state";

/**
 * Resumen: five tiles and three cards, all read off the SAME `deriveFlow` the Flujo tab paints and
 * the same aging the CxP tab lists, at the cut date. Nothing here is stored and nothing is exported:
 * it is the reading, and the other three tabs are where it is acted on.
 */
export function SummaryView() {
  const { activeClientId, derived, scopedPayables, centers, checks, asOf } = useCashFlowData();
  const cards = useMemo(
    () => [
      balanceByAccountCard(derived, centers),
      agingCard(scopedPayables, asOf),
      supplierCard(scopedPayables),
    ],
    [derived, centers, scopedPayables, asOf],
  );
  const { totals } = derived;

  if (!activeClientId) {
    return <CashFlowEmptyState />;
  }

  // Readable with a cartera alone: the aging and the supplier cards need no account, and the
  // balance card says so itself when there is none.
  return (
    <CashFlowEmptyState needsAccounts={false}>
      <div className="flex flex-col gap-4 px-7 py-5">
        <div className="flex gap-3">
          <StatTile
            label="Total bancos"
            value={money(totals.bankTotal)}
            hint={`Al ${formatDayMonthYear(asOf)} · saldo + ingresos + sobregiro`}
          />
          {checks.length > 0 && (
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
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <SpecCard spec={cards[0]} />
          </div>
          <SpecCard spec={cards[1]} />
          <SpecCard spec={cards[2]} />
        </div>
      </div>
    </CashFlowEmptyState>
  );
}
