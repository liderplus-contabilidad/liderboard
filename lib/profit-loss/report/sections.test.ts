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
    // No es que venga vacío ni deshabilitado: no está declarado.
    expect(declared).not.toContain("centros");
  });

  it("sin nada que añadir, el análisis vertical tampoco existe", () => {
    // Sobre Ingresos y sin año contra el que comparar, sería la columna «% Ing.» del estado
    // impresa otra vez en su propia página.
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
