"use client";

import { usePathname } from "next/navigation";
import { CashFlowClientActions } from "@/components/cash-flow/cash-flow-client-actions";
import { useModuleTab } from "@/components/dashboard/module-tab-state";
import { MODULE_VIEWS } from "@/components/dashboard/module-views";
import { OccupancyHotelActions } from "@/components/occupancy/occupancy-hotel-actions";
import { PayrollClientActions } from "@/components/payroll/payroll-client-actions";
import { PygClientActions } from "@/components/profit-loss/pyg-client-actions";
import { TabBar } from "@/components/ui/tab-bar";
import {
  DEFAULT_MODULE,
  findModuleBySlug,
  findSubmoduleBySlug,
  type DashboardModule,
} from "@/lib/modules";

/**
 * The shell's one row: title · the module's tabs · its export control · the entity selector.
 *
 * Tabs and export used to sit on a strip of their own below this one, which with the filter bar
 * made three rows before the first figure. Here everything sits on ONE vertical centre —title, tabs,
 * export and selector— and the open tab's underline runs under its own label, not on the row's
 * border: a strip dropped to the border read as a step down from the title.
 *
 * On a subitem's page (`/profit-loss/sales`) and on a module without tabs (Rol de Pagos) the row is
 * the title and the selector, nothing between them.
 *
 * The export control and the selector are ONE right-hand group, and the row may WRAP: when what the
 * module puts on it does not fit —Cuentas por Pagar's five tabs and three controls on a 1366 px
 * laptop with the sidebar open— that group drops under the tabs, still right-aligned, instead of
 * the selector leaving the screen. On every wider row nothing changes: the group sits on the same
 * centre line as before.
 */
export function DashboardHeader() {
  const pathname = usePathname();
  const [slug, secondSegment] = pathname.split("/").filter(Boolean);
  const current = findModuleBySlug(slug) ?? DEFAULT_MODULE;
  // The title names a declared child ONLY. A second segment that is a route parameter
  // —`/payroll/<uuid>`, a período's detail— keeps the module's own: an identifier says nothing to
  // the reader.
  const submodule = findSubmoduleBySlug(current, secondSegment);
  const title = submodule?.title ?? current.title;
  // The tabs belong to the module's OWN page: a subitem is a whole page and a período's detail has
  // its own strip inside.
  const tabbed = secondSegment === undefined && current.tabs.length > 0;
  // The entity selector is resolved by the PARENT module, so a subitem keeps its own without
  // declaring it.
  const isPyg = current.slug === "profit-loss";
  const isOccupancy = current.slug === "occupancy";
  const isPayroll = current.slug === "payroll";
  const isCashFlow = current.slug === "cash-flow";

  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface px-7 py-2">
      <h1 className="min-w-0 shrink-0 truncate text-xl font-bold tracking-tight text-brand">
        {title}
      </h1>

      {tabbed && <ModuleTabs mod={current} />}

      {/* Each module mounts its own selector over the same block: PyG lists its clients, Ocupaciones
          its hotels, Rol de Pagos its own. The three lists are different —each with its own
          database—; the only things they share are this control and the rules of a name.
          The export control of the open tab sits in the same group, so the two travel together
          when the row wraps. */}
      <div className="ml-auto flex min-w-0 items-center">
        {tabbed && <ModuleExport mod={current} />}
        <div className="min-w-0">
          {isPyg && <PygClientActions />}
          {isOccupancy && <OccupancyHotelActions />}
          {isPayroll && <PayrollClientActions />}
          {isCashFlow && <CashFlowClientActions />}
        </div>
      </div>
    </header>
  );
}

/**
 * The module's tabs. Split out so the hook runs only where the row has tabs: a subitem's page reads
 * the same header and has none to resolve.
 */
function ModuleTabs({ mod }: { mod: DashboardModule }) {
  const [activeTab, setTab] = useModuleTab(mod);
  return (
    <TabBar
      items={mod.tabs}
      value={activeTab.id}
      onChange={setTab}
      ariaLabel={`Vistas de ${mod.label}`}
      idPrefix={mod.slug}
      rule={false}
      className="shrink-0"
    />
  );
}

/** The open tab's export control, on the selector's left. */
function ModuleExport({ mod }: { mod: DashboardModule }) {
  const [activeTab] = useModuleTab(mod);
  const rightSlot = MODULE_VIEWS[mod.slug]?.rightSlot?.(activeTab.id);
  if (rightSlot == null) {
    return null;
  }
  // The rule between export and selector exists only with something on its left: a tab without an
  // export control (Ocupaciones' Gráficos) leaves the selector alone on the edge.
  return (
    <div className="mr-4 flex shrink-0 items-center border-r border-border-soft pr-4">
      {rightSlot}
    </div>
  );
}
