"use client";

import { usePathname } from "next/navigation";
import { useModuleTab } from "@/components/dashboard/module-tab-state";
import { MODULE_VIEWS } from "@/components/dashboard/module-views";
import { OccupancyHotelActions } from "@/components/occupancy/occupancy-hotel-actions";
import { PayrollClientActions } from "@/components/payroll/payroll-client-actions";
import { PygClientActions } from "@/components/profit-loss/pyg-client-actions";
import { TabBar } from "@/components/ui/tab-bar";
import { cn } from "@/lib/cn";
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

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-7">
      <h1 className="min-w-0 shrink-0 truncate text-xl font-bold tracking-tight text-brand">
        {title}
      </h1>

      {tabbed && <ModuleTabStrip mod={current} />}

      {/* Each module mounts its own selector over the same block: PyG lists its clients, Ocupaciones
          its hotels, Rol de Pagos its own. The three lists are different —each with its own
          database—; the only things they share are this control and the rules of a name.
          With no strip the selector alone takes the right edge; with one, the strip's export group
          is what pushes right and the selector follows it. */}
      <div className={cn("min-w-0", !tabbed && "ml-auto")}>
        {isPyg && <PygClientActions />}
        {isOccupancy && <OccupancyHotelActions />}
        {isPayroll && <PayrollClientActions />}
      </div>
    </header>
  );
}

/**
 * The module's tabs and the open tab's export control. Split out so the hook runs only where the
 * row has tabs: a subitem's page reads the same header and has none to resolve.
 */
function ModuleTabStrip({ mod }: { mod: DashboardModule }) {
  const [activeTab, setTab] = useModuleTab(mod);
  const rightSlot = MODULE_VIEWS[mod.slug]?.rightSlot?.(activeTab.id);

  return (
    <>
      <TabBar
        items={mod.tabs}
        value={activeTab.id}
        onChange={setTab}
        ariaLabel={`Vistas de ${mod.label}`}
        idPrefix={mod.slug}
        rule={false}
        className="shrink-0"
      />
      {/* The rule between export and selector exists only with something on its left: a tab
          without an export control (Ocupaciones' Gráficos) leaves the selector alone on the edge. */}
      <div
        className={cn(
          "ml-auto flex shrink-0 items-center",
          rightSlot != null && "border-r border-border-soft pr-4",
        )}
      >
        {rightSlot}
      </div>
    </>
  );
}
