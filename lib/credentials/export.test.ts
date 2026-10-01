import { expect, it } from "vitest";
import { accessWorkbook, parseOwnAccessWorkbook } from "./export";
import { newCompany, working } from "@/lib/operations/model";
import type { Access } from "@/lib/operations/types";
import { writeWorkbook } from "@/lib/operations/workbooks";
import {
  addCompanyCustomField,
  addCompanyTab,
  companyFieldSections,
  moveCompanyField,
} from "@/lib/operations/company-fields";
import { companyTaxProfile, patchCompanyTaxValues } from "@/lib/operations/company-tax";

it("gives newly added Excel obligations stable IDs and rejects duplicate IDs", () => {
  const build = (ids: string[]) =>
    writeWorkbook([
      { name: "Accesos", rows: [["Empresa", "Servicio", "Contraseña"]] },
      {
        name: "Empresas",
        rows: [
          ["Empresa", "RUC", "ID empresa"],
          ["A", "0992833319001", "company"],
        ],
      },
      {
        name: "Obligaciones",
        rows: [
          ["ID", "ID empresa", "Obligación", "Categoría"],
          ...ids.map((id, i) => [id, "company", i === 0 ? "IVA" : "ATS", "SRI"]),
        ],
      },
    ]);
  const first = parseOwnAccessWorkbook(build(["", ""]))!;
  expect(new Set(first.obligations.map((o) => o.id)).size).toBe(2);
  expect(first.obligations.map((o) => o.id)).toEqual(
    parseOwnAccessWorkbook(build(["", ""]))!.obligations.map((o) => o.id),
  );
  expect(() => parseOwnAccessWorkbook(build(["duplicate", "duplicate"]))).toThrow(/duplicad/i);
});

it("round trips two working credentials of the same company", () => {
  const company = newCompany("A", "0992833319001", "G");
  const create = (id: string): Access => ({
    id,
    companyId: company.id,
    original: {
      service: "Supercias",
      user: id,
      password: "old",
      email: "mail@example.test",
      notes: "",
    },
    edits: { password: "corrected" },
    fields: [],
    fieldEdits: {},
  });
  const accesses = [create("a"), create("b")];
  const imported = parseOwnAccessWorkbook(accessWorkbook([company], accesses));
  expect(imported?.accesses.map(working)).toEqual(accesses.map(working));
  expect(imported?.companies[0].original).toEqual(working(company));
});

it("round trips custom fields, their working values, empty tabs and moved source fields", () => {
  let company = addCompanyCustomField(newCompany("A"), "Legal", "Contacto", "Ana", "manual:1");
  company = addCompanyTab(company, "Documentación");
  company.fields.push({
    key: "source:1",
    category: "Datos",
    label: "Dirección",
    original: "Original",
    address: "H4",
    column: "H",
    row: 4,
  });
  company.fieldEdits["manual:1"] = "María";
  company = moveCompanyField(company, "source:1", "Legal");
  const restored = parseOwnAccessWorkbook(accessWorkbook([company], []))!.companies[0];
  expect(restored.customFields?.[0]).toMatchObject({
    key: "manual:1",
    label: "Contacto",
    original: "María",
  });
  expect(companyFieldSections(restored).map((s) => [s.label, s.fields.map((f) => f.key)])).toEqual(
    companyFieldSections(company).map((s) => [s.label, s.fields.map((f) => f.key)]),
  );
});

it("round trips field types, select options and explicit tax data including false and empty values", () => {
  let company = addCompanyCustomField(
    newCompany("A"),
    "Legal",
    "Estado",
    "Pendiente",
    "manual:select",
    { kind: "select", options: ["Pendiente", "Hecho"] },
  );
  company = addCompanyCustomField(company, "Legal", "Documentos completos", "OK", "manual:check", {
    kind: "checkbox",
    options: [],
  });
  company = patchCompanyTaxValues(company, {
    regime: "",
    isCompany: false,
    keepsAccounting: true,
    zeroDeclaration: true,
    incomePeriodicity: "",
  });
  const restored = parseOwnAccessWorkbook(accessWorkbook([company], []))!.companies[0];
  expect(restored.fieldTypes).toEqual(company.fieldTypes);
  expect(restored.taxEdits).toEqual(company.taxEdits);
  expect(companyTaxProfile(restored)).toEqual(companyTaxProfile(company));
});
