import { describe, expect, it } from "vitest";
import { areaOptions, STANDARD_PAYROLL_AREAS } from "./areas";

describe("areaOptions", () => {
  it("sin nómina ofrece las áreas estándar, en el orden del rol", () => {
    expect(areaOptions([])).toEqual([...STANDARD_PAYROLL_AREAS]);
  });

  it("añade las áreas que el período ya tiene y el estándar no conoce", () => {
    expect(areaOptions([{ area: "MANTENIMIENTO" }])).toEqual([
      ...STANDARD_PAYROLL_AREAS,
      "MANTENIMIENTO",
    ]);
  });

  it("no repite un área que ya es estándar", () => {
    expect(areaOptions([{ area: "COCINA" }, { area: "COCINA" }])).toEqual([
      ...STANDARD_PAYROLL_AREAS,
    ]);
  });

  // El parser escribe el área VERBATIM de la hoja, así que dos ficheros pueden traer la misma
  // área escrita distinto. Ofrecer las dos formas dejaría partir un área en dos bloques del rol.
  it("compara sin distinguir mayúsculas ni espacios de sobra", () => {
    expect(areaOptions([{ area: " cocina " }, { area: "Mantenimiento" }])).toEqual([
      ...STANDARD_PAYROLL_AREAS,
      "Mantenimiento",
    ]);
  });

  it("ordena alfabéticamente las que no son estándar, para que la lista no dependa del orden de la nómina", () => {
    expect(areaOptions([{ area: "SPA" }, { area: "MANTENIMIENTO" }, { area: "EVENTOS" }])).toEqual([
      ...STANDARD_PAYROLL_AREAS,
      "EVENTOS",
      "MANTENIMIENTO",
      "SPA",
    ]);
  });

  // Una fila sin bloque de área queda con `area: ""` (lo dice `rol-general-grid.ts`): es la
  // ausencia de un área, no un área que se pueda elegir.
  it("descarta el área vacía", () => {
    expect(areaOptions([{ area: "" }, { area: "   " }])).toEqual([...STANDARD_PAYROLL_AREAS]);
  });
});
