import { describe, expect, it } from "vitest";
import { newCompany } from "./model";
import type { SourceField } from "./types";
import {
  companyTaxFieldRole,
  companyTaxProfile,
  companyTaxSourceNote,
  patchCompanyTaxValues,
} from "./company-tax";
import { companyFieldSections, mergeCompanyDetails } from "./company-fields";

const field = (key: string, label: string, original = ""): SourceField => ({
  key,
  label,
  original,
  category: "Datos tributarios",
  row: 4,
  column: "H",
  address: "H4",
});
describe("company tax form", () => {
  it("recognizes Excel tax labels, including abbreviations and misspellings", () => {
    expect(
      [
        "REGIMEN GENERAL",
        "RIMPE/ EMPREND",
        "RIMPE/ POPULAR",
        "COMPAÑÍA",
        "OBLIGADO A LLEVAR CONTABILIDAD",
        "AGENTES DE RETENCION",
        "DECLARACION EN CERO",
        "DECLARACION XIV EN 0",
        "DOBLE ACTIVIDAD",
        "PERIOCIDAD ING",
      ].map(companyTaxFieldRole),
    ).toEqual([
      "general",
      "entrepreneur",
      "popular",
      "isCompany",
      "keepsAccounting",
      "withholdingAgent",
      "zeroDeclaration",
      "zeroFourteenthDeclaration",
      "dualActivity",
      "incomePeriodicity",
    ]);
    expect(companyTaxFieldRole("Contacto administrativo")).toBeNull();
  });
  it("reads the existing marks without inferring flags from the regime", () => {
    const company = newCompany("A");
    company.fields = [
      field("g", "REGIMEN GENERAL", "OK"),
      field("c", "COMPAÑIA", "OK"),
      field("a", "OBLIGADO A LLEVAR CONTABILIDAD"),
      field("z", "DECLARACION EN CERO", "PENDIENTE"),
      field("p", "PERIOCIDAD ING", "MENSUAL"),
    ];
    expect(companyTaxProfile(company)).toMatchObject({
      regime: "general",
      isCompany: true,
      keepsAccounting: false,
      zeroDeclaration: false,
      incomePeriodicity: "MENSUAL",
    });
    expect(company.fields[3].original).toBe("PENDIENTE");
  });
  it("reads SI and NO from the workbook as the double activity checkbox state", () => {
    const company = newCompany("A");
    company.fields = [field("d", "DOBLE ACTIVIDAD", "SI")];
    expect(companyTaxProfile(company).dualActivity).toBe(true);

    company.fields = [field("d", "DOBLE ACTIVIDAD", "NO")];
    expect(companyTaxProfile(company).dualActivity).toBe(false);
  });
  it("does not repeat the workbook value beneath double activity", () => {
    const company = newCompany("A");
    company.fields = [field("d", "DOBLE ACTIVIDAD", "SI")];
    expect(companyTaxSourceNote(company, "dualActivity")).toBe("");
  });
  it("reads retention agent and zero fourteenth declaration from their workbook marks", () => {
    const company = newCompany("A");
    company.fields = [
      field("agent", "AGENTES DE RETENCION", "OK"),
      field("xiv", "DECLARACION XIV EN 0", "SI"),
    ];
    expect(companyTaxProfile(company)).toMatchObject({
      withholdingAgent: true,
      zeroFourteenthDeclaration: true,
    });
    expect(companyTaxSourceNote(company, "withholdingAgent")).toBe("");
    expect(companyTaxSourceNote(company, "zeroFourteenthDeclaration")).toBe("");

    company.fields = [
      field("agent", "AGENTES DE RETENCION"),
      field("xiv", "DECLARACION XIV EN 0", "NO"),
    ];
    expect(companyTaxProfile(company)).toMatchObject({
      withholdingAgent: false,
      zeroFourteenthDeclaration: false,
    });
    company.fields[1].original = "0";
    expect(companyTaxProfile(company).zeroFourteenthDeclaration).toBe(false);
  });
  it("shows conflicting regime marks rather than silently choosing one", () => {
    const company = newCompany("A");
    company.fields = [field("g", "REGIMEN GENERAL", "OK"), field("r", "RIMPE/ EMPREND", "OK")];
    expect(companyTaxProfile(company).regime).toBe("multiple");
  });
  it("selects only one regime and synchronizes its raw field corrections", () => {
    const company = newCompany("A");
    company.fields = [
      field("g", "REGIMEN GENERAL", "OK"),
      field("r", "RIMPE/ EMPREND"),
      field("p", "RIMPE/ POPULAR"),
    ];
    const changed = patchCompanyTaxValues(company, { regime: "entrepreneur" });
    expect(companyTaxProfile(changed).regime).toBe("entrepreneur");
    expect(changed.fieldEdits).toEqual({ g: "", r: "OK", p: "" });
    expect(changed.fields[0].original).toBe("OK");
  });
  it("supports new companies and keeps explicit tax edits across reimports", () => {
    const current = patchCompanyTaxValues(newCompany("A"), {
      regime: "popular",
      isCompany: false,
      keepsAccounting: true,
      zeroDeclaration: true,
    });
    const incoming = newCompany("A");
    incoming.fields = [field("g", "REGIMEN GENERAL", "OK"), field("c", "COMPAÑIA", "OK")];
    expect(companyTaxProfile(mergeCompanyDetails(current, incoming))).toMatchObject({
      regime: "popular",
      isCompany: false,
      keepsAccounting: true,
      zeroDeclaration: true,
    });
  });
  it("removes tax fields from additional tabs without removing unrelated fields", () => {
    const company = newCompany("A");
    company.fields = [
      field("g", "REGIMEN GENERAL", "OK"),
      field("c", "COMPAÑIA", "OK"),
      field("note", "Actividad económica", "Servicios"),
    ];
    expect(companyFieldSections(company)[0].fields.map((f) => f.key)).toEqual(["note"]);
  });
});
