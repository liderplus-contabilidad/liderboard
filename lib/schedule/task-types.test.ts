import { describe, expect, it } from "vitest";
import type { ScheduleTask } from "@/lib/operations/types";
import { taskTypeOptions } from "./task-types";
import { visibleTasks } from "./scope";

function task(id: string, title: string, period = "2026-09"): ScheduleTask {
  return {
    id,
    companyId: "company",
    original: { title, period, dueOn: null, person: "", notes: "", done: false },
    edits: {},
  };
}
const filters = { period: "*", companyId: "", search: "", status: "", person: "" };

describe("reusable task processes", () => {
  it("derives one option per process despite casing, accents and whitespace", () => {
    expect(
      taskTypeOptions([
        task("1", "Conciliación bancaria"),
        task("2", "  conciliacion   BANCARIA "),
        task("3", "104 IVA"),
        task("4", ""),
      ]),
    ).toEqual([
      { value: "104 iva", label: "104 IVA" },
      { value: "conciliacion bancaria", label: "Conciliación bancaria" },
    ]);
  });
  it("includes newly created and corrected processes without a second name registry", () => {
    const changed = task("1", "104 IVA");
    changed.edits.title = "Revisión de documentos";
    expect(taskTypeOptions([changed])).toEqual([
      { value: "revision de documentos", label: "Revisión de documentos" },
    ]);
  });
  it("filters by the exact normalized process rather than a partial text match", () => {
    const tasks = [task("1", "104 IVA"), task("2", "104 iva"), task("3", "Revisar 104 IVA")];
    expect(
      visibleTasks(tasks, [], { ...filters, taskType: "104 iva" }, "2026-09-30")
        .map((t) => t.id)
        .sort(),
    ).toEqual(["1", "2"]);
    expect(visibleTasks(tasks, [], filters, "2026-09-30")).toHaveLength(3);
  });
  it("combines the process with the current period and status", () => {
    const tasks = [task("1", "104 IVA"), task("2", "104 IVA", "2026-10"), task("3", "104 IVA")];
    tasks[2].edits.done = true;
    expect(
      visibleTasks(
        tasks,
        [],
        { ...filters, period: "2026-09", status: "pending", taskType: "104 iva" },
        "2026-09-30",
      ).map((t) => t.id),
    ).toEqual(["1"]);
  });
});
