import { PersonnelCostView } from "@/components/profit-loss/personnel-cost/personnel-cost-view";

/**
 * Análisis costo personal: a subitem of Pérdidas y Ganancias, not a module of its own. It hangs off
 * `/profit-loss` because what it reads IS that module's data — twenty-one accounts of its active
 * client's estado de resultados and the ventas of its raíz 4 — and the header's client selector is
 * mounted by the parent, without this page declaring anything.
 *
 * No `ModuleTabs`: its two tabs are its own (see `personnel-cost-view.tsx`), because the registry's
 * subitems carry no tabs and this is the only one that needs a pair.
 */
export default function ProfitLossPersonnelCostPage() {
  return <PersonnelCostView />;
}
