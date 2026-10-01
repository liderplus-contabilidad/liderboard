import type * as XLSX from "xlsx";
import { compactLabel, readGrid, readWorkbook } from "@/lib/excel/workbook";
import { newCompany } from "@/lib/operations/model";
import type { Company, ScheduleImport, ScheduleTask } from "@/lib/operations/types";
import { dateFromCell } from "./import-date";

export interface ScheduleAdapter {
  id: string;
  matches: (book: XLSX.WorkBook) => boolean;
  parse: (book: XLSX.WorkBook) => ScheduleImport;
}

function locate(book: XLSX.WorkBook) {
  for (const name of book.SheetNames) {
    const grid = readGrid(book, name);
    if (!grid) continue;
    const row = grid.findIndex((r) => {
      const labels = r.map(compactLabel);
      return labels.includes("empresa") && labels.includes("tarea");
    });
    if (row >= 0) return { grid, row };
  }
  return null;
}

const flatSchedule: ScheduleAdapter = {
  id: "liderplus-flat",
  matches: (book) => locate(book) !== null,
  parse: (book) => {
    const found = locate(book);
    if (!found) throw new Error("No se encontró una tabla de cronograma.");
    const headers = found.grid[found.row].map(compactLabel);
    const companies = new Map<string, Company>(),
      tasks: ScheduleTask[] = [],
      warnings: string[] = [];
    const ids = new Set<string>();
    for (let r = found.row + 1; r < found.grid.length; r++) {
      const row = found.grid[r];
      if (!row.some((v) => v !== null && v !== "")) continue;
      const raw = (label: string) => row[headers.indexOf(label)] ?? null;
      const text = (label: string) => String(raw(label) ?? "").trim();
      const name = text("empresa"),
        title = text("tarea");
      if (!name || !title) throw new Error(`Fila ${r + 1}: falta empresa o tarea.`);
      const date = dateFromCell(raw("fecha"));
      if (raw("fecha") !== null && raw("fecha") !== "" && !date)
        throw new Error(`Fila ${r + 1}: la fecha no es válida. Usa dd/mm/aaaa.`);
      const period = text("periodo") || date?.slice(0, 7) || "";
      if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
        throw new Error(`Fila ${r + 1}: el período debe ser válido (aaaa-mm).`);
      const company = newCompany(name, text("ruc"), text("grupo"));
      if (text("id empresa")) company.id = text("id empresa");
      companies.set(company.id, company);
      const state = compactLabel(text("estado"));
      const done = ["hecha", "hecho", "completada", "completado"].includes(state);
      const started = state === "en curso";
      const ambiguous =
        state && !done && !started && !["pendiente", "vencida", "vencido"].includes(state);
      const notes = [text("notas"), ambiguous ? `Marca original: ${text("estado")}` : ""]
        .filter(Boolean)
        .join(" · ");
      const id =
        text("id tarea") ||
        `task:${company.id}:${compactLabel(title)}:${period}:${date ?? "sin-fecha"}`;
      if (ids.has(id)) throw new Error(`Fila ${r + 1}: tarea duplicada en el archivo.`);
      ids.add(id);
      tasks.push({
        id,
        companyId: company.id,
        original: {
          title,
          dueOn: date,
          period,
          person: text("responsable"),
          done,
          notes,
          ...(started ? { started: true } : {}),
        },
        edits: {},
      });
      if (ambiguous)
        warnings.push(
          `Fila ${r + 1}: se conservó la marca «${text("estado")}» sin dar la tarea por hecha.`,
        );
    }
    if (!tasks.length) throw new Error("No hay tareas para importar.");
    return { kind: "schedule", companies: [...companies.values()], tasks, warnings };
  },
};

/** New workbook shapes join here; all emit the same editable task model. */
export const SCHEDULE_ADAPTERS: readonly ScheduleAdapter[] = [flatSchedule];

export function parseScheduleWorkbook(
  data: ArrayBuffer,
  adapters: readonly ScheduleAdapter[] = SCHEDULE_ADAPTERS,
): ScheduleImport {
  const book = readWorkbook(data);
  if (!book) throw new Error("No se pudo leer el Excel.");
  const adapter = adapters.find((item) => item.matches(book));
  if (!adapter)
    throw new Error(
      "Formato no reconocido. Usa las columnas Empresa, Tarea, Fecha, Responsable, Estado y Notas.",
    );
  return adapter.parse(book);
}
