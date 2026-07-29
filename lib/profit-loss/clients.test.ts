import { describe, expect, it } from "vitest";
import {
  findClientByName,
  findClientForIdentity,
  isNameTaken,
  matchesSearch,
  normalizeClientName,
  proposeClientName,
  sortClients,
  type PygClient,
} from "./clients";
import type { WorkspaceIdentity } from "./workspace-identity";

function client(id: string, name: string): PygClient {
  return { id, name };
}

function identity(overrides: Partial<WorkspaceIdentity> = {}): WorkspaceIdentity {
  return {
    system: "monthly-centers",
    companyName: "DARWIN & WOLF HOTELES Y TURISMO DARWOLF S.A.",
    mode: "centers",
    ...overrides,
  };
}

describe("normalizeClientName", () => {
  it("recorta los espacios de los extremos y colapsa los de dentro", () => {
    expect(normalizeClientName("  Manor   Galápagos  ")).toEqual({
      ok: true,
      name: "Manor Galápagos",
    });
  });

  it("rechaza el nombre vacío", () => {
    expect(normalizeClientName("")).toMatchObject({ ok: false });
  });

  it("rechaza un nombre de solo espacios", () => {
    expect(normalizeClientName("   ")).toMatchObject({ ok: false });
  });

  it("rechaza un nombre de más de 60 caracteres, y acepta uno de exactamente 60", () => {
    expect(normalizeClientName("a".repeat(61))).toMatchObject({ ok: false });
    expect(normalizeClientName("a".repeat(60))).toEqual({ ok: true, name: "a".repeat(60) });
  });

  it("el mensaje de rechazo está en español y dice qué falta", () => {
    const empty = normalizeClientName("");
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.message).toContain("nombre");
    }
  });
});

describe("isNameTaken", () => {
  const clients = [client("a", "Manor Galápagos"), client("b", "Delicmar")];

  it("considera duplicado un nombre que solo cambia en mayúsculas y acentos", () => {
    expect(isNameTaken("manor galapagos", clients)).toBe(true);
    expect(isNameTaken("MANOR GALÁPAGOS", clients)).toBe(true);
  });

  it("no considera duplicado un nombre que nadie usa", () => {
    expect(isNameTaken("Hospital Durán", clients)).toBe(false);
  });

  it("nombra al cliente que ya lo usa, para que el rechazo pueda decirlo", () => {
    expect(findClientByName("manor galapagos", clients)?.name).toBe("Manor Galápagos");
  });

  it("renombrar no choca consigo mismo", () => {
    expect(isNameTaken("MANOR GALAPAGOS", clients, "a")).toBe(false);
    expect(isNameTaken("MANOR GALAPAGOS", clients, "b")).toBe(true);
  });
});

describe("sortClients", () => {
  it("ordena alfabéticamente tratando los acentos como su letra base", () => {
    const sorted = sortClients([
      client("1", "Zulia"),
      client("2", "Ángel"),
      client("3", "Delicmar"),
      client("4", "Alfa"),
    ]);
    expect(sorted.map((c) => c.name)).toEqual(["Alfa", "Ángel", "Delicmar", "Zulia"]);
  });

  it("no muta la lista que recibe", () => {
    const input = [client("1", "Zulia"), client("2", "Alfa")];
    sortClients(input);
    expect(input.map((c) => c.name)).toEqual(["Zulia", "Alfa"]);
  });
});

describe("matchesSearch", () => {
  it("ignora mayúsculas y acentos", () => {
    expect(matchesSearch("Manor Galápagos", "galapagos")).toBe(true);
    expect(matchesSearch("Inversiones Condesa", "COND")).toBe(true);
  });

  it("un texto vacío no filtra nada", () => {
    expect(matchesSearch("Delicmar", "")).toBe(true);
    expect(matchesSearch("Delicmar", "   ")).toBe(true);
  });

  it("descarta lo que no contiene el texto", () => {
    expect(matchesSearch("Delicmar", "cond")).toBe(false);
  });
});

describe("proposeClientName", () => {
  it("recorta la forma jurídica y capitula una razón social gritada", () => {
    expect(proposeClientName("ALPHA MUEBLES S.A.S.", [])).toBe("Alpha Muebles");
  });

  it("deja los conectores en minúscula", () => {
    expect(proposeClientName("HOTELES Y TURISMO DEL SUR LTDA.", [])).toBe(
      "Hoteles y Turismo del Sur",
    );
  });

  it("respeta un nombre que ya viene en mixto", () => {
    expect(proposeClientName("Alpha Muebles S.A.S.", [])).toBe("Alpha Muebles");
  });

  it("desempata contra un nombre que ya existe en vez de proponer un duplicado", () => {
    const existing = [client("a", "Alpha Muebles")];
    expect(proposeClientName("ALPHA MUEBLES S.A.S.", existing)).toBe("Alpha Muebles 2");
    expect(
      proposeClientName("ALPHA MUEBLES S.A.S.", [...existing, client("b", "Alpha Muebles 2")]),
    ).toBe("Alpha Muebles 3");
  });

  it("la colisión se mide ignorando mayúsculas y acentos, como la validación", () => {
    expect(proposeClientName("ALPHA MUEBLES S.A.S.", [client("a", "alpha muebles")])).toBe(
      "Alpha Muebles 2",
    );
  });

  it("nunca se queda sin nombre aunque la razón social sea solo una forma jurídica", () => {
    expect(proposeClientName("S.A.S.", [])).toBe("S.a.s.");
  });
});

describe("findClientForIdentity", () => {
  const clients = [client("a", "Manor Galápagos"), client("b", "Delicmar"), client("c", "Vacío")];

  it("devuelve el cliente cuya identidad adoptada coincide exactamente", () => {
    const identities = {
      a: identity(),
      b: identity({ companyName: "DELICMAR S.A.", system: "dingoo", mode: "single" as const }),
      c: null,
    };
    expect(findClientForIdentity(clients, identities, identity())?.id).toBe("a");
  });

  it("devuelve null cuando ninguno coincide", () => {
    const identities = { a: identity(), b: null, c: null };
    expect(
      findClientForIdentity(clients, identities, identity({ companyName: "ALPHA MUEBLES S.A.S." })),
    ).toBeNull();
  });

  it("un cliente vacío no coincide con nada: adopta, no choca", () => {
    expect(findClientForIdentity(clients, { a: null, b: null, c: null }, identity())).toBeNull();
  });

  it("una coincidencia parcial no basta: el sistema también es identidad", () => {
    const identities = { a: identity({ system: "microplus" }), b: null, c: null };
    expect(findClientForIdentity(clients, identities, identity())).toBeNull();
  });
});
