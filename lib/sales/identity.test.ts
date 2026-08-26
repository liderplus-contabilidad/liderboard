import { describe, expect, it } from "vitest";
import {
  describeSalesIdentityClash,
  deriveSalesIdentity,
  incomingSalesIdentity,
  sameSalesIdentity,
} from "./identity";
import type { ParsedSalesMonth, SalesMonth } from "./types";

function stored(companyName: string): SalesMonth {
  return {
    id: "c1:2026-04",
    clientId: "c1",
    year: 2026,
    monthIndex: 3,
    companyName,
    lines: [],
    declaredTotal: null,
    warnings: [],
  };
}

function parsed(companyName: string): ParsedSalesMonth {
  return { year: 2026, monthIndex: 3, companyName, lines: [], declaredTotal: null, warnings: [] };
}

describe("deriveSalesIdentity", () => {
  it("un cliente SIN ventas no tiene identidad: la primera carga la adopta y no puede chocar", () => {
    expect(deriveSalesIdentity([])).toBeNull();
  });

  it("la identidad es la razón social que declaran sus archivos", () => {
    expect(deriveSalesIdentity([stored("HOSPITAL DURAN S.A.")])).toEqual({
      companyName: "HOSPITAL DURAN S.A.",
    });
  });

  it("un archivo sin empresa declarada no da identidad", () => {
    expect(deriveSalesIdentity([stored("   ")])).toBeNull();
  });
});

describe("sameSalesIdentity", () => {
  it("mayúsculas, acentos y espacios sobrantes no separan dos cargas de la misma empresa", () => {
    expect(
      sameSalesIdentity({ companyName: "Clínica  Durán" }, { companyName: "CLINICA DURAN" }),
    ).toBe(true);
  });

  it("la puntuación SEPARA en vez de desaparecer: dos empresas parecidas no se funden", () => {
    expect(sameSalesIdentity({ companyName: "DURAN S.A." }, { companyName: "DURANSA" })).toBe(
      false,
    );
  });

  it("dos empresas distintas no son la misma", () => {
    expect(
      sameSalesIdentity({ companyName: "HOSPITAL DURAN" }, { companyName: "CLINICA AMBATO" }),
    ).toBe(false);
  });
});

describe("incomingSalesIdentity", () => {
  it("toma la del primer archivo que declara empresa", () => {
    expect(incomingSalesIdentity([parsed(""), parsed("HOSPITAL DURAN")])).toEqual({
      companyName: "HOSPITAL DURAN",
    });
  });
});

describe("describeSalesIdentityClash", () => {
  it("no dobla el punto cuando la razón social ya acaba en uno", () => {
    // Media razón social del país acaba en `S.A.`, y un `S.A..` se lee como una errata de la app
    // sobre el nombre del cliente.
    const message = describeSalesIdentityClash(
      { companyName: "HOSPITAL DURAN" },
      { companyName: "CENTRO MEDICO SAN RAFAEL S.A." },
      "Clínica Durán",
    );
    expect(message).toContain("SAN RAFAEL S.A. Si es la misma");
    expect(message).not.toContain("..");
  });

  it("nombra las DOS empresas y el cliente, y dice qué hacer en cada caso", () => {
    const message = describeSalesIdentityClash(
      { companyName: "HOSPITAL DURAN" },
      { companyName: "CLINICA AMBATO" },
      "Clínica Durán",
    );
    expect(message).toContain("HOSPITAL DURAN");
    expect(message).toContain("CLINICA AMBATO");
    expect(message).toContain("Clínica Durán");
  });
});
