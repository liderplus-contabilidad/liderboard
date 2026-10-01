import { working } from "@/lib/operations/model";
import type { ScheduleTask } from "@/lib/operations/types";
import { MONTHS_FULL_ES } from "@/lib/date";
import { validPeriod } from "./model";

function monthDate(month: string): Date {
  if (!validPeriod(month)) throw new Error("El mes no es válido.");
  return new Date(`${month}-01T12:00:00Z`);
}
export function monthLabel(month: string): string {
  const [year, n] = month.split("-");
  return `${MONTHS_FULL_ES[Number(n) - 1]} ${year}`;
}
export function shiftMonth(month: string, delta: number): string {
  const date = monthDate(month);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}
export function calendarDays(month: string): { date: string; day: number; inMonth: boolean }[] {
  const first = monthDate(month),
    last = monthDate(month);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const offset = (first.getUTCDay() + 6) % 7;
  const count = Math.ceil((offset + last.getUTCDate()) / 7) * 7;
  first.setUTCDate(1 - offset);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(date.getUTCDate() + index);
    const iso = date.toISOString().slice(0, 10);
    return { date: iso, day: date.getUTCDate(), inMonth: iso.startsWith(month) };
  });
}
export function calendarScope(tasks: ScheduleTask[], month: string): ScheduleTask[] {
  return tasks.filter((task) => {
    const v = working(task);
    return v.dueOn ? v.dueOn.startsWith(`${month}-`) : !v.period || v.period === month;
  });
}
export function calendarGroups(tasks: ScheduleTask[]): {
  dated: Map<string, ScheduleTask[]>;
  undated: ScheduleTask[];
} {
  const dated = new Map<string, ScheduleTask[]>(),
    undated: ScheduleTask[] = [];
  for (const task of tasks) {
    const date = working(task).dueOn;
    if (!date) {
      undated.push(task);
      continue;
    }
    const group = dated.get(date) ?? [];
    group.push(task);
    dated.set(date, group);
  }
  return { dated, undated };
}
