import { describe, expect, it } from "vitest";
import {
  clearMarks,
  describeSelection,
  periodLabel,
  emptyFilters,
  hasMarks,
  sanitizeFilters,
  withCenterToggled,
  withDayToggled,
  withDrillIntoMonth,
  withMonthToggled,
  withMonthsCleared,
  withYearToggled,
} from "./filters";

const UNIVERSE = { centerIds: ["manor", "norte"], years: [2025, 2026] };

describe("OccupancyFilters", () => {
  it("arranca sin marcas, en ocupación y por mes", () => {
    const filters = emptyFilters();
    expect(filters.metric).toBe("occupancy");
    expect(filters.scope).toBe("mes");
    expect(hasMarks(filters)).toBe(false);
  });

  it("mantiene el orden del universo, no el de los clics", () => {
    let filters = emptyFilters();
    filters = withCenterToggled(filters, "norte", UNIVERSE.centerIds);
    filters = withCenterToggled(filters, "manor", UNIVERSE.centerIds);
    expect(filters.centerIds).toEqual(["manor", "norte"]);
  });

  it("desmarca lo ya marcado", () => {
    let filters = withYearToggled(emptyFilters(), 2026, UNIVERSE.years);
    filters = withYearToggled(filters, 2026, UNIVERSE.years);
    expect(filters.years).toEqual([]);
  });

  it("ordena los meses por calendario", () => {
    let filters = withMonthToggled(emptyFilters(), 6);
    filters = withMonthToggled(filters, 1);
    expect(filters.months).toEqual([1, 6]);
  });

  it("al bajar a un mes deja ese periodo y el eje diario", () => {
    const filters = withDrillIntoMonth(withMonthToggled(emptyFilters(), 0), 2);
    expect(filters.months).toEqual([2]);
    expect(filters.scope).toBe("dia");
  });

  it("«quitar todo» conserva la métrica y el eje: no son marcas, son la lente", () => {
    const marked = {
      ...emptyFilters(),
      metric: "adr" as const,
      scope: "dia" as const,
      years: [2026],
    };
    const cleared = clearMarks(marked);
    expect(cleared.metric).toBe("adr");
    expect(cleared.scope).toBe("dia");
    expect(hasMarks(cleared)).toBe(false);
  });

  it("poda lo que dejó de existir", () => {
    const stale = { ...emptyFilters(), centerIds: ["manor", "vieja"], years: [2024, 2026] };
    expect(sanitizeFilters(stale, UNIVERSE)).toMatchObject({
      centerIds: ["manor"],
      years: [2026],
    });
  });
});

describe("marcas de día", () => {
  it("marcar un día baja el eje a días: sobre el eje mensual no querría decir nada", () => {
    const filters = withDayToggled(withMonthToggled(emptyFilters(), 0), 4);
    expect(filters.days).toEqual([4]);
    expect(filters.scope).toBe("dia");
  });

  it("quitar los meses se lleva los días", () => {
    let filters = withMonthToggled(emptyFilters(), 0);
    filters = withDayToggled(filters, 4);
    expect(withMonthsCleared(filters).days).toEqual([]);
  });

  it("bajar a otro mes no arrastra el día del anterior", () => {
    let filters = withMonthToggled(emptyFilters(), 0);
    filters = withDayToggled(filters, 4);
    expect(withDrillIntoMonth(filters, 5).days).toEqual([]);
  });
});

describe("periodLabel", () => {
  it("dice el periodo, no cuántas casillas hay marcadas", () => {
    expect(periodLabel([], [])).toBe("Todo el año");
    expect(periodLabel([0], [])).toBe("Enero");
    expect(periodLabel([0, 2], [])).toBe("Ene · Mar");
    expect(periodLabel([0], [4])).toBe("5 de enero");
    expect(periodLabel([0], [4, 11])).toBe("días 5, 12 de enero");
    expect(periodLabel([0, 2], [4])).toBe("día 5 de Ene · Mar");
  });
});

describe("describeSelection", () => {
  it("resume la comparación en una frase", () => {
    const filters = { ...emptyFilters(), years: [2025, 2026], months: [0], days: [4] };
    expect(describeSelection(filters, ["Cultura Manor"])).toBe(
      "Ocupación · 5 de enero · 2025 y 2026 · Cultura Manor",
    );
  });

  it("nombra lo que no está marcado como «todos»", () => {
    expect(describeSelection(emptyFilters(), [])).toBe(
      "Ocupación · Todo el año · todos los años · todas las sucursales",
    );
  });
});
