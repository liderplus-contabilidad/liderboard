import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseScheduleWorkbook } from "./import";
import { scheduleWorkbook } from "./export";
import { newCompany, working } from "@/lib/operations/model";
import type { ScheduleTask } from "@/lib/operations/types";

function workbook(grid: unknown[][]): ArrayBuffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(grid), "Cronograma");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("schedule exchange", () => {
  it("matches the keys company identity for a numeric leading-zero RUC", () => {
    const result = parseScheduleWorkbook(
      workbook([
        ["Empresa", "RUC", "Tarea", "Periodo"],
        ["A", 992833319001, "IVA", "2026-08"],
      ]),
    );
    expect(result.companies[0].id).toBe("ruc:0992833319001");
    expect(result.companies[0].original.ruc).toBe("0992833319001");
  });
  it("reads reordered labels and preserves OK without marking a task done", () => {
    const result = parseScheduleWorkbook(
      workbook([
        ["Estado", "Fecha", "Tarea", "RUC", "Empresa"],
        ["OK", "18/08/2026", "IVA", "0992833319001", "A"],
      ]),
    );
    expect(result.tasks[0].original).toMatchObject({
      dueOn: "2026-08-18",
      period: "2026-08",
      done: false,
    });
    expect(result.tasks[0].original.notes).toContain("OK");
  });
  it("rejects malformed dates before persistence", () => {
    expect(() =>
      parseScheduleWorkbook(
        workbook([
          ["Empresa", "Tarea", "Fecha"],
          ["A", "IVA", "31/02/2026"],
        ]),
      ),
    ).toThrow(/fecha/i);
  });
  it("rejects unsupported formats and duplicate tasks before persistence", () => {
    expect(() => parseScheduleWorkbook(workbook([["Otra tabla"], ["dato"]]))).toThrow(
      /Formato no reconocido/,
    );
    expect(() =>
      parseScheduleWorkbook(
        workbook([
          ["Empresa", "Tarea", "Fecha"],
          ["A", "IVA", "18/08/2026"],
          ["A", "IVA", "18/08/2026"],
        ]),
      ),
    ).toThrow(/duplicada/);
  });
  it("round trips current values and stable IDs", () => {
    const company = newCompany("A", "0992833319001");
    const task: ScheduleTask = {
      id: "stable-task",
      companyId: company.id,
      original: {
        title: "IVA",
        dueOn: "2026-08-18",
        period: "2026-08",
        person: "Pauli",
        done: false,
        notes: "",
      },
      edits: { done: true, notes: "Corregido" },
    };
    const result = parseScheduleWorkbook(scheduleWorkbook([company], [task]));
    expect(result.tasks[0].id).toBe(task.id);
    expect(result.tasks[0].companyId).toBe(company.id);
    expect(result.tasks[0].original).toEqual(working(task));
  });
});
