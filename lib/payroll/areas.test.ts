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

  // The parser writes the area VERBATIM from the sheet, so two files can bring the same area spelled
  // differently. Offering both forms would allow splitting one area into two blocks of the rol.
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

  // A row with no area block is left with `area: ""` (as `rol-general-grid.ts` says): it is the
  // absence of an area, not an area that can be picked.
  it("descarta el área vacía", () => {
    expect(areaOptions([{ area: "" }, { area: "   " }])).toEqual([...STANDARD_PAYROLL_AREAS]);
  });
});
