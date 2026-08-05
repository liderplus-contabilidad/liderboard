import { describe, expect, it } from "vitest";
import {
  emptyFilters,
  sanitizeFilters,
  selectPeriods,
  withSearch,
  withYearsCleared,
  withYearToggled,
  type PayrollFilters,
} from "./filters";
import type { PayrollPeriod } from "./types";

function period(overrides: Partial<PayrollPeriod> = {}): PayrollPeriod {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    clientId: "cliente-1",
    year: 2026,
    monthIndex: 5,
    kind: "ordinario",
    status: "captura",
    ...overrides,
  };
}

function filters(overrides: Partial<PayrollFilters> = {}): PayrollFilters {
  return { ...emptyFilters(), ...overrides };
}

describe("emptyFilters", () => {
  it("empieza sin nada marcado", () => {
    expect(emptyFilters()).toEqual({ years: [], search: "" });
  });
});

describe("withYearToggled", () => {
  it("agrega un año en el orden del universo, no el de clic", () => {
    const universe = [2024, 2025, 2026];
    const picked = withYearToggled(withYearToggled(filters(), 2026, universe), 2024, universe);
    expect(picked.years).toEqual([2024, 2026]);
  });

  it("quita un año ya marcado", () => {
    const universe = [2025, 2026];
    const picked = withYearToggled(filters({ years: [2025] }), 2025, universe);
    expect(picked.years).toEqual([]);
  });
});

describe("withYearsCleared / withSearch", () => {
  it("«Todos los años» limpia solo los años", () => {
    const f = filters({ years: [2025], search: "junio" });
    expect(withYearsCleared(f)).toEqual({ ...f, years: [] });
  });

  it("cambia el texto de búsqueda", () => {
    expect(withSearch(filters(), "marzo").search).toBe("marzo");
  });
});

describe("sanitizeFilters", () => {
  it("poda un año que ya no existe en el cliente", () => {
    const f = filters({ years: [2025, 2020] });
    expect(sanitizeFilters(f, [2025, 2026]).years).toEqual([2025]);
  });

  it("devuelve el MISMO objeto cuando no hay nada que podar", () => {
    const f = filters({ years: [2025] });
    expect(sanitizeFilters(f, [2025, 2026])).toBe(f);
  });

  it("devuelve un objeto nuevo en cuanto poda algo", () => {
    const f = filters({ years: [2020] });
    expect(sanitizeFilters(f, [2025])).not.toBe(f);
  });
});

describe("selectPeriods", () => {
  const periods = [
    period({ year: 2025, monthIndex: 11 }),
    period({ year: 2026, monthIndex: 2 }),
    period({ year: 2026, monthIndex: 5 }),
  ];

  it("sin años marcados, muestra todos, más reciente primero", () => {
    expect(selectPeriods(periods, filters()).map((p) => [p.year, p.monthIndex])).toEqual([
      [2026, 5],
      [2026, 2],
      [2025, 11],
    ]);
  });

  it("un año marcado deja solo ese año", () => {
    const result = selectPeriods(periods, filters({ years: [2025] }));
    expect(result.map((p) => p.year)).toEqual([2025]);
  });

  it("la búsqueda filtra por el nombre del período", () => {
    const result = selectPeriods(periods, filters({ search: "diciembre" }));
    expect(result).toHaveLength(1);
    expect(result[0].monthIndex).toBe(11);
  });

  it("año y búsqueda se combinan", () => {
    const result = selectPeriods(periods, filters({ years: [2026], search: "marzo" }));
    expect(result).toHaveLength(1);
    expect(result[0].monthIndex).toBe(2);
  });
});
