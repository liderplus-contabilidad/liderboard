import { SalariesView } from "@/components/payroll/salaries/salaries-view";

/**
 * Sueldos por Áreas: subitem de Rol de Pagos, no módulo propio. Cuelga de `/payroll` porque lee los
 * períodos y la nómina del CLIENTE ACTIVO de ese módulo — el selector del header se monta por el
 * módulo padre, sin que esta página declare nada.
 *
 * Sin `ModuleTabs`: como el historial de nómina, esta vista es la página entera.
 */
export default function PayrollSalariesPage() {
  return <SalariesView />;
}
