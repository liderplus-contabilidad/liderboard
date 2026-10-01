import type { ScheduleTask, TaskValues } from "@/lib/operations/types";
import { working } from "@/lib/operations/model";
import { validDate } from "./model";

export type AttentionState = "prepare" | "soon" | "late";
export const DEFAULT_PREPARATION_DAYS = 15;
export const SOON_DAYS = 7;

export function attentionOf(
  task: Pick<TaskValues, "dueOn" | "done" | "preparationDays">,
  today: string,
): AttentionState | null {
  if (task.done || !task.dueOn || !validDate(task.dueOn) || !validDate(today)) return null;
  const days = Math.round(
    (Date.parse(`${task.dueOn}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000,
  );
  if (days < 0) return "late";
  if (days <= SOON_DAYS) return "soon";
  const margin = task.preparationDays ?? DEFAULT_PREPARATION_DAYS;
  return Number.isInteger(margin) && margin >= days ? "prepare" : null;
}

export function attentionCounts(tasks: readonly ScheduleTask[], today: string) {
  const counts = { late: 0, soon: 0, prepare: 0, total: 0 };
  for (const task of tasks) {
    const state = attentionOf(working(task), today);
    if (state) {
      counts[state]++;
      counts.total++;
    }
  }
  return counts;
}
