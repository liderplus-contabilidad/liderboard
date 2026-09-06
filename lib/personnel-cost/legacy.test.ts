import { describe, expect, it } from "vitest";
import {
  emptyLegacySeries,
  legacyCoverage,
  legacyMonthHasData,
  legacySectionSeries,
  PERSONNEL_LEGACY_COST_ROWS,
  type PersonnelLegacySeries,
} from "./legacy";

/** Un ejercicio tipeado a medias: enero y febrero escritos, el resto en blanco. */
function typed(): PersonnelLegacySeries {
  const series = emptyLegacySeries();
  series["afiliado-personal"][0] = 1000;
  series["afiliado-familia"][0] = 500;
  series["factura-familia"][0] = 250;
  series.externos[0] = 2000;
  series["afiliado-personal"][1] = 1100;
  series.externos[1] = 0;
  return series;
}

describe("Las cuatro líneas y sus dos secciones", () => {
  it("tres suman planta y la cuarta es externos: eso es TODA la estructura que tiene", () => {
    expect(
      PERSONNEL_LEGACY_COST_ROWS.filter((row) => row.section === "planta").map((r) => r.id),
    ).toEqual(["afiliado-personal", "afiliado-familia", "factura-familia"]);
    expect(
      PERSONNEL_LEGACY_COST_ROWS.filter((row) => row.section === "externos").map((r) => r.id),
    ).toEqual(["externos"]);
  });

  it("la sección suma lo que hay y sólo es null donde TODAS sus líneas lo son", () => {
    const planta = legacySectionSeries(typed(), "planta");
    expect(planta[0]).toBe(1750);
    // Febrero sólo tiene «afiliado personal»: la sección vale eso, no null.
    expect(planta[1]).toBe(1100);
    expect(planta[2]).toBeNull();
  });

  it("un cero escrito NO es un mes vacío: es una cifra que alguien afirmó", () => {
    const externos = legacySectionSeries(typed(), "externos");
    expect(externos[1]).toBe(0);
    expect(externos[2]).toBeNull();
  });
});

describe("La cobertura de un ejercicio tipeado es lo que se ESCRIBIÓ", () => {
  it("un mes con algo en cualquier línea cuenta; uno en blanco nunca ocurrió", () => {
    expect(legacyCoverage(typed())).toEqual([0, 1]);
    expect(legacyCoverage(emptyLegacySeries())).toEqual([]);
  });

  it("un mes con un cero escrito está cubierto, que es la distinción de todo el motor", () => {
    const series = emptyLegacySeries();
    series["factura-familia"][7] = 0;
    expect(legacyCoverage(series)).toEqual([7]);
    expect(
      legacyMonthHasData({
        "afiliado-personal": null,
        "afiliado-familia": null,
        "factura-familia": 0,
        externos: null,
      }),
    ).toBe(true);
  });

  it("un mes sin una sola cifra no se guarda: ausencia es la fila que no existe", () => {
    expect(
      legacyMonthHasData({
        "afiliado-personal": null,
        "afiliado-familia": null,
        "factura-familia": null,
        externos: null,
      }),
    ).toBe(false);
  });
});
