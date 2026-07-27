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
  finerScope,
  isPeriodMarked,
  periodPhrase,
  withDrillIntoPeriod,
  withMonthToggled,
  withPeriodShortcutToggled,
  withMonthsCleared,
  withYearToggled,
} from "./filters";

const UNIVERSE = { centerIds: ["manor", "norte"], years: [2025, 2026] };

describe("OccupancyFilters", () => {
  it("arranca sin marcas, en ocupación y por mes", () => {
    const filters = emptyFilters();
    expect(filters.metric).toBe("occupancy");
    expect(filters.scope).toBe("mensual");
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

  it("al bajar de un trimestre deja sus tres meses y el eje mensual", () => {
    const filters = withDrillIntoPeriod(emptyFilters(), [3, 4, 5], "mensual");
    expect(filters.months).toEqual([3, 4, 5]);
    expect(filters.scope).toBe("mensual");
  });

  it("al bajar a un mes deja ese periodo y el eje diario", () => {
    const filters = withDrillIntoPeriod(withMonthToggled(emptyFilters(), 0), [2], "dia");
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
    expect(withDrillIntoPeriod(filters, [5], "dia").days).toEqual([]);
  });
});

describe("atajos de trimestre y semestre", () => {
  it("marcan los meses del periodo — no son una marca aparte", () => {
    const filters = withPeriodShortcutToggled(emptyFilters(), "trimestral", 1);
    expect(filters.months).toEqual([3, 4, 5]);
    expect(isPeriodMarked(filters, "trimestral", 1)).toBe(true);
  });

  it("desmarcan sólo si el periodo estaba entero", () => {
    let filters = withMonthToggled(emptyFilters(), 3);
    // Con abril suelto, pulsar T2 completa el trimestre en vez de vaciarlo.
    filters = withPeriodShortcutToggled(filters, "trimestral", 1);
    expect(filters.months).toEqual([3, 4, 5]);
    filters = withPeriodShortcutToggled(filters, "trimestral", 1);
    expect(filters.months).toEqual([]);
  });

  it("no tocan el eje: T1 sobre un eje mensual son tres columnas legibles", () => {
    const filters = withPeriodShortcutToggled(emptyFilters(), "trimestral", 0);
    expect(filters.scope).toBe("mensual");
  });

  it("conservan el orden del calendario y conviven con meses de otro periodo", () => {
    let filters = withMonthToggled(emptyFilters(), 11);
    filters = withPeriodShortcutToggled(filters, "semestral", 0);
    expect(filters.months).toEqual([0, 1, 2, 3, 4, 5, 11]);
  });
});

describe("finerScope", () => {
  it("baja un peldaño de la escalera y se para en el día", () => {
    expect(finerScope("anual")).toBe("semestral");
    expect(finerScope("semestral")).toBe("trimestral");
    expect(finerScope("trimestral")).toBe("mensual");
    expect(finerScope("mensual")).toBe("dia");
    expect(finerScope("dia")).toBeNull();
  });
});

describe("periodLabel · periodos completos", () => {
  it("dice «T1» cuando lo marcado ES un trimestre", () => {
    expect(periodLabel([0, 1, 2], [])).toBe("T1");
    expect(periodLabel([9, 10, 11], [])).toBe("T4");
    expect(periodLabel([0, 1, 2, 3, 4, 5], [])).toBe("S1");
    expect(
      periodLabel(
        Array.from({ length: 12 }, (_, m) => m),
        [],
      ),
    ).toBe("Todo el año");
  });

  it("no llama «T1» a dos tercios de un trimestre", () => {
    expect(periodLabel([0, 1], [])).toBe("Ene · Feb");
  });

  it("un día marcado manda sobre el nombre del trimestre", () => {
    expect(periodLabel([0, 1, 2], [4])).toBe("día 5 de Ene · Feb · Mar");
  });
});

describe("periodLabel · meses sueltos y días", () => {
  it("dice el periodo, no cuántas casillas hay marcadas", () => {
    expect(periodLabel([], [])).toBe("Todo el año");
    expect(periodLabel([0], [])).toBe("Enero");
    expect(periodLabel([0, 2], [])).toBe("Ene · Mar");
    expect(periodLabel([0], [4])).toBe("5 de enero");
    expect(periodLabel([0], [4, 11])).toBe("días 5, 12 de enero");
    expect(periodLabel([0, 2], [4])).toBe("día 5 de Ene · Mar");
  });
});

describe("periodPhrase", () => {
  it("baja a minúsculas para el medio de una frase, pero no destroza un código", () => {
    expect(periodPhrase([0], [])).toBe("enero");
    expect(periodPhrase([], [])).toBe("todo el año");
    expect(periodPhrase([0, 1, 2], [])).toBe("T1");
    expect(periodPhrase([0, 1, 2, 3, 4, 5], [])).toBe("S1");
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
