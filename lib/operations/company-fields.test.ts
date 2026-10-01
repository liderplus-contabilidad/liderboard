import { describe, expect, it } from "vitest";
import { newCompany } from "./model";
import type { SourceField } from "./types";
import {
  addCompanyTab,
  addCompanyCustomField,
  companyFieldSections,
  moveCompanyField,
  removeCompanyCustomField,
  mergeCompanyDetails,
  configureCompanyField,
} from "./company-fields";

const field = (key: string, label: string, category: string, original = ""): SourceField => ({
  key,
  label,
  category,
  original,
  address: "H4",
  column: "H",
  row: 4,
});

it("supports select and checkbox fields without changing source values or existing edits", () => {
  let company = addCompanyCustomField(newCompany("A"), "Legal", "Estado", "Pendiente", "manual:1", {
    kind: "select",
    options: ["Pendiente", "Hecho", " pendiente "],
  });
  expect(company.fieldTypes?.["manual:1"]).toEqual({
    kind: "select",
    options: ["Pendiente", "Hecho"],
  });
  company = configureCompanyField(company, "manual:1", { kind: "checkbox", options: [] });
  expect(company.fieldTypes?.["manual:1"].kind).toBe("checkbox");
  expect(company.customFields?.[0].original).toBe("Pendiente");
  expect(() =>
    configureCompanyField(company, "manual:1", { kind: "select", options: [" "] }),
  ).toThrow(/opción/);
});
describe("company information tabs", () => {
  it("groups additional Excel fields without repeating core company fields or empty placeholders", () => {
    const company = newCompany("A");
    company.fields = [
      field("ruc", "RUC", "Datos", "0992833319001"),
      field("1", "Contacto", "Administración", "Ana"),
      field("2", "Campo 9", "Administración"),
      field("3", "Campo 10", "Legal"),
    ];
    company.fieldEdits["3"] = "Documento";
    expect(companyFieldSections(company).map((s) => [s.label, s.fields.map((f) => f.key)])).toEqual(
      [
        ["Administración", ["1"]],
        ["Legal", ["3"]],
      ],
    );
  });
  it("supports empty tabs and rejects duplicate or blank names", () => {
    const company = addCompanyTab(newCompany("A"), "  Documentación  ");
    expect(companyFieldSections(company)).toEqual([{ label: "Documentación", fields: [] }]);
    expect(() => addCompanyTab(company, "DOCUMENTACION")).toThrow(/existe/);
    expect(() => addCompanyTab(company, " ")).toThrow(/nombre/);
  });
  it("adds manual fields and rejects duplicate labels only in the same tab", () => {
    const company = addCompanyCustomField(newCompany("A"), "Legal", "Contacto", "Ana", "manual:1");
    expect(companyFieldSections(company)[0].fields[0]).toMatchObject({
      key: "manual:1",
      label: "Contacto",
      original: "Ana",
    });
    expect(() => addCompanyCustomField(company, "legal", "CONTACTO", "", "manual:2")).toThrow(
      /existe/,
    );
    expect(
      addCompanyCustomField(company, "Administración", "Contacto", "", "manual:2").customFields,
    ).toHaveLength(2);
  });
  it("moves imported fields without changing their source category or value", () => {
    const company = newCompany("A");
    company.fields = [field("1", "Contacto", "Administración", "Ana")];
    const moved = moveCompanyField(addCompanyTab(company, "Legal"), "1", "Legal");
    expect(moved.fields[0]).toEqual(company.fields[0]);
    expect(companyFieldSections(moved).find((s) => s.label === "Legal")?.fields[0].original).toBe(
      "Ana",
    );
  });
  it("removes only manual fields and their edits, retaining the empty tab", () => {
    const company = addCompanyCustomField(newCompany("A"), "Legal", "Contacto", "Ana", "manual:1");
    company.fieldEdits["manual:1"] = "María";
    const removed = removeCompanyCustomField(company, "manual:1");
    expect(removed.customFields).toEqual([]);
    expect(removed.fieldEdits).toEqual({});
    expect(companyFieldSections(removed)).toEqual([{ label: "Legal", fields: [] }]);
    expect(() => removeCompanyCustomField(removed, "source:1")).toThrow(/personalizado/);
  });
  it("keeps custom fields, tabs, moves and corrections when source fields reload", () => {
    const company = addCompanyCustomField(newCompany("A"), "Legal", "Contacto", "Ana", "manual:1");
    company.fields = [field("source:1", "Dirección", "Datos", "Vieja")];
    company.fieldEdits["source:1"] = "Corregida";
    const current = moveCompanyField(company, "source:1", "Legal");
    const incoming = newCompany("A");
    incoming.fields = [field("source:1", "Dirección", "Datos", "Nueva")];
    const merged = mergeCompanyDetails(current, incoming);
    expect(merged.fields[0].original).toBe("Nueva");
    expect(merged.fieldEdits["source:1"]).toBe("Corregida");
    expect(merged.customFields).toEqual(current.customFields);
    expect(companyFieldSections(merged).find((s) => s.label === "Legal")?.fields).toHaveLength(2);
  });
});
