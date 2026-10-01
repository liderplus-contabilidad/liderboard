import { compactLabel } from "@/lib/text";
import { companyFieldKey, mergeImported } from "./model";
import type { Company, CompanyFieldType, SourceField } from "./types";
import { companyTaxFieldRole } from "./company-tax";

export function companyFieldSections(company: Company): { label: string; fields: SourceField[] }[] {
  const sections = new Map<string, { label: string; fields: SourceField[] }>();
  const section = (label: string) => {
    label = label.trim() || "Otros";
    const key = compactLabel(label);
    if (!sections.has(key)) sections.set(key, { label, fields: [] });
    return sections.get(key)!;
  };
  const source = company.fields.filter(
    (f) =>
      !companyFieldKey(f.label) &&
      !companyTaxFieldRole(f.label) &&
      (!f.label.startsWith("Campo ") || f.original || company.fieldEdits[f.key]),
  );
  for (const field of source) section(field.category);
  for (const label of company.fieldTabs ?? []) section(label);
  for (const field of [
    ...source,
    ...(company.customFields ?? []).filter((f) => !companyTaxFieldRole(f.label)),
  ]) {
    section(field.category);
    section(company.fieldCategories?.[field.key] ?? field.category).fields.push(field);
  }
  return [...sections.values()];
}

function nameFor(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Escribe un nombre.");
  return name;
}

export function addCompanyTab(company: Company, label: string): Company {
  label = nameFor(label);
  if (companyFieldSections(company).some((s) => compactLabel(s.label) === compactLabel(label)))
    throw new Error("Ya existe una pestaña con ese nombre.");
  return { ...company, fieldTabs: [...(company.fieldTabs ?? []), label] };
}

export function addCompanyCustomField(
  company: Company,
  category: string,
  label: string,
  value: string,
  key: string,
  fieldType: CompanyFieldType = { kind: "text", options: [] },
): Company {
  category = nameFor(category);
  label = nameFor(label);
  const existing = companyFieldSections(company).find(
    (s) => compactLabel(s.label) === compactLabel(category),
  );
  if (existing?.fields.some((f) => compactLabel(f.label) === compactLabel(label)))
    throw new Error("Ya existe un campo con ese nombre en esta pestaña.");
  const next = existing ? company : addCompanyTab(company, category);
  const field: SourceField = {
    key,
    label,
    category: existing?.label ?? category,
    original: value,
    address: "",
    column: "",
    row: 0,
  };
  return {
    ...next,
    customFields: [...(next.customFields ?? []), field],
    fieldTypes: { ...next.fieldTypes, [key]: normalizeCompanyFieldType(fieldType) },
  };
}

export function normalizeCompanyFieldType(type: CompanyFieldType): CompanyFieldType {
  if (!["text", "select", "checkbox"].includes(type.kind))
    throw new Error("Selecciona un tipo de dato válido.");
  const unique = new Map<string, string>();
  for (const option of type.options.map((option) => option.trim()).filter(Boolean)) {
    if (!unique.has(compactLabel(option))) unique.set(compactLabel(option), option);
  }
  const options = [...unique.values()];
  if (type.kind === "select" && !options.length)
    throw new Error("Agrega al menos una opción para la lista.");
  return { kind: type.kind, options: type.kind === "select" ? options : [] };
}

export function configureCompanyField(
  company: Company,
  fieldKey: string,
  type: CompanyFieldType,
): Company {
  if (
    !companyFieldSections(company).some((section) =>
      section.fields.some((field) => field.key === fieldKey),
    )
  )
    throw new Error("Este campo ya no existe.");
  return {
    ...company,
    fieldTypes: { ...company.fieldTypes, [fieldKey]: normalizeCompanyFieldType(type) },
  };
}

export function moveCompanyField(company: Company, key: string, category: string): Company {
  const sections = companyFieldSections(company);
  const field = sections.flatMap((s) => s.fields).find((f) => f.key === key);
  const target = sections.find((s) => compactLabel(s.label) === compactLabel(category));
  if (!field || !target) throw new Error("El campo o la pestaña ya no existe.");
  if (
    target.fields.some((f) => f.key !== key && compactLabel(f.label) === compactLabel(field.label))
  )
    throw new Error("Ya existe un campo con ese nombre en esta pestaña.");
  return { ...company, fieldCategories: { ...company.fieldCategories, [key]: target.label } };
}

export function removeCompanyCustomField(company: Company, key: string): Company {
  if (!company.customFields?.some((f) => f.key === key))
    throw new Error("Solo puedes eliminar un campo personalizado.");
  const { [key]: _value, ...fieldEdits } = company.fieldEdits;
  const { [key]: _category, ...fieldCategories } = company.fieldCategories ?? {};
  const { [key]: _type, ...fieldTypes } = company.fieldTypes ?? {};
  return {
    ...company,
    customFields: company.customFields.filter((f) => f.key !== key),
    fieldEdits,
    fieldCategories,
    fieldTypes,
  };
}

/** Reload refreshes source values; personal fields and their organization belong to the company. */
export function mergeCompanyDetails(current: Company | undefined, incoming: Company): Company {
  return {
    ...mergeImported(current, incoming),
    fieldEdits: { ...incoming.fieldEdits, ...current?.fieldEdits },
    customFields: [
      ...new Map(
        [...(incoming.customFields ?? []), ...(current?.customFields ?? [])].map((f) => [f.key, f]),
      ).values(),
    ],
    fieldTabs: [
      ...new Map(
        [...(current?.fieldTabs ?? []), ...(incoming.fieldTabs ?? [])].map((label) => [
          compactLabel(label),
          label,
        ]),
      ).values(),
    ],
    fieldCategories: { ...incoming.fieldCategories, ...current?.fieldCategories },
    taxEdits: { ...incoming.taxEdits, ...current?.taxEdits },
    fieldTypes: { ...incoming.fieldTypes, ...current?.fieldTypes },
  };
}
