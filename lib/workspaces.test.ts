import { describe, expect, it } from "vitest";
import {
  findByName,
  isNameTaken,
  matchesSearch,
  normalizeEntityName,
  proposeEntityName,
  sortByName,
  type NamedEntity,
} from "./workspaces";

function entity(id: string, name: string): NamedEntity {
  return { id, name };
}

describe("normalizeEntityName", () => {
  it("recorta los espacios de los extremos y colapsa los de dentro", () => {
    expect(normalizeEntityName("  Manor   Galápagos  ")).toEqual({
      ok: true,
      name: "Manor Galápagos",
    });
  });

  it("rechaza el nombre vacío", () => {
    expect(normalizeEntityName("")).toMatchObject({ ok: false });
  });

  it("rechaza un nombre de solo espacios", () => {
    expect(normalizeEntityName("   ")).toMatchObject({ ok: false });
  });

  it("rechaza un nombre de más de 60 caracteres, y acepta uno de exactamente 60", () => {
    expect(normalizeEntityName("a".repeat(61))).toMatchObject({ ok: false });
    expect(normalizeEntityName("a".repeat(60))).toEqual({ ok: true, name: "a".repeat(60) });
  });

  it("el mensaje de rechazo está en español y nombra al sujeto del módulo", () => {
    const withSubject = normalizeEntityName("", "hotel");
    expect(withSubject.ok).toBe(false);
    if (!withSubject.ok) {
      expect(withSubject.message).toBe("Escribe un nombre para el hotel.");
    }
    const neutral = normalizeEntityName("");
    expect(neutral.ok).toBe(false);
    if (!neutral.ok) {
      expect(neutral.message).toBe("Escribe un nombre.");
    }
  });
});

describe("isNameTaken", () => {
  const entities = [entity("a", "Manor Galápagos"), entity("b", "Delicmar")];

  it("considera duplicado un nombre que solo cambia en mayúsculas y acentos", () => {
    expect(isNameTaken("manor galapagos", entities)).toBe(true);
    expect(isNameTaken("MANOR GALÁPAGOS", entities)).toBe(true);
  });

  it("no considera duplicado un nombre que nadie usa", () => {
    expect(isNameTaken("Hospital Durán", entities)).toBe(false);
  });

  it("nombra a quien ya lo usa, para que el rechazo pueda decirlo", () => {
    expect(findByName("manor galapagos", entities)?.name).toBe("Manor Galápagos");
  });

  it("renombrar no choca consigo mismo", () => {
    expect(isNameTaken("MANOR GALAPAGOS", entities, "a")).toBe(false);
    expect(isNameTaken("MANOR GALAPAGOS", entities, "b")).toBe(true);
  });
});

describe("sortByName", () => {
  it("ordena alfabéticamente tratando los acentos como su letra base", () => {
    const sorted = sortByName([
      entity("1", "Zulia"),
      entity("2", "Ángel"),
      entity("3", "Delicmar"),
      entity("4", "Alfa"),
    ]);
    expect(sorted.map((e) => e.name)).toEqual(["Alfa", "Ángel", "Delicmar", "Zulia"]);
  });

  it("no muta la lista que recibe", () => {
    const input = [entity("1", "Zulia"), entity("2", "Alfa")];
    sortByName(input);
    expect(input.map((e) => e.name)).toEqual(["Zulia", "Alfa"]);
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

describe("proposeEntityName", () => {
  it("recorta la forma jurídica y capitula una razón social gritada", () => {
    expect(proposeEntityName("ALPHA MUEBLES S.A.S.", [], "Cliente")).toBe("Alpha Muebles");
  });

  it("deja los conectores en minúscula", () => {
    expect(proposeEntityName("HOTELES Y TURISMO DEL SUR LTDA.", [], "Cliente")).toBe(
      "Hoteles y Turismo del Sur",
    );
  });

  it("respeta un nombre que ya viene en mixto", () => {
    expect(proposeEntityName("Alpha Muebles S.A.S.", [], "Cliente")).toBe("Alpha Muebles");
  });

  it("desempata contra un nombre que ya existe en vez de proponer un duplicado", () => {
    const existing = [entity("a", "Alpha Muebles")];
    expect(proposeEntityName("ALPHA MUEBLES S.A.S.", existing, "Cliente")).toBe("Alpha Muebles 2");
    expect(
      proposeEntityName(
        "ALPHA MUEBLES S.A.S.",
        [...existing, entity("b", "Alpha Muebles 2")],
        "Cliente",
      ),
    ).toBe("Alpha Muebles 3");
  });

  it("la colisión se mide ignorando mayúsculas y acentos, como la validación", () => {
    expect(
      proposeEntityName("ALPHA MUEBLES S.A.S.", [entity("a", "alpha muebles")], "Cliente"),
    ).toBe("Alpha Muebles 2");
  });

  it("cae en el sujeto del módulo cuando el nombre declarado no deja nada", () => {
    expect(proposeEntityName("   ", [], "Hotel")).toBe("Hotel");
    expect(proposeEntityName("   ", [entity("a", "Hotel")], "Hotel")).toBe("Hotel 2");
  });
});
