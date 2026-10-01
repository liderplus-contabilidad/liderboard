import type { TaskValues } from "@/lib/operations/types";

export type TaskStage = "pending" | "doing" | "done";
export type SchedulePresentation = "agenda" | "kanban" | "calendar";
export function newTaskPeriod(
  view: SchedulePresentation,
  period: string,
  month: string,
  date: string | null,
  today: string,
): string {
  return view === "calendar"
    ? date?.slice(0, 7) || month
    : period === "*"
      ? today.slice(0, 7)
      : period;
}
export const TASK_STAGES: readonly { value: TaskStage; label: string }[] = [
  { value: "pending", label: "Pendientes" },
  { value: "doing", label: "En curso" },
  { value: "done", label: "Hechas" },
];
export function taskStage(task: Pick<TaskValues, "done" | "started">): TaskStage {
  return task.done ? "done" : task.started ? "doing" : "pending";
}
export function stagePatch(stage: TaskStage): Pick<TaskValues, "done" | "started"> {
  return { done: stage === "done", started: stage === "doing" };
}
export function taskStateLabel(task: TaskValues, today: string): string {
  const label = { pending: "Pendiente", doing: "En curso", done: "Hecha" }[taskStage(task)];
  return taskStatus(task, today) === "late" ? `${label} · Vencida` : label;
}

export function validPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function taskStatus(
  task: Pick<TaskValues, "dueOn" | "done">,
  today: string,
): "done" | "late" | "pending" {
  return task.done ? "done" : task.dueOn && task.dueOn < today ? "late" : "pending";
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dueDatePatch(dueOn: string | null): Partial<TaskValues> {
  if (dueOn === null) return { dueOn: null };
  if (!validDate(dueOn)) throw new Error("La fecha no es válida.");
  return { dueOn, period: dueOn.slice(0, 7) };
}

export function todayLocal(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
