import { readWorkbook } from "@/lib/excel/workbook";
import { newCompany, working, validateKeysImport, normalizeTaxId } from "@/lib/operations/model";
import { compactLabel } from "@/lib/text";
import type {
  Access,
  Company,
  CompanyFieldType,
  CompanyTaxValues,
  KeysImport,
  Obligation,
  SourceField,
} from "@/lib/operations/types";
import { tableRows, writeWorkbook } from "@/lib/operations/workbooks";
import { companyFieldSections, normalizeCompanyFieldType } from "@/lib/operations/company-fields";
import { COMPANY_TAX_LABELS, COMPANY_TAX_REGIMES } from "@/lib/operations/company-tax";

const FIELD_TYPE_LABELS = {
  text: "Texto libre",
  select: "Lista de opciones",
  checkbox: "Casilla de verificación",
} as const;

export function accessWorkbook(
  companies: Company[],
  accesses: Access[],
  obligations: Obligation[] = [],
): ArrayBuffer {
  const lookup = new Map(companies.map((c) => [c.id, working(c)]));
  const fields = (records: (Company | Access)[]) => [
    [
      "ID",
      "Categoría",
      "Campo",
      "Valor",
      "Clave campo",
      "Celda",
      "Pestaña",
      "Origen",
      "Tipo de dato",
      "Opciones",
    ],
    ...records.flatMap((r) =>
      [...r.fields, ...("customFields" in r ? (r.customFields ?? []) : [])]
        .filter(
          (f) =>
            f.original !== "" ||
            r.fieldEdits[f.key] !== undefined ||
            ("customFields" in r && r.customFields?.some((custom) => custom.key === f.key)),
        )
        .map((f) => [
          r.id,
          f.category,
          f.label,
          r.fieldEdits[f.key] ?? f.original,
          f.key,
          f.address,
          "fieldCategories" in r ? (r.fieldCategories?.[f.key] ?? f.category) : f.category,
          "customFields" in r && r.customFields?.some((custom) => custom.key === f.key)
            ? "Personalizado"
            : "Excel",
          "fieldTypes" in r && r.fieldTypes?.[f.key]
            ? FIELD_TYPE_LABELS[r.fieldTypes[f.key].kind]
            : "",
          "fieldTypes" in r ? (r.fieldTypes?.[f.key]?.options.join("\n") ?? "") : "",
        ]),
    ),
  ];
  return writeWorkbook([
    // The first sheet stays Accesos, the format's discriminator.
    {
      name: "Accesos",
      hiddenColumns: [8, 9],
      rows: [
        [
          "Empresa",
          "RUC",
          "Grupo",
          "Servicio",
          "Usuario",
          "Contraseña",
          "Correo",
          "Notas",
          "ID empresa",
          "ID acceso",
        ],
        ...accesses.map((a) => {
          const c = lookup.get(a.companyId),
            v = working(a);
          return [
            c?.name ?? "",
            c?.ruc ?? "",
            c?.group ?? "",
            v.service,
            v.user,
            v.password,
            v.email,
            v.notes,
            a.companyId,
            a.id,
          ];
        }),
      ],
    },
    {
      name: "Empresas",
      hiddenColumns: [7],
      rows: [
        [
          "Empresa",
          "RUC",
          "Grupo",
          "Sistema",
          "Día declaración",
          "Periodicidad",
          "Notas",
          "ID empresa",
        ],
        ...companies.map((c) => {
          const v = working(c);
          return [v.name, v.ruc, v.group, v.system, v.declarationDay, v.periodicity, v.notes, c.id];
        }),
      ],
    },
    { name: "Campos de empresas", rows: fields(companies), hiddenColumns: [0, 4] },
    { name: "Campos de accesos", rows: fields(accesses), hiddenColumns: [0, 4] },
    {
      name: "Datos tributarios",
      hiddenColumns: [0],
      rows: [
        ["ID empresa", "Campo", "Valor"],
        ...companies.flatMap((company) =>
          (
            Object.entries(company.taxEdits ?? {}) as [keyof CompanyTaxValues, string | boolean][]
          ).map(([property, value]) => [
            company.id,
            COMPANY_TAX_LABELS[property],
            typeof value === "boolean"
              ? value
                ? "Sí"
                : "No"
              : property === "regime"
                ? (COMPANY_TAX_REGIMES.find((regime) => regime.value === value)?.label ??
                  "Sin especificar")
                : value,
          ]),
        ),
      ],
    },
    {
      name: "Pestañas de empresas",
      hiddenColumns: [0],
      rows: [
        ["ID empresa", "Pestaña"],
        ...companies.flatMap((c) =>
          companyFieldSections(c).map((section) => [c.id, section.label]),
        ),
      ],
    },
    {
      name: "Obligaciones",
      hiddenColumns: [0, 1],
      rows: [
        [
          "ID",
          "ID empresa",
          "Categoría",
          "Obligación",
          "Marca original",
          "Aplica",
          "Interpretación",
          "Notas",
          "Celda",
          "Empresa",
          "RUC",
        ],
        ...obligations.map((o) => [
          o.id,
          o.companyId,
          o.category,
          o.label,
          o.source.original,
          o.applies === null ? "" : o.applies ? "Sí" : "No",
          o.interpretation,
          o.notes,
          o.source.address,
          lookup.get(o.companyId)?.name ?? "",
          lookup.get(o.companyId)?.ruc ?? "",
        ]),
      ],
    },
  ]);
}

