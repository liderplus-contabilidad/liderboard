import { compactLabel } from "@/lib/text";
import type { Company, EditableRecord, KeysImport } from "./types";

export function working<T extends object>(record: EditableRecord<T>): T {
  return { ...record.original, ...record.edits };
}

/** Reload refreshes the file's values, never a correction made at the desk. */
export function mergeImported<T extends { edits: object }>(current: T | undefined, incoming: T): T {
  return { ...incoming, edits: { ...incoming.edits, ...current?.edits } };
}

export function companyIdFor(ruc: string, name: string): string {
  return normalizeTaxId(ruc) ? `ruc:${normalizeTaxId(ruc)}` : `name:${compactLabel(name)}`;
}

export function normalizeTaxId(value: string): string {
  const trimmed = value.trim();
  return /^\d{11,13}$/.test(trimmed) ? trimmed.padStart(13, "0") : trimmed;
}

export function sanitizeCompanyId(mark: string, companies: readonly { id: string }[]): string {
  return companies.some((c) => c.id === mark) ? mark : "";
}

export function newCompany(name = "Nueva empresa", ruc = "", group = ""): Company {
  ruc = normalizeTaxId(ruc);
  return {
    id: ruc || name !== "Nueva empresa" ? companyIdFor(ruc, name) : crypto.randomUUID(),
    original: { name, ruc, group, system: "", declarationDay: "", periodicity: "", notes: "" },
    edits: {},
    fields: [],
    fieldEdits: {},
  };
}

export function validateKeysImport(incoming: KeysImport): void {
  const companies = new Set(incoming.companies.map((c) => c.id));
  if (companies.size !== incoming.companies.length || companies.has(""))
    throw new Error("Hay empresas duplicadas o sin identificador.");
  for (const rows of [incoming.accesses, incoming.obligations]) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row.id || seen.has(row.id))
        throw new Error("Hay registros sin identificador o duplicados.");
      if (!companies.has(row.companyId))
        throw new Error("Un registro no corresponde a una empresa del archivo.");
      seen.add(row.id);
    }
  }
}

export function searchText(...values: string[]): string {
  return compactLabel(values.join(" "));
}

export function accessFieldRole(label: string): "user" | "password" | "email" | null {
  const normalized = compactLabel(label);
  if (/^(contrasena|clave|password)(?:$|[\s:])/.test(normalized)) return "password";
  if (/^(usuario|user)(?:$|[\s:\d])/.test(normalized)) return "user";
  if (/^(correo|email)(?:$|[\s:])/.test(normalized)) return "email";
  return null;
}

export const COMPANY_COLUMNS = {
  name: /^(empresas|nombre de (la )?empresa)$/,
  ruc: /^ruc$/,
  group: /^grupo$/,
  system: /^sistema contable/,
  declarationDay: /^fechas declaracion$/,
  periodicity: /^perioc?idad obligaciones tributarias sri$/,
  notes: /^observaciones$/,
} as const;

export function companyFieldKey(label: string): keyof typeof COMPANY_COLUMNS | null {
  return (
    (Object.keys(COMPANY_COLUMNS) as (keyof typeof COMPANY_COLUMNS)[]).find((key) =>
      COMPANY_COLUMNS[key].test(compactLabel(label)),
    ) ?? null
  );
}
