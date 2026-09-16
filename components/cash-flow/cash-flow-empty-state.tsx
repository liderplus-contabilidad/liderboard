"use client";

import { Building2, Landmark } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfigureClientButton, CreateCashFlowClientButton } from "./cash-flow-client-actions";
import { useCashFlowData } from "./cash-flow-data-provider";

/**
 * The module's empty states, in the two forms every tab shares — resolved here so no tab repeats
 * them:
 *
 * - **No empresas**: the previous step is missing; the only exit is creating the first one.
 * - **An empresa with no bank accounts**: the flow has no row to capture and no check can resolve
 *   its account, so «Configurar» is the exit. A tab that can already show something without
 *   accounts (CxP with a cartera loaded) passes `needsAccounts={false}` and renders its own body.
 *
 * Returns `null` when neither applies, which is how a tab asks «may I render?».
 */
export function CashFlowEmptyState({
  needsAccounts = true,
  children,
}: {
  needsAccounts?: boolean;
  /** What the tab shows when the empresa exists but is empty in the tab's own terms. */
  children?: ReactNode;
}) {
  const { activeClientId, accounts, ready } = useCashFlowData();

  if (!ready) {
    return <div className="px-7 py-5" aria-busy="true" />;
  }

  if (activeClientId === null) {
    return (
      <div className="flex flex-col items-center gap-4 px-7 py-16">
        <EmptyState icon={<Building2 size={22} />} className="py-0">
          <span className="text-[15px] font-bold tracking-[-0.2px] text-ink">
            Todavía no hay empresas
          </span>
        </EmptyState>
        <CreateCashFlowClientButton />
      </div>
    );
  }

  if (needsAccounts && accounts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 px-7 py-16">
        <EmptyState icon={<Landmark size={22} />} className="py-0">
          <span className="text-[15px] font-bold tracking-[-0.2px] text-ink">
            Esta empresa no tiene cuentas bancarias
          </span>
        </EmptyState>
        <ConfigureClientButton variant="primary" />
      </div>
    );
  }

  return <>{children}</>;
}
