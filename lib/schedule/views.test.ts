import { describe, expect, it } from "vitest";
import { calendarDays, calendarScope, shiftMonth } from "./calendar";
import { taskStage, stagePatch, newTaskPeriod } from "./model";
import { visibleTasks } from "./scope";
import { newCompany, working } from "@/lib/operations/model";
import type { ScheduleTask, TaskValues } from "@/lib/operations/types";
import { scheduleWorkbook } from "./export";
import { parseScheduleWorkbook } from "./import";

const company = newCompany("Empresa A", "0992833319001");
function task(id: string, patch: Partial<TaskValues> = {}): ScheduleTask {
  return {
    id,
    companyId: company.id,
    original: {
      title: id,
      period: "2026-08",
      dueOn: "2026-09-18",
      person: "Pauli",
      done: false,
      notes: "",
      ...patch,
    },
    edits: {},
  };
}

describe("schedule work views", () => {
  it("keeps unassigned imported tasks visible in all working months and Excel round trips", () => {
    const inbox = task("IVA", { period: "", dueOn: null });
    const filters = { period: "2026-10", companyId: "", search: "", status: "", person: "" };
    expect(visibleTasks([inbox], [company], filters, "2026-09-30")).toEqual([inbox]);
    expect(calendarScope([inbox], "2026-10")).toEqual([inbox]);
    expect(working(parseScheduleWorkbook(scheduleWorkbook([company], [inbox])).tasks[0])).toEqual(
      working(inbox),
    );
  });
  it("uses the selected working period when creating from Agenda or Kanban", () => {
    expect(newTaskPeriod("agenda", "2026-08", "2026-09", null, "2026-09-30")).toBe("2026-08");
    expect(newTaskPeriod("kanban", "2026-08", "2026-09", null, "2026-09-30")).toBe("2026-08");
    expect(newTaskPeriod("calendar", "2026-08", "2026-09", "2026-09-18", "2026-09-30")).toBe(
      "2026-09",
    );
    expect(newTaskPeriod("agenda", "*", "2026-10", null, "2026-09-30")).toBe("2026-09");
  });
  it("reads old tasks and moves stages without changing deadlines or originals", () => {
    const original = task("IVA");
    expect(taskStage(working(original))).toBe("pending");
    const moved = { ...original, edits: stagePatch("doing") };
    expect(taskStage(working(moved))).toBe("doing");
    expect(working(moved).dueOn).toBe("2026-09-18");
    expect(moved.original.done).toBe(false);
    expect(taskStage({ ...working(moved), ...stagePatch("done") })).toBe("done");
    expect(taskStage({ ...working(moved), ...stagePatch("pending") })).toBe("pending");
  });
  it("round trips progress through Excel and includes late tasks in their workflow selection", () => {
    const started = task("IVA", { started: true });
    const parsed = parseScheduleWorkbook(scheduleWorkbook([company], [started]));
    expect(taskStage(working(parsed.tasks[0]))).toBe("doing");
    expect(parsed.tasks[0].id).toBe(started.id);
    expect(
      visibleTasks(
        [started],
        [company],
        { period: "*", companyId: "", search: "", status: "doing", person: "" },
        "2026-09-30",
      ),
    ).toHaveLength(1);
    expect(
      visibleTasks(
        [started],
        [company],
        { period: "*", companyId: "", search: "", status: "late", person: "" },
        "2026-09-30",
      ),
    ).toHaveLength(1);
  });
  it("filters all actionable tasks across periods while keeping each task once", () => {
    const rows = [
      task("late", { dueOn: "2026-09-29" }),
      task("soon", { dueOn: "2026-10-05", period: "2026-10" }),
      task("prepare", { dueOn: "2026-10-14", period: "2026-10" }),
      task("later", { dueOn: "2026-10-16", period: "2026-10" }),
      task("done", { dueOn: "2026-09-29", done: true }),
    ];
    expect(
      visibleTasks(
        rows,
        [company],
        {
          period: "*",
          companyId: "",
          search: "",
          status: "attention",
          person: "",
        },
        "2026-09-30",
      ).map((row) => row.id),
    ).toEqual(["late", "soon", "prepare"]);
  });
  it("builds a Monday-first month including leap day and civil year boundaries", () => {
    const feb = calendarDays("2024-02");
    expect(feb[0]).toMatchObject({ date: "2024-01-29", inMonth: false });
    expect(feb.filter((d) => d.inMonth)).toHaveLength(29);
    expect(feb.some((d) => d.date === "2024-02-29")).toBe(true);
    expect(feb.length % 7).toBe(0);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("scopes dates by their due month and keeps relevant undated work visible", () => {
    const rows = [
      task("due"),
      task("undated", { dueOn: null, period: "2026-09" }),
      task("old-undated", { dueOn: null }),
      task("next", { dueOn: "2026-10-01" }),
    ];
    expect(calendarScope(rows, "2026-09").map((t) => t.id)).toEqual(["due", "undated"]);
    expect(calendarScope(rows, "2026-08").map((t) => t.id)).toEqual(["old-undated"]);
  });
});
