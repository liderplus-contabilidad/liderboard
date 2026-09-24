import { FilterStateProvider } from "@/components/dashboard/filter-state";
import type { ReactNode } from "react";
import { CashFlowDataProvider } from "@/components/cash-flow/cash-flow-data-provider";
import { DashboardHeader } from "@/components/dashboard/header";
import { ModuleTabProvider } from "@/components/dashboard/module-tab-state";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { OccupancyDataProvider } from "@/components/occupancy/occupancy-data-provider";
import { PayrollDataProvider } from "@/components/payroll/payroll-data-provider";
import { PygDataProvider } from "@/components/profit-loss/pyg-data-provider";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <FilterStateProvider>
      <PygDataProvider>
        <OccupancyDataProvider>
          <PayrollDataProvider>
            <CashFlowDataProvider>
              {/* The open tab lives here for the same reason the data providers do: the header paints
              the tabs and the page paints the panel, and both read the one mark. */}
              <ModuleTabProvider>
                <div className="flex h-screen overflow-hidden">
                  <DashboardSidebar />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <DashboardHeader />
                    <main className="flex-1 overflow-auto">{children}</main>
                  </div>
                </div>
              </ModuleTabProvider>
            </CashFlowDataProvider>
          </PayrollDataProvider>
        </OccupancyDataProvider>
      </PygDataProvider>
    </FilterStateProvider>
  );
}
