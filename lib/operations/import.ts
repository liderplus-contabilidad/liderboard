import * as XLSX from "xlsx";
import { compactLabel, readWorkbook } from "@/lib/excel/workbook";
import { companyIdFor, newCompany, normalizeTaxId, accessFieldRole } from "./model";
import type { Access, Company, KeysImport, Obligation, SourceField } from "./types";

const OBLIGATION_BAND = /rr\.?\s*hh|declaracion mensual|estados financieros|anexos anual|^mrl$/;
const companyLabel = (s: string) =>
  s === "empresas" || s === "nombre de empresa" || s === "nombre de la empresa";

function text(cell: XLSX.CellObject | undefined): string {
  if (cell?.v === undefined || cell.v === null) return "";
  return String(cell.v);
}

function taxId(value: string): string {
  return normalizeTaxId(value);
}

/** First sheet only; column numbers identify provenance, labels decide semantics. */
export function parseKeysWorkbook(data: ArrayBuffer): KeysImport {
  const book = readWorkbook(data);
  const sheetName = book?.SheetNames[0];
  const sheet = sheetName ? book?.Sheets[sheetName] : undefined;
  if (!sheet || !sheetName || !sheet["!ref"])
    throw new Error("No se pudo leer la primera hoja del Excel.");
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const get = (r: number, c: number) => text(sheet[XLSX.utils.encode_cell({ r, c })]);
  let header = -1;
  let nameCol = -1;
  let rucCol = -1;
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 30); r++) {
    const labels = Array.from({ length: range.e.c + 1 }, (_, c) => compactLabel(get(r, c)));
    const name = labels.findIndex(companyLabel);
    const ruc = labels.indexOf("ruc");
    if (name >= 0 && ruc >= 0) {
      header = r;
      nameCol = name;
      rucCol = ruc;
      break;
    }
  }
  if (header < 0) throw new Error("La primera hoja debe tener columnas Empresa y RUC.");
  const labels = Array.from({ length: range.e.c + 1 }, (_, c) =>
    get(header, c)
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[:;]+$/, "")
      .trim(),
  );
  const sequenceCol = labels.findIndex((label) =>
    /^(n\.?\s*-?\.?|nro\.?|numero)$/.test(compactLabel(label)),
  );
  const bands = labels.map(() => "Datos de empresa");
  for (let c = 0; c < labels.length; c++) {
    const title = header > range.s.r ? get(header - 1, c).trim() : "";
    if (!title) continue;
    const merge = sheet["!merges"]?.find((m) => m.s.r === header - 1 && m.s.c === c);
    for (let n = c; n <= (merge?.e.c ?? c); n++) bands[n] = title;
  }
  const occurrences = new Map<string, number>();
  const keys = labels.map((label, c) => {
    const key = `${compactLabel(bands[c])}:${compactLabel(label || `Campo ${XLSX.utils.encode_col(c)}`)}`;
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    return `${key}:${occurrence}`;
  });
  const field = (r: number, c: number): SourceField => ({
    key: keys[c],
    address: XLSX.utils.encode_cell({ r, c }),
    row: r + 1,
    column: XLSX.utils.encode_col(c),
    category: bands[c],
    label: labels[c] || `Campo ${XLSX.utils.encode_col(c)}`,
    original: get(r, c),
  });
  const source = { sheet: sheetName, cells: [] as SourceField[] };
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      if (get(r, c) !== "") source.cells.push(field(r, c));
    }
  }
  const companies: Company[] = [],
    accesses: Access[] = [],
    obligations: Obligation[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (let r = header + 1; r <= range.e.r; r++) {
    const name = get(r, nameCol).trim();
    if (!name || companyLabel(compactLabel(name))) continue;
    if (sequenceCol >= 0 && !/^\d+$/.test(get(r, sequenceCol).trim())) {
      warnings.push(
        `Fila ${r + 1}: datos fuera de la tabla de empresas; conservados en los datos originales.`,
      );
      continue;
    }
    const ruc = taxId(get(r, rucCol));
    const id = companyIdFor(ruc, name);
    if (seen.has(id)) {
      warnings.push(
        `Fila ${r + 1}: empresa repetida; se conservaron sus campos en el archivo original.`,
      );
      continue;
    }
    seen.add(id);
    const find = (label: RegExp) => labels.findIndex((s) => label.test(compactLabel(s)));
    const value = (label: RegExp) => {
      const c = find(label);
      return c < 0 ? "" : get(r, c);
    };
    const company = newCompany(name, ruc, value(/^grupo$/));
    company.original = {
      ...company.original,
      system: value(/^sistema contable/),
      declarationDay: value(/^fechas declaracion$/),
      periodicity: value(/^perioc?idad obligaciones tributarias sri$/),
      notes: value(/^observaciones$/),
    };
    const accountColumns = new Set<number>();
    const bandGroups = new Map<string, number[]>();
    bands.forEach((category, c) => {
      const columns = bandGroups.get(category) ?? [];
      columns.push(c);
      bandGroups.set(category, columns);
    });
    for (const [category, columns] of bandGroups) {
      const accountCols = columns.filter(
        (c) => accessFieldRole(labels[c]) !== null && c !== rucCol,
      );
      if (!accountCols.some((c) => accessFieldRole(labels[c]) === "password")) continue;
      const protectedCols = category === "Datos de empresa" ? accountCols : columns;
      protectedCols.forEach((c) => accountColumns.add(c));
      let slot = 0;
      let current: number[] = [];
      const slots: number[][] = [];
      for (const c of accountCols) {
        if (
          accessFieldRole(labels[c]) === "user" &&
          current.some((n) => accessFieldRole(labels[n]) === "user")
        ) {
          slots.push(current);
          current = [];
        }
        current.push(c);
      }
      if (current.length) slots.push(current);
      for (const cols of slots) {
        slot++;
        const extraCols =
          slot === slots.length ? protectedCols.filter((c) => !accountCols.includes(c)) : [];
        const fields = [...cols, ...extraCols].map((c) => field(r, c));
        if (!fields.some((f) => f.original !== "")) continue;
        const take = (role: "user" | "password" | "email") =>
          fields
            .filter((f) => accessFieldRole(f.label) === role)
            .map((f) => f.original)
            .filter(Boolean)
            .join(" · ");
        accesses.push({
          id: `${id}:access:${compactLabel(category)}:${slot}`,
          companyId: id,
          original: {
            service: category,
            user: take("user"),
            password: take("password"),
            email: take("email"),
            notes: slot > 1 ? `Acceso ${slot}` : "",
          },
          edits: {},
          fields,
          fieldEdits: {},
        });
      }
    }
    for (let c = 0; c < labels.length; c++) {
      if (accountColumns.has(c)) continue;
      const f = field(r, c);
      company.fields.push(f);
      if (OBLIGATION_BAND.test(compactLabel(f.category)) && f.original.trim()) {
        obligations.push({
          id: `${id}:obligation:${f.key}`,
          companyId: id,
          category: f.category,
          label: f.label,
          source: f,
          applies: null,
          interpretation: "unresolved",
          notes: "",
        });
      }
    }
    companies.push(company);
    if (!ruc) warnings.push(`Fila ${r + 1}: empresa sin RUC; se identificó por su nombre.`);
  }
  if (!companies.length) throw new Error("La primera hoja no contiene empresas para importar.");
  return { kind: "keys", companies, accesses, obligations, source, warnings };
}
