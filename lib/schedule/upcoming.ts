import { working } from "@/lib/operations/model";
import type { ScheduleTask } from "@/lib/operations/types";
import { validDate } from "./model";

/** Global alert: due today through seven civil days ahead, regardless of board filters. */
export function countUpcomingTasks(tasks: readonly ScheduleTask[], today: string): number {
  if (!validDate(today)) return 0;
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  const lastDay = end.toISOString().slice(0, 10);
  return tasks.reduce((count, task) => {
    const { done, dueOn } = working(task);
    return (
      count + Number(!done && !!dueOn && dueOn >= today && dueOn <= lastDay && validDate(dueOn))
    );
  }, 0);
}
