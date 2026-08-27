import { describe, expect, it } from "vitest";
import {
  activeMarkCount,
  emptyFilters,
  passes,
  sanitizeFilters,
  withAreasCleared,
  withAreaToggled,
  withMonthToggled,
  withYearToggled,
  type SalariesUniverse,
} from "./filters";

const UNIVERSE: SalariesUniverse = {
  areas: ["ADMINISTRACION", "HOSPEDAJE", "COCINA", "VENTAS"],
  years: [2025, 2026],
  months: [0, 1, 2],
};

describe("las marcas", () => {
  it("nacen vacías, que es decir «todas»", () => {
    const filters = emptyFilters();

    expect(filters).toEqual({ areas: [], years: [], months: [] });
    expect(passes(filters.areas, "COCINA")).toBe(true);
    expect(passes(filters.areas, "CUALQUIERA")).toBe(true);
  });

  it("una marca puesta excluye lo demás", () => {
    const filters = withAreaToggled(emptyFilters(), "COCINA", UNIVERSE.areas);

    expect(passes(filters.areas, "COCINA")).toBe(true);
    expect(passes(filters.areas, "VENTAS")).toBe(false);
  });

  it("guarda en el orden del universo, no en el de los clicks", () => {
    // VENTAS (the last one) is marked before HOSPEDAJE (the second).
    let filters = withAreaToggled(emptyFilters(), "VENTAS", UNIVERSE.areas);
    filters = withAreaToggled(filters, "HOSPEDAJE", UNIVERSE.areas);

    expect(filters.areas).toEqual(["HOSPEDAJE", "VENTAS"]);
  });

  it("desmarcar y volver a marcar no reordena", () => {
    let filters = withAreaToggled(emptyFilters(), "HOSPEDAJE", UNIVERSE.areas);
    filters = withAreaToggled(filters, "COCINA", UNIVERSE.areas);
    filters = withAreaToggled(filters, "HOSPEDAJE", UNIVERSE.areas); // fuera
    filters = withAreaToggled(filters, "HOSPEDAJE", UNIVERSE.areas); // and inside it again

    expect(filters.areas).toEqual(["HOSPEDAJE", "COCINA"]);
  });

  it("«todas» vacía la lista en vez de marcarlo todo", () => {
    const marked = withAreaToggled(emptyFilters(), "COCINA", UNIVERSE.areas);

    expect(withAreasCleared(marked).areas).toEqual([]);
  });

  it("cuenta las marcas de las tres listas", () => {
    let filters = withAreaToggled(emptyFilters(), "COCINA", UNIVERSE.areas);
    filters = withYearToggled(filters, 2026, UNIVERSE.years);
    filters = withMonthToggled(filters, 1, UNIVERSE.months);

    expect(activeMarkCount(filters)).toBe(3);
  });
});

describe("sanitizeFilters", () => {
  it("descarta una marca que el universo ya no tiene", () => {
    // The real case: switching to a client that only has 2026.
    const filters = withYearToggled(emptyFilters(), 2025, UNIVERSE.years);
    const sanitized = sanitizeFilters(filters, { ...UNIVERSE, years: [2026] });

    expect(sanitized.years).toEqual([]);
  });

  it("conserva las marcas que sí siguen existiendo", () => {
    let filters = withYearToggled(emptyFilters(), 2025, UNIVERSE.years);
    filters = withYearToggled(filters, 2026, UNIVERSE.years);
    const sanitized = sanitizeFilters(filters, { ...UNIVERSE, years: [2026] });

    expect(sanitized.years).toEqual([2026]);
  });

  it("poda las tres listas a la vez", () => {
    let filters = withAreaToggled(emptyFilters(), "COCINA", UNIVERSE.areas);
    filters = withYearToggled(filters, 2025, UNIVERSE.years);
    filters = withMonthToggled(filters, 2, UNIVERSE.months);

    const sanitized = sanitizeFilters(filters, { areas: ["VENTAS"], years: [2026], months: [0] });

    expect(sanitized).toEqual({ areas: [], years: [], months: [] });
  });

  it("reordena al orden del universo si el universo cambió de orden", () => {
    const filters = { areas: ["VENTAS", "COCINA"], years: [], months: [] };
    const sanitized = sanitizeFilters(filters, UNIVERSE);

    expect(sanitized.areas).toEqual(["COCINA", "VENTAS"]);
  });

  it("devuelve el mismo objeto cuando no hay nada que podar", () => {
    // So a `useMemo` downstream is not invalidated on every render.
    const filters = withAreaToggled(emptyFilters(), "COCINA", UNIVERSE.areas);

    expect(sanitizeFilters(filters, UNIVERSE)).toBe(filters);
  });
});
