import { SalariesView } from "@/components/payroll/salaries/salaries-view";

/**
 * Sueldos por Áreas: a subitem of Rol de Pagos, not a module of its own. It hangs off `/payroll`
 * because it reads the períodos and the nómina of that module's ACTIVE CLIENT — the header's
 * selector is mounted by the parent module, without this page declaring anything.
 *
 * No `ModuleTabs`: like the payroll history, this view is the whole page.
 */
export default function PayrollSalariesPage() {
  return <SalariesView />;
}
