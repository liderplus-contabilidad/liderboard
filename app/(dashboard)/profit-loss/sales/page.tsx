import { SalesView } from "@/components/profit-loss/sales/sales-view";

/**
 * Ventas por servicio: subitem de Pérdidas y Ganancias, no módulo propio. Cuelga de
 * `/profit-loss` porque lee el CLIENTE ACTIVO de ese módulo — el selector del header lo monta el
 * módulo padre, sin que esta página declare nada.
 *
 * Sin `ModuleTabs`: como Sueldos por Áreas, esta vista es la página entera.
 */
export default function ProfitLossSalesPage() {
  return <SalesView />;
}
