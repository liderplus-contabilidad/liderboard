import { describe, expect, it } from "vitest";
import { reportSections } from "./sections";

const ids = (input: Parameters<typeof reportSections>[0]) =>
  reportSections(input).map((section) => section.id);

describe("las secciones del informe", () => {
  it("por centros de costo declara siete, cerrando con el anexo", () => {
    expect(ids({ mode: "multi", vertical: true })).toEqual([
      "portada",
      "resumen",
      "graficos",
      "analisis",
      "vertical",
      "estado",
      "centros",
    ]);
  });

  it("en estado único el anexo de centros NO existe", () => {
    const declared = ids({ mode: "single", vertical: true });

    expect(declared).toEqual(["portada", "resumen", "graficos", "analisis", "vertical", "estado"]);
    // It is not that it arrives empty or disabled: it is not declared.
    expect(declared).not.toContain("centros");
  });

  it("sin nada que añadir, el análisis vertical tampoco existe", () => {
    // Over Ingresos and with no year to compare against, it would be the statement's «% Ing.» column
    // printed again on its own page.
    expect(ids({ mode: "single", vertical: false })).not.toContain("vertical");
  });

  it("el vertical se lee antes del estado, no después", () => {
    const declared = ids({ mode: "multi", vertical: true });

    expect(declared.indexOf("vertical")).toBeLessThan(declared.indexOf("estado"));
  });

  it("cada sección lleva su título y su subtítulo", () => {
    for (const section of reportSections({ mode: "multi", vertical: true })) {
      expect(section.title).not.toBe("");
      expect(section.subtitle).not.toBe("");
    }
  });
});

describe("qué secciones abren página", () => {
  const breaking = (input: Parameters<typeof reportSections>[0]) =>
    reportSections(input)
      .filter((section) => section.breakBefore)
      .map((section) => section.id);

  it("solo las tablas de página entera", () => {
    // The first four are read continuously: the cover takes two thirds of a sheet and the summary is
    // three tiles. Each on its own page is two almost blank sheets.
    expect(breaking({ mode: "multi", vertical: true })).toEqual(["vertical", "estado", "centros"]);
  });

  it("la portada nunca abre página — sería una hoja en blanco antes del informe", () => {
    for (const mode of ["single", "multi"] as const) {
      expect(reportSections({ mode, vertical: false })[0]?.breakBefore).toBe(false);
    }
  });

  it("las secciones que se leen de corrido no lo declaran", () => {
    const flowing = reportSections({ mode: "single", vertical: false }).filter((section) =>
      ["portada", "resumen", "graficos", "analisis"].includes(section.id),
    );

    expect(flowing).toHaveLength(4);
    expect(flowing.every((section) => section.breakBefore === false)).toBe(true);
  });
});