export function parseOwnAccessWorkbook(data: ArrayBuffer): KeysImport | null {
  const book = readWorkbook(data);
  if (!book || book.SheetNames[0] !== "Accesos") return null;
  const rows = tableRows(book, "Accesos");
  if (rows.length && !("servicio" in rows[0] && "contrasena" in rows[0])) return null;
  const companies = new Map<string, Company>(),
    accesses: Access[] = [];
  const value = (r: Record<string, unknown>, key: string) => String(r[key] ?? "");
  for (const row of tableRows(book, "Empresas")) {
    const c = newCompany(value(row, "empresa"), value(row, "ruc"), value(row, "grupo"));
    c.id = value(row, "id empresa") || c.id;
    c.original = {
      ...c.original,
      system: value(row, "sistema"),
      declarationDay: value(row, "dia declaracion"),
      periodicity: value(row, "periodicidad"),
      notes: value(row, "notas"),
    };
    companies.set(c.id, c);
  }
  const ids = new Set<string>();
  for (const row of rows) {
    const c = newCompany(value(row, "empresa"), value(row, "ruc"), value(row, "grupo"));
    c.id = value(row, "id empresa") || c.id;
    if (!companies.has(c.id)) companies.set(c.id, c);
    const id =
      value(row, "id acceso") || `${c.id}:access:${value(row, "servicio")}:${accesses.length}`;
    if (ids.has(id)) throw new Error("El Excel tiene accesos con el mismo identificador.");
    ids.add(id);
    accesses.push({
      id,
      companyId: c.id,
      original: {
        service: value(row, "servicio"),
        user: value(row, "usuario"),
        password: value(row, "contrasena"),
        email: value(row, "correo"),
        notes: value(row, "notas"),
      },
      edits: {},
      fields: [],
      fieldEdits: {},
    });
  }
  const all = new Map<string, Company | Access>(
    [...companies.values(), ...accesses].map((r) => [r.id, r]),
  );
  for (const row of tableRows(book, "Pestañas de empresas")) {
    const company = companies.get(value(row, "id empresa"));
    const label = value(row, "pestana").trim();
    if (company && label) company.fieldTabs = [...(company.fieldTabs ?? []), label];
  }
  for (const row of tableRows(book, "Datos tributarios")) {
    const company = companies.get(value(row, "id empresa"));
    const property = (Object.keys(COMPANY_TAX_LABELS) as (keyof CompanyTaxValues)[]).find(
      (key) => compactLabel(COMPANY_TAX_LABELS[key]) === compactLabel(value(row, "campo")),
    );
    if (!company || !property) continue;
    const raw = value(row, "valor");
    const patch: Partial<CompanyTaxValues> = {};
    if (property === "regime") {
      const regime = COMPANY_TAX_REGIMES.find(
        (option) => compactLabel(option.label) === compactLabel(raw) || option.value === raw,
      );
      if (!regime && raw && compactLabel(raw) !== "sin especificar")
        throw new Error("Un régimen del Excel no es válido.");
      patch.regime = regime?.value ?? "";
    } else if (property === "incomePeriodicity") patch.incomePeriodicity = raw;
    else {
      if (!["si", "no"].includes(compactLabel(raw)))
        throw new Error("Una marca tributaria debe decir Sí o No.");
      patch[property] = compactLabel(raw) === "si";
    }
    company.taxEdits = { ...company.taxEdits, ...patch };
  }
  for (const name of ["Campos de empresas", "Campos de accesos"]) {
    for (const row of tableRows(book, name)) {
      const record = all.get(value(row, "id"));
      if (!record) continue;
      const address = value(row, "celda"),
        column = address.replace(/\d/g, ""),
        rowNumber = Number(address.replace(/\D/g, ""));
      const field: SourceField = {
        key: value(row, "clave campo"),
        address,
        column,
        row: rowNumber,
        label: value(row, "campo"),
        category: value(row, "categoria"),
        original: value(row, "valor"),
      };
      if (name === "Campos de empresas" && value(row, "origen") === "Personalizado") {
        const company = record as Company;
        company.customFields = [...(company.customFields ?? []), field];
      } else record.fields.push(field);
      const category = value(row, "pestana");
      if (name === "Campos de empresas" && category && category !== field.category) {
        const company = record as Company;
        company.fieldCategories = { ...company.fieldCategories, [field.key]: category };
      }
      const typeName = value(row, "tipo de dato");
      if (name === "Campos de empresas" && typeName) {
        const kind = (Object.keys(FIELD_TYPE_LABELS) as CompanyFieldType["kind"][]).find(
          (kind) => compactLabel(FIELD_TYPE_LABELS[kind]) === compactLabel(typeName),
        );
        if (!kind) throw new Error("Un tipo de dato del Excel no es válido.");
        const company = record as Company;
        company.fieldTypes = {
          ...company.fieldTypes,
          [field.key]: normalizeCompanyFieldType({
            kind,
            options: value(row, "opciones").split("\n"),
          }),
        };
      }
    }
  }
  const obligations: Obligation[] = tableRows(book, "Obligaciones").map((r) => {
    const namedCompany = [...companies.values()].find((c) =>
      value(r, "ruc")
        ? c.original.ruc === normalizeTaxId(value(r, "ruc"))
        : compactLabel(c.original.name) === compactLabel(value(r, "empresa")),
    );
    const companyId = value(r, "id empresa") || namedCompany?.id || "";
    if (!value(r, "obligacion").trim()) throw new Error("Una obligación no tiene nombre.");
    return {
      id:
        value(r, "id") ||
        `${companyId}:obligation:${compactLabel(value(r, "categoria"))}:${compactLabel(value(r, "obligacion"))}`,
      companyId,
      label: value(r, "obligacion"),
      category: value(r, "categoria"),
      notes: value(r, "notas"),
      applies: value(r, "aplica") === "Sí" ? true : value(r, "aplica") === "No" ? false : null,
      interpretation: ["applies", "completed", "other"].includes(value(r, "interpretacion"))
        ? (value(r, "interpretacion") as Obligation["interpretation"])
        : "unresolved",
      source: {
        key: value(r, "id"),
        address: value(r, "celda"),
        row: 0,
        column: "",
        category: value(r, "categoria"),
        label: value(r, "obligacion"),
        original: value(r, "marca original"),
      },
    };
  });
  if (!companies.size) throw new Error("No hay empresas para importar.");
  const sourceCells: SourceField[] = rows.flatMap((r, i) =>
    Object.entries(r).map(([label, original]) => ({
      key: label,
      label,
      category: "Accesos",
      address: "",
      row: i + 2,
      column: "",
      original: String(original ?? ""),
    })),
  );
  const result: KeysImport = {
    kind: "keys",
    companies: [...companies.values()],
    accesses,
    obligations,
    source: { sheet: "Accesos", cells: sourceCells },
    warnings: [],
  };
  validateKeysImport(result);
  return result;
}
