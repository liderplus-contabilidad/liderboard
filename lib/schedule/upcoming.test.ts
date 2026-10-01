import { describe, expect, it } from "vitest";
import type { ScheduleTask, TaskValues } from "@/lib/operations/types";
import { countUpcomingTasks } from "./upcoming";

function task(dueOn: string | null, edits: Partial<TaskValues> = {}): ScheduleTask {
  return {
    id: crypto.randomUUID(),
    companyId: "company",
    original: {
      title: "Declaración",
      period: "2026-09",
      dueOn,
      done: false,
      person: "",
      notes: "",
    },
    edits,
  };
}

describe("upcoming task alert", () => {
  it("includes today and seven days ahead, excluding overdue and later dates", () => {
    const tasks = [
      task("2026-09-29"),
      task("2026-09-30"),
      task("2026-10-01"),
      task("2026-10-07"),
      task("2026-10-08"),
      task(null),
    ];
    expect(countUpcomingTasks(tasks, "2026-09-30")).toBe(3);
  });

  it("excludes completed tasks and counts work in progress using corrected values", () => {
    const tasks = [
      task("2026-09-30", { done: true }),
      task("2026-09-30", { started: true }),
      task("2026-09-15", { dueOn: "2026-10-05" }),
      task("2026-10-03", { dueOn: "2026-10-10" }),
    ];
    tasks[0].original.done = true;
    tasks[0].edits.done = false;
    expect(countUpcomingTasks(tasks, "2026-09-30")).toBe(3);
    tasks[0].edits.done = true;
    expect(countUpcomingTasks(tasks, "2026-09-30")).toBe(2);
  });

  it.each([
    ["2026-12-28", "2027-01-04", "2027-01-05"],
    ["2028-02-25", "2028-03-03", "2028-03-04"],
    ["2026-03-05", "2026-03-12", "2026-03-13"],
  ])("handles the seven-day boundary from %s across civil dates", (today, last, later) => {
    expect(countUpcomingTasks([task(last), task(later)], today)).toBe(1);
  });

  it("returns zero for an empty list or invalid dates", () => {
    expect(countUpcomingTasks([], "2026-09-30")).toBe(0);
    expect(countUpcomingTasks([task("2026-02-30")], "2026-02-25")).toBe(0);
    expect(countUpcomingTasks([task("2026-09-30")], "invalid")).toBe(0);
  });
});
