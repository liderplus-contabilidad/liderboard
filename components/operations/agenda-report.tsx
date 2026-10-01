"use client";

import { ReportBand, ReportLayer, ReportSheet } from "@/components/ui/report-layer";
import { ReportTable } from "@/components/ui/report-table";
import { statementFit } from "@/lib/report/page-fit";
import { agendaTable } from "@/lib/schedule/report";
import { monthLabel } from "@/lib/schedule/calendar";
import { useOperations } from "./operations-provider";

export function AgendaReport({ onClose }: { onClose: () => void }) {
  const ops = useOperations();
  const table = agendaTable(ops.companies, ops.filteredTasks, ops.today);
  const fit = statementFit(table.columns.length, 22);
  const scope =
    ops.scheduleView === "calendar"
      ? monthLabel(ops.calendarMonth)
      : ops.period === "*"
        ? "Todos los períodos"
        : ops.period;
  return (
    <ReportLayer
      fileName={`Cronograma-${ops.scheduleView === "calendar" ? ops.calendarMonth : ops.period}`}
      onClose={onClose}
    >
      <ReportSheet landscape={fit.orientation === "landscape"}>
        <ReportBand>
          <h1 className="text-[20px] font-semibold text-ink">Cronograma</h1>
          <p className="mt-2 text-[13px] text-muted">{scope}</p>
        </ReportBand>
        <ReportTable table={table} fit={fit} wrapText />
      </ReportSheet>
    </ReportLayer>
  );
}
