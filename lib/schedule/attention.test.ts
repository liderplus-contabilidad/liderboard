import { describe, expect, it } from "vitest";
import type { ScheduleTask, TaskValues } from "@/lib/operations/types";
import { attentionCounts, attentionOf } from "./attention";

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

describe("schedule attention", () => {
  it("moves a task through preparation, approaching, and overdue without double counting", () => {
    const tasks = [
      task("2026-09-29"),
      task("2026-09-30"),
      task("2026-10-07"),
      task("2026-10-08"),
      task("2026-10-15"),
      task("2026-10-16"),
      task(null),
      task("2026-10-01", { done: true }),
    ];
    expect(
      tasks.map((item) => attentionOf({ ...item.original, ...item.edits }, "2026-09-30")),
    ).toEqual(["late", "soon", "soon", "prepare", "prepare", null, null, null]);
    expect(attentionCounts(tasks, "2026-09-30")).toEqual({
      late: 1,
      soon: 2,
      prepare: 2,
      total: 5,
    });
  });

  it("uses each task's corrected preparation margin", () => {
    expect(attentionOf({ ...task("2026-10-20").original, preparationDays: 20 }, "2026-09-30")).toBe(
      "prepare",
    );
    expect(
      attentionOf({ ...task("2026-10-20").original, preparationDays: 10 }, "2026-09-30"),
    ).toBeNull();
    expect(
      attentionOf({ ...task("2026-10-20").original, preparationDays: 0 }, "2026-09-30"),
    ).toBeNull();
    expect(attentionCounts([task("2026-10-20", { preparationDays: 20 })], "2026-09-30").total).toBe(
      1,
    );
  });

  it("handles civil date boundaries and invalid dates", () => {
    expect(attentionOf(task("2027-01-14").original, "2026-12-30")).toBe("prepare");
    expect(attentionOf(task("2027-01-15").original, "2026-12-30")).toBeNull();
    expect(attentionOf(task("2026-02-30").original, "2026-02-25")).toBeNull();
    expect(attentionCounts([task("2026-09-30")], "invalid").total).toBe(0);
  });
});
