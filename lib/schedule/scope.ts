import { working, searchText } from "@/lib/operations/model";
import type { Company, ScheduleTask } from "@/lib/operations/types";
import { taskStatus, taskStage } from "./model";
import { attentionOf } from "./attention";

export function visibleTasks(
  tasks: ScheduleTask[],
  companies: Company[],
  filters: {
    period: string;
    companyId: string;
    groupId?: string;
    search: string;
    status: string;
    person: string;
    taskType?: string;
  },
  today: string,
): ScheduleTask[] {
  const lookup = new Map(companies.map((c) => [c.id, working(c)]));
  const query = searchText(filters.search);
  return tasks
    .filter((t) => {
      const v = working(t),
        c = lookup.get(t.companyId);
      return (
        (filters.period === "*" || !v.period || v.period === filters.period) &&
        (!filters.companyId || t.companyId === filters.companyId) &&
        (!filters.groupId || c?.group.trim() === filters.groupId) &&
        (!filters.person || v.person === filters.person) &&
        (!filters.taskType || searchText(v.title) === filters.taskType) &&
        (!filters.status ||
          (filters.status === "late"
            ? taskStatus(v, today) === "late"
            : filters.status === "attention"
              ? attentionOf(v, today) !== null
              : taskStage(v) === filters.status)) &&
        searchText(c?.name ?? "", c?.ruc ?? "", v.title, v.person, v.notes).includes(query)
      );
    })
    .sort(
      (a, b) =>
        (working(a).dueOn ?? "9999").localeCompare(working(b).dueOn ?? "9999") ||
        working(a).title.localeCompare(working(b).title),
    );
}
