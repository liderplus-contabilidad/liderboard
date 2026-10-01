import { working } from "@/lib/operations/model";
import type { Company, ScheduleTask } from "@/lib/operations/types";
import { writeWorkbook } from "@/lib/operations/workbooks";
import { taskStage } from "./model";

export function scheduleWorkbook(companies: Company[], tasks: ScheduleTask[]): ArrayBuffer {
  const lookup = new Map(companies.map((c) => [c.id, working(c)]));
  return writeWorkbook([
    {
      name: "Cronograma",
      hiddenColumns: [9, 10],
      rows: [
        [
          "Empresa",
          "RUC",
          "Grupo",
          "Tarea",
          "Fecha",
          "Período",
          "Responsable",
          "Estado",
          "Notas",
          "ID empresa",
          "ID tarea",
        ],
        ...tasks.map((t) => {
          const c = lookup.get(t.companyId),
            v = working(t);
          return [
            c?.name ?? "",
            c?.ruc ?? "",
            c?.group ?? "",
            v.title,
            v.dueOn ?? "",
            v.period,
            v.person,
            { pending: "Pendiente", doing: "En curso", done: "Hecha" }[taskStage(v)],
            v.notes,
            t.companyId,
            t.id,
          ];
        }),
      ],
    },
  ]);
}
