import { describe, expect, it } from "vitest";
import {
  compareIdentity,
  describeIdentityChange,
  deriveWorkspaceIdentity,
  type IdentityChangeConfirmation,
  type IdentityChangeContext,
  type WorkspaceIdentity,
} from "./workspace-identity";
import type { PygDataset } from "./types";

function identity(overrides: Partial<WorkspaceIdentity> = {}): WorkspaceIdentity {
  return {
    system: "monthly-single",
    companyName: "NOMIK HOTELS S.A.S.",
    mode: "single",
    ...overrides,
  };
}

function context(overrides: Partial<IdentityChangeContext> = {}): IdentityChangeContext {
  return {
    activeClientName: "Hotel Bahía Meridiana",
    matchingClientName: null,
    proposedClientName: "Alpha Muebles",
    activeClientContents: "2024–2026, 3 centros de costo",
    ...overrides,
  };
}

/** All the text the dialog ever prints — what a strategy id must not be able to touch. */
function everyString(confirmation: IdentityChangeConfirmation): string {
  return [
    confirmation.title,
    confirmation.verdict,
    confirmation.primaryLabel,
    confirmation.primaryHint ?? "",
    confirmation.cards.current.caption,
    confirmation.cards.current.name,
    confirmation.cards.current.detail,
    confirmation.cards.incoming.caption,
    confirmation.cards.incoming.name,
    confirmation.cards.incoming.detail,
    confirmation.replace?.label ?? "",
    confirmation.replace?.heading ?? "",
    confirmation.replace?.description ?? "",
  ].join(" | ");
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

  it("el año ya NO es parte de la identidad: un archivo de otro año no contradice nada", () => {
    // This used to return ["year"] and trigger a destructive replacement. Now a dataset is a
    // center-YEAR, so 2025 next to 2026 is more of the same workspace, not another workspace.
    expect(compareIdentity(identity(), identity())).toEqual([]);
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
      identity({ companyName: "DARWIN & WOLF", mode: "centers" }),
    );
    expect(reasons).toEqual(expect.arrayContaining(["company", "mode"]));
    expect(reasons).toHaveLength(2);
  });
});

describe("describeIdentityChange — 6A: otro cliente sí coincide", () => {
  const confirmation = describeIdentityChange(
    identity(),
    identity({ system: "dingoo", companyName: "DINGOO COMERCIALIZADORA S.A.S." }),
    ["system", "company"],
    context({ matchingClientName: "Dingoo Comercializadora" }),
  );

  it("la acción principal es cargar allí, nombrando ese cliente", () => {
    expect(confirmation.form).toBe("other-client");
    expect(confirmation.primaryLabel).toBe("Cargar en Dingoo Comercializadora");
    expect(confirmation.verdict).toContain("Dingoo Comercializadora");
  });

  it("advierte que cambia el cliente activo y que el abierto queda intacto", () => {
    expect(confirmation.primaryHint).toContain("cambia el cliente activo");
    expect(confirmation.primaryHint).toContain("Hotel Bahía Meridiana queda intacto");
  });

  it("no ofrece reemplazar nada: el archivo pertenece a otro cliente", () => {
    expect(confirmation.replace).toBeUndefined();
  });
});

describe("describeIdentityChange — 6B: ningún cliente coincide", () => {
  const confirmation = describeIdentityChange(
    identity(),
    identity({ companyName: "ALPHA MUEBLES S.A.S." }),
    ["company"],
    context(),
  );

  it("la acción principal es crear un cliente con el nombre propuesto", () => {
    expect(confirmation.form).toBe("no-match");
    expect(confirmation.primaryLabel).toBe("Crear cliente y cargar");
    expect(confirmation.verdict).toContain("Alpha Muebles");
  });

  it("reemplazar baja a acción secundaria y explica cuándo tiene sentido", () => {
    expect(confirmation.replace?.label).toBe("Reemplazar este cliente");
    expect(confirmation.replace?.description).toContain("Hotel Bahía Meridiana");
    expect(confirmation.replace?.description).toContain("pasó a llamarse ALPHA MUEBLES S.A.S.");
  });

  it("cuantifica lo que descarta y promete conservar los comentarios que sigan teniendo cuenta", () => {
    expect(confirmation.replace?.description).toContain("2024–2026, 3 centros de costo");
    expect(confirmation.replace?.description).toContain("los comentarios se conservan solo en las");
  });

  it("dice que los demás clientes no se tocan", () => {
    expect(confirmation.replace?.description).toContain("Los demás clientes no se tocan");
  });
});

