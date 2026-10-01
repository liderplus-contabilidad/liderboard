import { working } from "./model";
import type { Obligation, ScheduleTask } from "./types";

/** A source mark starts undated work; its meaning never decides completion or a month. */
export function mergeObligationTasks(
  obligations: Obligation[],
  tasks: ScheduleTask[],
): ScheduleTask[] {
  const claimed = new Set<string>();
  return obligations.map((obligation) => {
    const id = `keys-task:${obligation.id}`;
    const current =
      tasks.find((task) => task.id === id || task.sourceObligationId === obligation.id) ??
      tasks.find(
        (task) =>
          !task.sourceObligationId &&
          !claimed.has(task.id) &&
          task.companyId === obligation.companyId &&
          working(task).title === obligation.label,
      );
    if (current) {
      claimed.add(current.id);
      return { ...current, sourceObligationId: obligation.id };
    }
    return {
      id,
      companyId: obligation.companyId,
      sourceObligationId: obligation.id,
      original: {
        title: obligation.label,
        period: "",
        dueOn: null,
        person: "",
        done: false,
        notes: obligation.notes,
      },
      edits: {},
    };
  });
}
