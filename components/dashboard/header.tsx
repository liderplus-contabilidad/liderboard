"use client";

import { usePathname } from "next/navigation";
import { OccupancyHotelActions } from "@/components/occupancy/occupancy-hotel-actions";
import { PayrollClientActions } from "@/components/payroll/payroll-client-actions";
import { PygClientActions } from "@/components/profit-loss/pyg-client-actions";
import { DEFAULT_MODULE, findModuleBySlug, findSubmoduleBySlug } from "@/lib/modules";

export function DashboardHeader() {
  const pathname = usePathname();
  const [slug, secondSegment] = pathname.split("/").filter(Boolean);
  const current = findModuleBySlug(slug) ?? DEFAULT_MODULE;
  // The title names a declared child ONLY. A second segment that is a route parameter
  // —`/payroll/<uuid>`, a período's detail— keeps the module's own: an identifier says nothing to
  // the reader.
  const submodule = findSubmoduleBySlug(current, secondSegment);
  const title = submodule?.title ?? current.title;
  // The entity selector is resolved by the PARENT module, so a subitem keeps its own without
  // declaring it.
  const isPyg = current.slug === "profit-loss";
  const isOccupancy = current.slug === "occupancy";
  const isPayroll = current.slug === "payroll";

  return (
    <header className="flex items-center gap-5 border-b border-border bg-surface px-7 py-4">
      <h1 className="min-w-0 truncate text-xl font-bold tracking-tight text-brand">{title}</h1>

      {/* Each module mounts its own selector over the same block: PyG lists its clients, Ocupaciones
          its hotels, Rol de Pagos its own. The three lists are different —each with its own
          database—; the only things they share are this control and the rules of a name. */}
      {isPyg && (
        <div className="ml-auto min-w-0">
          <PygClientActions />
        </div>
      )}
      {isOccupancy && (
        <div className="ml-auto min-w-0">
          <OccupancyHotelActions />
        </div>
      )}
      {isPayroll && (
        <div className="ml-auto min-w-0">
          <PayrollClientActions />
        </div>
      )}
    </header>
  );
}
