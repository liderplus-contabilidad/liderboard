import type { ReactNode } from "react";
import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { OccupancyDataProvider } from "@/components/occupancy/occupancy-data-provider";
import { PygDataProvider } from "@/components/profit-loss/pyg-data-provider";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <PygDataProvider>
      <OccupancyDataProvider>
        <div className="flex h-screen overflow-hidden">
          <DashboardSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <DashboardHeader />
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
        </div>
      </OccupancyDataProvider>
    </PygDataProvider>
  );
}