describe("describeIdentityChange — los motivos se siguen nombrando", () => {
  it("nombra el cambio de sistema contable", () => {
    const confirmation = describeIdentityChange(
      identity({ system: "microplus" }),
      identity({ system: "monthly-single" }),
      ["system"],
      context(),
    );
    expect(confirmation.replace?.description).toContain("cambió de sistema contable");
  });

  it("nombra el cambio de modo", () => {
    const confirmation = describeIdentityChange(
      identity({ mode: "single" }),
      identity({ mode: "centers" }),
      ["mode"],
      context(),
    );
    expect(confirmation.replace?.description).toContain("pasó a llevarse por centros de costo");
  });

  it("nombra todos los motivos a la vez en una sola frase", () => {
    const confirmation = describeIdentityChange(
      identity({ system: "microplus", companyName: "NOMIK HOTELS S.A.S." }),
      identity({ system: "dingoo", companyName: "DARWIN & WOLF", mode: "centers" }),
      ["system", "company", "mode"],
      context(),
    );
    const description = confirmation.replace?.description ?? "";
    expect(description).toContain("pasó a llamarse DARWIN & WOLF");
    expect(description).toContain("cambió de sistema contable");
    expect(description).toContain("pasó a llevarse por centros de costo");
  });

  it("el año ya no es un motivo: ningún texto habla de años", () => {
    // The «Cambiar de año» confirmation was withdrawn along with the year in the identity: there is
    // no combination of reasons that can produce it.
    const confirmation = describeIdentityChange(
      identity(),
      identity({ mode: "centers" }),
      ["mode"],
      context(),
    );
    expect(everyString(confirmation)).not.toContain("año");
  });
});

describe("describeIdentityChange — las tarjetas comparan empresa y sistema", () => {
  it("nombra el sistema por su etiqueta, nunca por su id", () => {
    const confirmation = describeIdentityChange(
      identity({ system: "microplus" }),
      identity({ system: "monthly-centers", mode: "centers" }),
      ["system", "mode"],
      context(),
    );
    expect(confirmation.cards.current.detail).toContain("MicroPlus");
    expect(confirmation.cards.incoming.detail).toContain("Mensual por centros de costo");
    const printed = everyString(confirmation);
    for (const id of ["microplus", "monthly-centers", "monthly-single", "dingoo", "app-workbook"]) {
      expect(printed).not.toContain(id);
    }
  });

  it("un sistema desconocido tampoco imprime su id", () => {
    const confirmation = describeIdentityChange(
      identity({ system: "sistema-inventado" }),
      identity(),
      ["system"],
      context(),
    );
    expect(everyString(confirmation)).not.toContain("sistema-inventado");
  });

  it("ninguna tarjeta muestra un NIT: ninguna estrategia lo extrae", () => {
    const confirmation = describeIdentityChange(
      identity(),
      identity({ mode: "centers" }),
      ["mode"],
      context(),
    );
    expect(everyString(confirmation)).not.toContain("NIT");
  });

  it("la tarjeta del cliente repite la empresa solo cuando difiere de su etiqueta", () => {
    const distinta = describeIdentityChange(
      identity({ companyName: "DARWIN & WOLF" }),
      identity({ mode: "centers" }),
      ["mode"],
      context({ activeClientName: "Manor Galápagos" }),
    );
    expect(distinta.cards.current.detail).toContain("DARWIN & WOLF");

    const igual = describeIdentityChange(
      identity({ companyName: "Manor Galápagos" }),
      identity({ mode: "centers" }),
      ["mode"],
      context({ activeClientName: "Manor Galápagos" }),
    );
    expect(igual.cards.current.detail).toBe("Estado único mensual");
  });
});

describe("deriveWorkspaceIdentity", () => {
  function dataset(role: PygDataset["role"]): PygDataset {
    return {
      id: role,
      fileName: "x.xlsx",
      uploadedAt: 0,
      companyName: "DARWIN & WOLF",
      periodLabel: "Ene–Dic 2026",
      year: 2026,
      baseFrequency: "mensual",
      role,
      accounts: [],
      resultFromFile: [],
      warnings: [],
    };
  }

  it("un cliente sin datasets no tiene identidad: la adopta en su primera carga", () => {
    expect(
      deriveWorkspaceIdentity([], {
        companyName: "DARWIN & WOLF",
        sourceSystemId: "monthly-centers",
      }),
    ).toBeNull();
  });

  it("el modo sale de los datasets, no de la metadata", () => {
    expect(
      deriveWorkspaceIdentity([dataset("center")], {
        companyName: "DARWIN & WOLF",
        sourceSystemId: "monthly-centers",
      })?.mode,
    ).toBe("centers");
    expect(
      deriveWorkspaceIdentity([dataset("single")], {
        companyName: "NOMIK",
        sourceSystemId: "monthly-single",
      })?.mode,
    ).toBe("single");
  });

  it("sin sistema guardado adopta el legado, y sin empresa cae en la del dataset", () => {
    expect(
      deriveWorkspaceIdentity([dataset("single")], { companyName: "", sourceSystemId: "" }),
    ).toEqual({
      system: "monthly-single",
      companyName: "DARWIN & WOLF",
      mode: "single",
    });
  });
});
