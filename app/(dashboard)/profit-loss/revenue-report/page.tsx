import { RevenueView } from "@/components/profit-loss/revenue/revenue-view";

/**
 * Reportería de ingresos: a subitem of Pérdidas y Ganancias, not a module of its own. It hangs off
 * `/profit-loss` because what it reads IS that module's data — the raíz 4 of its active client's
 * estado de resultados — and the header's client selector is mounted by the parent, without this page
 * declaring anything.
 *
 * No `ModuleTabs`: like Ventas por servicio and Sueldos por Áreas, this view is the whole page.
 */
export default function ProfitLossRevenueReportPage() {
  return <RevenueView />;
}
