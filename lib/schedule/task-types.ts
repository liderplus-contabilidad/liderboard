import type { ScheduleTask } from "@/lib/operations/types";
import { working, searchText } from "@/lib/operations/model";

/** Process names already live in tasks; the selector reuses them across companies and periods. */
export function taskTypeOptions(
  tasks: readonly ScheduleTask[],
): { value: string; label: string }[] {
  const options = new Map<string, { value: string; label: string }>();
  for (const task of tasks) {
    const label = working(task).title.trim();
    const value = searchText(label);
    if (value && !options.has(value)) options.set(value, { value, label });
  }
  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
}
