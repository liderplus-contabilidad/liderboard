import type { ChartTable } from "@/lib/charts/types";
import { formatDayMonthYear } from "@/lib/date";
import { working } from "@/lib/operations/model";
import type { Company, ScheduleTask } from "@/lib/operations/types";
import { taskStateLabel } from "./model";

export function agendaTable(
  companies: Company[],
  tasks: ScheduleTask[],
  today: string,
): ChartTable {
  const lookup = new Map(companies.map((c) => [c.id, working(c)]));
  return {
    columns: ["Fecha", "Período", "Responsable", "Estado", "Notas"],
    rows: tasks.map((t) => {
      const v = working(t);
      return {
        id: t.id,
        label: `${lookup.get(t.companyId)?.name ?? "Sin empresa"} · ${v.title}`,
        values: [
          formatDayMonthYear(v.dueOn) ?? "—",
          v.period,
          v.person || "—",
          taskStateLabel(v, today),
          v.notes || "—",
        ],
      };
    }),
  };
}
