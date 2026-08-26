import { describe, expect, it } from "vitest";
import {
  activeMarkCount,
  emptyFilters,
  periodLabel,
  sanitizeFilters,
  selectedMonths,
  withAllYears,
  withMonthToggled,
  withMonthsCleared,
  withYearToggled,
  type SalesUniverse,
} from "./filters";

const UNIVERSE: SalesUniverse = { years: [2024, 2025, 2026], months: [0, 1, 3] };

describe("sanitizeFilters", () => {
  it("sin marcas abre en el año MÁS RECIENTE, no en todos", () => {
    // La regla de la casa es «ninguna marca es todas», y aquí se rompe a propósito: entrar sumando
    // tres ejercicios se lee mal antes de tocar un filtro.
    expect(sanitizeFilters(emptyFilters(), UNIVERSE).years).toEqual([2026]);
  });

  it("un año que este cliente no tiene se poda", () => {
    expect(sanitizeFilters({ years: [2019, 2025], months: [] }, UNIVERSE).years).toEqual([2025]);
  });

  it("podados TODOS, vuelve al más reciente en vez de quedarse vacío", () => {
    expect(sanitizeFilters({ years: [2019], months: [] }, UNIVERSE).years).toEqual([2026]);
  });

  it("sin años cargados no hay nada que marcar", () => {
    expect(sanitizeFilters(emptyFilters(), { years: [], months: [] }).years).toEqual([]);
  });

  it("los años salen en orden del universo, no en el de las marcas", () => {
    expect(sanitizeFilters({ years: [2026, 2024], months: [] }, UNIVERSE).years).toEqual([
      2024, 2026,
    ]);
  });

  it("poda los meses que los años marcados no tienen", () => {
    expect(sanitizeFilters({ years: [2026], months: [0, 5] }, UNIVERSE).months).toEqual([0]);
  });
});

describe("marcas de año", () => {
  it("marcar añade en orden del universo", () => {
    expect(withYearToggled({ years: [2026], months: [] }, 2024, UNIVERSE.years).years).toEqual([
      2024, 2026,
    ]);
  });

  it("volver a marcarlo lo quita", () => {
    expect(withYearToggled({ years: [2026], months: [] }, 2026, UNIVERSE.years).years).toEqual([]);
  });

  it("los MESES sobreviven al cambio de año: «Abr» ya no es «el abril de 2026»", () => {
    const filters = withYearToggled({ years: [2026], months: [3] }, 2025, UNIVERSE.years);
    expect(filters.months).toEqual([3]);
  });

  it("«Todos los años» PUEBLA la lista, porque vacío aquí significa «el más reciente»", () => {
    expect(withAllYears({ years: [2026], months: [] }, UNIVERSE.years).years).toEqual([
      2024, 2025, 2026,
    ]);
  });
});

describe("marcas de mes", () => {
  it("marcar un mes lo añade en orden del universo", () => {
    expect(withMonthToggled({ years: [2026], months: [3] }, 0, UNIVERSE.months).months).toEqual([
      0, 3,
    ]);
  });

  it("«todos los meses» vacía la lista, que es como esta app escribe «sin filtro»", () => {
    expect(withMonthsCleared({ years: [2026], months: [0, 3] }).months).toEqual([]);
  });

  it("solo los meses cuentan como marcas: el año nunca está vacío y no lleva chip", () => {
    expect(activeMarkCount({ years: [2024, 2026], months: [] })).toBe(0);
    expect(activeMarkCount({ years: [2026], months: [3] })).toBe(1);
  });
});

describe("selectedMonths", () => {
  it("sin marcas suma TODOS los meses cargados de los años marcados", () => {
    expect(selectedMonths({ years: [2026], months: [] }, UNIVERSE)).toEqual([0, 1, 3]);
  });

  it("con marcas suma exactamente esas", () => {
    expect(selectedMonths({ years: [2026], months: [3] }, UNIVERSE)).toEqual([3]);
  });
});

describe("periodLabel", () => {
  it("un año sin meses es el año a secas", () => {
    expect(periodLabel([], [2026])).toBe("2026");
  });

  it("un mes con un año va entero", () => {
    expect(periodLabel([3], [2026])).toBe("Abril 2026");
  });

  it("un tramo continuo va como rango", () => {
    expect(periodLabel([0, 1, 2], [2026])).toBe("Ene–Mar 2026");
  });

  it("un conjunto con huecos se ENUMERA: «Ene–Abr» afirmaría que febrero está sumado", () => {
    expect(periodLabel([0, 2, 3], [2026])).toBe("Ene, Mar, Abr 2026");
  });

  it("varios años sin meses son la lista de años", () => {
    expect(periodLabel([], [2025, 2026])).toBe("2025, 2026");
  });

  it("con varios años el mes se escribe UNA vez y los años detrás", () => {
    // Repetir «abril» por cada año es lo que hace ilegible un rótulo de comparación.
    expect(periodLabel([3], [2025, 2026])).toBe("Abr · 2025, 2026");
    expect(periodLabel([0, 1, 2], [2024, 2025, 2026])).toBe("Ene–Mar · 2024, 2025, 2026");
  });

  it("sin años no hay periodo que nombrar", () => {
    expect(periodLabel([3], [])).toBe("Sin datos");
  });
});
