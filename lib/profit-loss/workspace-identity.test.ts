import { describe, expect, it } from "vitest";
import {
  compareIdentity,
  describeIdentityChange,
  type WorkspaceIdentity,
} from "./workspace-identity";

function identity(overrides: Partial<WorkspaceIdentity> = {}): WorkspaceIdentity {
  return {
    system: "monthly-single",
    companyName: "NOMIK HOTELS S.A.S.",
    year: 2026,
    mode: "single",
    ...overrides,
  };
}

describe("compareIdentity", () => {
  it("returns no reasons when the identities match", () => {
    expect(compareIdentity(identity(), identity())).toEqual([]);
  });

  it("names the system when the file comes from another accounting system", () => {
    expect(compareIdentity(identity(), identity({ system: "microplus" }))).toEqual(["system"]);
  });

  it("pide confirmación aunque coincidan empresa y año, si el sistema cambia", () => {
    const current = identity({ system: "microplus", companyName: "HOSPITAL X", year: 2026 });
    const incoming = identity({ system: "monthly-single", companyName: "HOSPITAL X", year: 2026 });
    expect(compareIdentity(current, incoming)).toEqual(["system"]);
  });

  it("no pide nada cuando llega otro mes del mismo sistema, empresa, año y modo", () => {
    expect(
      compareIdentity(identity({ system: "microplus" }), identity({ system: "microplus" })),
    ).toEqual([]);
  });

  it("names the year when only the year differs", () => {
    expect(compareIdentity(identity(), identity({ year: 2025 }))).toEqual(["year"]);
  });

  it("names the company when only the company differs", () => {
    expect(compareIdentity(identity(), identity({ companyName: "DARWIN & WOLF" }))).toEqual([
      "company",
    ]);
  });

  it("names the mode when only the mode differs", () => {
    expect(compareIdentity(identity(), identity({ mode: "centers" }))).toEqual(["mode"]);
  });

  it("names every reason at once when several differ", () => {
    const reasons = compareIdentity(
      identity(),
      identity({ companyName: "DARWIN & WOLF", year: 2025, mode: "centers" }),
    );
    expect(reasons).toEqual(expect.arrayContaining(["year", "company", "mode"]));
    expect(reasons).toHaveLength(3);
  });
});

describe("describeIdentityChange — cambia el año", () => {
  it("conserva el texto de la confirmación de cambio de año", () => {
    const current = identity({ year: 2026 });
    const incoming = identity({ year: 2025 });
    const confirmation = describeIdentityChange(current, incoming, ["year"]);
    expect(confirmation.title).toBe("Cambiar de año");
    expect(confirmation.description).toBe(
      "El workspace tiene 2026 cargado. Este archivo es de 2025: cambiar de año descarta los " +
        "datos, ajustes y comentarios de 2026. ¿Continuar?",
    );
  });
});

describe("describeIdentityChange — cambia la empresa", () => {
  it("advierte el cambio de empresa nombrando ambas", () => {
    const current = identity({ companyName: "NOMIK HOTELS S.A.S." });
    const incoming = identity({ companyName: "DARWIN & WOLF" });
    const confirmation = describeIdentityChange(current, incoming, ["company"]);
    expect(confirmation.title).toBe("Cambiar de empresa");
    expect(confirmation.description).toContain("NOMIK HOTELS S.A.S.");
    expect(confirmation.description).toContain("DARWIN & WOLF");
  });
});

describe("describeIdentityChange — cambia el modo", () => {
  it("advierte que se cambia a modo por centros de costo", () => {
    const current = identity({ mode: "single" });
    const incoming = identity({ mode: "centers" });
    const confirmation = describeIdentityChange(current, incoming, ["mode"]);
    expect(confirmation.title).toBe("Cambiar de modo");
    expect(confirmation.description).toContain("mensual por centros de costo");
  });
});

describe("describeIdentityChange — cambia el sistema contable", () => {
  it("advierte el cambio de sistema y lo que se descarta", () => {
    const confirmation = describeIdentityChange(
      identity({ system: "microplus" }),
      identity({ system: "monthly-single" }),
      ["system"],
    );
    expect(confirmation.title).toBe("Cambiar de sistema contable");
    expect(confirmation.description).toContain("otro sistema contable");
    expect(confirmation.description).toContain("descarta los datos, ajustes y comentarios");
  });

  it("lo nombra junto a las demás razones cuando cambian varias", () => {
    const confirmation = describeIdentityChange(
      identity({ system: "microplus", year: 2026 }),
      identity({ system: "monthly-single", year: 2025 }),
      ["system", "year"],
    );
    expect(confirmation.description).toContain("de sistema contable");
    expect(confirmation.description).toContain("2026");
    expect(confirmation.description).toContain("2025");
  });
});

describe("describeIdentityChange — varias razones a la vez", () => {
  it("nombra todo lo que cambia en una sola confirmación", () => {
    const current = identity({ companyName: "NOMIK HOTELS S.A.S.", year: 2026 });
    const incoming = identity({ companyName: "DARWIN & WOLF", year: 2025 });
    const confirmation = describeIdentityChange(current, incoming, ["year", "company"]);
    expect(confirmation.description).toContain("NOMIK HOTELS S.A.S.");
    expect(confirmation.description).toContain("DARWIN & WOLF");
    expect(confirmation.description).toContain("2026");
    expect(confirmation.description).toContain("2025");
  });
});
