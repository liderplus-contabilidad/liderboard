import { SalesView } from "@/components/profit-loss/sales/sales-view";

/**
 * Ventas por servicio: a subitem of Pérdidas y Ganancias, not a module of its own. It hangs off
 * `/profit-loss` because it reads that module's ACTIVE CLIENT — the header's selector is mounted by
 * the parent module, without this page declaring anything.
 *
 * No `ModuleTabs`: like Sueldos por Áreas, this view is the whole page.
 */
export default function ProfitLossSalesPage() {
  return <SalesView />;
}
