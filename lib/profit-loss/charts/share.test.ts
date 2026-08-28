import { describe, expect, it } from "vitest";
import { CENTRO_PRINCIPAL_SOURCE, CULTURA_MANOR_SOURCE, makeSource } from "../analytics/fixtures";
import { buildSeries } from "../analytics/series";
import type { AnalyticsSource, SeriesQuery } from "../analytics/types";
import { describeShares, markedShares, type MarkedShare } from "./share";

const MANOR = "cultura-manor";
const PRINCIPAL = "centro-de-costo-principal";

/** The months with movement of the 2026 files: Ene–Jul. */
const COVERED = 7;

function sharesFor(
  codes: string[],
  options: { sources?: AnalyticsSource[]; centerIds?: string[] } = {},
): MarkedShare[] {
  const sources = options.sources ?? [CULTURA_MANOR_SOURCE];
  const query: SeriesQuery = {
    codes,
    centerIds: options.centerIds ?? [sources[0].centerId],
    years: [2026],
    frequency: "mensual",
  };
  return markedShares(buildSeries(sources, query).series, sources);
}

/** January's percentage, which is the month the fixture's figures describe. */
function january(share: MarkedShare): number {
  return share.values[0] as number;
}

describe("el porcentaje dentro de la cuenta marcada que la contiene", () => {
  it("mide la hija dentro del padre y deja al padre sin porcentaje", () => {
    const shares = sharesFor(["4", "4.1.1"]);

    expect(shares).toHaveLength(1);
    expect(shares[0].seriesId).toBe(`4.1.1|${MANOR}|2026`);
    expect(shares[0].label).toBe("Ventas Alojamiento y Servicios");
    expect(shares[0].baseLabel).toBe("Ingresos");
    // 24.465 de 25.229 mensuales.
    expect(january(shares[0])).toBeCloseTo((24465 / 25229) * 100, 6);
  });

  it("nombra la cuenta del PLAN como base, no la etiqueta de la serie", () => {
    // With two centers the series' label carries the center stuck to it; the base cannot.
    const shares = sharesFor(["4", "4.1.1"], {
      sources: [CULTURA_MANOR_SOURCE, CENTRO_PRINCIPAL_SOURCE],
      centerIds: [MANOR, PRINCIPAL],
    });

    expect(shares.every((share) => share.baseLabel === "Ingresos")).toBe(true);
  });

  it("salta los niveles intermedios que no están marcados", () => {
    const shares = sharesFor(["4", "4.1.1.1.1.1"]);

    expect(shares).toHaveLength(1);
    expect(shares[0].baseLabel).toBe("Ingresos");
    // 17,338 of 25,229: the grandchild against the root, even though 4.1 and 4.1.1 are not marked.
    expect(january(shares[0])).toBeCloseTo((17338 / 25229) * 100, 6);
  });

  it("con tres niveles marcados cada uno cae en el más cercano por encima", () => {
    const shares = sharesFor(["4", "4.1.1", "4.1.1.1"]);

    expect(shares.map((share) => [share.label, share.baseLabel])).toEqual([
      ["Ventas Alojamiento y Servicios", "Ingresos"],
      ["Habitaciones", "Ventas Alojamiento y Servicios"],
    ]);
    // The grandchild is read within its parent (17,338 of 24,465) and NOT within the root.
    expect(january(shares[1])).toBeCloseTo((17338 / 24465) * 100, 6);
  });

  it("con dos familias marcadas cada hija cae dentro de la suya", () => {
    const shares = sharesFor(["4", "4.1.1", "5", "5.1.5"]);

    expect(shares.map((share) => share.baseLabel)).toEqual(["Ingresos", "Costos y Gastos"]);
    expect(january(shares[1])).toBeCloseTo((11121 / 20121) * 100, 6);
  });

  it("no inventa nada cuando las cuentas marcadas no tienen parentesco", () => {
    expect(sharesFor(["4", "5"])).toEqual([]);
    expect(sharesFor(["4"])).toEqual([]);
  });

  it("mide cada centro contra el suyo y nunca contra el de al lado", () => {
    const shares = sharesFor(["4", "4.1.1"], {
      sources: [CULTURA_MANOR_SOURCE, CENTRO_PRINCIPAL_SOURCE],
      centerIds: [MANOR, PRINCIPAL],
    });

    expect(shares.map((share) => share.seriesId)).toEqual([
      `4.1.1|${MANOR}|2026`,
      `4.1.1|${PRINCIPAL}|2026`,
    ]);
    // The small center does not report Ventas Lavandería, so its proportion is ANOTHER one — and it
    // is what would give away a base taken from the center next door, where the scale is also ~100×.
    expect(january(shares[0])).toBeCloseTo((24465 / 25229) * 100, 6);
    expect(january(shares[1])).toBeCloseTo((241.38 / 249.02) * 100, 6);
  });

  it("un periodo sin cobertura queda en null y nunca en 0 %", () => {
    const [share] = sharesFor(["4", "4.1.1"]);

    expect(share.values.slice(0, COVERED).every((value) => value !== null)).toBe(true);
    expect(share.values.slice(COVERED)).toEqual([null, null, null, null, null]);
  });

  it("una base en cero vacía el porcentaje en vez de dividir", () => {
    // Without its only leaf, «Habitaciones» balances at zero and is still the branch's parent.
    const source = makeSource({ omit: ["4.1.1.1.1.1"] });
    const [share] = sharesFor(["4.1.1.1", "4.1.1.1.1"], { sources: [source] });

    expect(share.baseLabel).toBe("Habitaciones");
    expect(share.values.every((value) => value === null)).toBe(true);
  });
});

describe("la frase que dice qué se mide dentro de qué", () => {
  it("nombra un solo par", () => {
    expect(describeShares(sharesFor(["4", "4.1.1"]))).toBe(
      "El porcentaje de cada barra es lo que la cuenta ocupa dentro de la marcada que la contiene: Ventas Alojamiento y Servicios dentro de Ingresos.",
    );
  });

  it("encadena los pares en el orden en que se dibujan", () => {
    expect(describeShares(sharesFor(["4", "4.1.1", "4.1.1.1"]))).toContain(
      "Ventas Alojamiento y Servicios dentro de Ingresos; Habitaciones dentro de Ventas Alojamiento y Servicios.",
    );
  });

  it("no repite el mismo par de cuentas una vez por centro", () => {
    const note = describeShares(
      sharesFor(["4", "4.1.1"], {
        sources: [CULTURA_MANOR_SOURCE, CENTRO_PRINCIPAL_SOURCE],
        centerIds: [MANOR, PRINCIPAL],
      }),
    );

    expect(note?.match(/dentro de Ingresos/g)).toHaveLength(1);
  });

  it("no dice nada cuando no hay ningún porcentaje", () => {
    expect(describeShares([])).toBeUndefined();
  });
});
