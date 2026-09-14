import { describe, expect, it } from "vitest";
import {
  activeMarkCount,
  describeGroupScope,
  emptyFilters,
  groupAxis,
  includesGroup,
  periodLabel,
  sanitizeFilters,
  scopedPeriodLabel,
  selectedMonths,
  withAllYears,
  withGroupsCleared,
  withGroupToggled,
  withMonthsCleared,
  withMonthToggled,
  withSectionToggled,
  withYearToggled,
  yearMarkLabel,
  monthMarkLabel,
  type PersonnelCostUniverse,
} from "./filters";

const UNIVERSE: PersonnelCostUniverse = { years: [2024, 2025, 2026], months: [0, 1, 2, 3, 4, 5] };

describe("El año: la excepción declarada a «ninguna marca = todas»", () => {
  it("sin marcas resuelve al MÁS RECIENTE y no a todos", () => {
    expect(sanitizeFilters(emptyFilters(), UNIVERSE).years).toEqual([2026]);
  });

  it("marcar varios los deja ascendentes, en el orden del universo", () => {
    const filters = withYearToggled(
      withYearToggled(emptyFilters(), 2026, UNIVERSE.years),
      2024,
      UNIVERSE.years,
    );
    expect(filters.years).toEqual([2024, 2026]);
  });

  it("«Todos los años» PUEBLA la lista, no la vacía", () => {
    expect(withAllYears(emptyFilters(), UNIVERSE.years).years).toEqual([2024, 2025, 2026]);
  });

  it("desmarcar el último vuelve al más reciente en vez de dejar la pantalla sin nada", () => {
    const marked = withYearToggled(emptyFilters(), 2024, UNIVERSE.years);
    const empty = withYearToggled(marked, 2024, UNIVERSE.years);
    expect(sanitizeFilters(empty, UNIVERSE).years).toEqual([2026]);
  });

  it("un año que este cliente no tiene se poda en la LECTURA", () => {
    const stale = { ...emptyFilters(), years: [2019] };
    expect(sanitizeFilters(stale, UNIVERSE).years).toEqual([2026]);
  });
});

describe("El mes es independiente del año", () => {
  it("sobrevive a quitar un año", () => {
    let filters = withMonthToggled(emptyFilters(), 3, UNIVERSE.months);
    filters = withYearToggled(filters, 2025, UNIVERSE.years);
    filters = withYearToggled(filters, 2025, UNIVERSE.years);
    expect(filters.months).toEqual([3]);
  });

  it("sin marcas el tramo son todos los meses cubiertos", () => {
    expect(selectedMonths(sanitizeFilters(emptyFilters(), UNIVERSE), UNIVERSE)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("una marca huérfana no acota nada", () => {
    const stale = { ...emptyFilters(), months: [11] };
    expect(sanitizeFilters(stale, UNIVERSE).months).toEqual([]);
  });

  it("se limpian de una vez", () => {
    const filters = withMonthToggled(emptyFilters(), 2, UNIVERSE.months);
    expect(withMonthsCleared(filters).months).toEqual([]);
  });
});

describe("El grupo sigue la regla de la casa", () => {
  it("ninguna marca es TODOS", () => {
    const filters = emptyFilters();
    expect(includesGroup(filters, "afiliados")).toBe(true);
    expect(includesGroup(filters, "honorarios-medicos")).toBe(true);
  });

  it("una marca deja fuera a los otros dos", () => {
    const filters = withGroupToggled(emptyFilters(), "afiliados");
    expect(includesGroup(filters, "afiliados")).toBe(true);
    expect(includesGroup(filters, "no-afiliados")).toBe(false);
  });

  it("se guardan en el orden del MAPA y no en el de los clics", () => {
    let filters = withGroupToggled(emptyFilters(), "honorarios-medicos");
    filters = withGroupToggled(filters, "afiliados");
    expect(filters.groups).toEqual(["afiliados", "honorarios-medicos"]);
  });

  it("marcarlos todos no dice nada, y el rótulo lo refleja", () => {
    let filters = withGroupToggled(emptyFilters(), "afiliados");
    filters = withGroupToggled(filters, "no-afiliados");
    filters = withGroupToggled(filters, "honorarios-medicos");
    expect(describeGroupScope(filters)).toBeNull();
    expect(describeGroupScope(withGroupsCleared(filters))).toBeNull();
  });

  it("con uno el rótulo es su nombre; con dos, cuántos de cuántos", () => {
    const one = withGroupToggled(emptyFilters(), "no-afiliados");
    expect(describeGroupScope(one)).toBe("No afiliados");
    expect(describeGroupScope(withGroupToggled(one, "afiliados"))).toBe("2 de 3 grupos");
  });
});

describe("El rótulo del tramo", () => {
  it("un año y un tramo contiguo", () => {
    expect(periodLabel([0, 1, 2, 3, 4, 5], [2026])).toBe("Ene–Jun 2026");
  });

  it("varios años escriben los meses UNA vez", () => {
    expect(periodLabel([3], [2025, 2026])).toBe("Abril · 2025, 2026");
  });

  it("el grupo marcado va delante", () => {
    expect(scopedPeriodLabel("No afiliados", "Ene–Jun 2026")).toBe("No afiliados · Ene–Jun 2026");
    expect(scopedPeriodLabel(null, "Ene–Jun 2026")).toBe("Ene–Jun 2026");
  });
});

describe("El rótulo de la barra dice «Todos» en vez de listarlo todo", () => {
  it("con todos los años marcados el trigger no enumera los ejercicios", () => {
    expect(yearMarkLabel(withAllYears(emptyFilters(), UNIVERSE.years).years, UNIVERSE.years)).toBe(
      "Todos los años",
    );
  });

  it("una selección parcial sí se escribe", () => {
    const filters = withYearToggled(emptyFilters(), 2025, UNIVERSE.years);
    expect(yearMarkLabel(sanitizeFilters(filters, UNIVERSE).years, UNIVERSE.years)).toBe("2025");
  });

  it("marcar los seis meses a mano dice «Todos»", () => {
    const filters = UNIVERSE.months.reduce(
      (acc, month) => withMonthToggled(acc, month, UNIVERSE.months),
      emptyFilters(),
    );
    expect(monthMarkLabel(filters.months, UNIVERSE.months)).toBe("Todos los meses");
  });

  it("sin marcas es el mismo tramo, y se nombra igual", () => {
    expect(monthMarkLabel(emptyFilters().months, UNIVERSE.months)).toBe("Todos los meses");
  });

  it("una selección parcial enumera los meses marcados", () => {
    const filters = withMonthToggled(
      withMonthToggled(emptyFilters(), 0, UNIVERSE.months),
      3,
      UNIVERSE.months,
    );
    expect(monthMarkLabel(filters.months, UNIVERSE.months)).toBe("Ene, Abr");
  });
});

describe("Los chips cuentan meses y grupos, nunca años", () => {
  it("el año nunca deja un chip porque nunca puede quedar vacío", () => {
    const filters = withAllYears(emptyFilters(), UNIVERSE.years);
    expect(activeMarkCount(filters)).toBe(0);
    expect(
      activeMarkCount(withMonthToggled(withGroupToggled(filters, "afiliados"), 1, UNIVERSE.months)),
    ).toBe(2);
  });
});

describe("La sección es el otro eje del mismo recorte", () => {
  it("marcar una sección marca sus grupos, y el motor sigue leyendo grupos", () => {
    const filters = withSectionToggled(emptyFilters(), "planta");
    expect(filters.sections).toEqual(["planta"]);
    expect(filters.groups).toEqual(["afiliados", "no-afiliados"]);
    expect(includesGroup(filters, "honorarios-medicos")).toBe(false);
  });

  it("desmarcarla devuelve el recorte a «todos»", () => {
    const filters = withSectionToggled(withSectionToggled(emptyFilters(), "planta"), "planta");
    expect(filters.sections).toEqual([]);
    expect(filters.groups).toEqual([]);
  });

  it("las dos secciones son todos los grupos, y el rótulo lo refleja", () => {
    let filters = withSectionToggled(emptyFilters(), "externos");
    expect(describeGroupScope(filters)).toBe("Externos");
    filters = withSectionToggled(filters, "planta");
    expect(describeGroupScope(filters)).toBeNull();
  });

  it("un eje bloquea al otro: con grupos marcados no hay sección, y al revés", () => {
    const byGroup = withGroupToggled(emptyFilters(), "afiliados");
    expect(groupAxis(byGroup)).toBe("group");
    const bySection = withSectionToggled(emptyFilters(), "planta");
    expect(groupAxis(bySection)).toBe("section");
    expect(groupAxis(emptyFilters())).toBeNull();
  });

  it("los chips cuentan una sección como una marca, no como sus dos grupos", () => {
    expect(activeMarkCount(withSectionToggled(emptyFilters(), "planta"))).toBe(1);
  });

  it("limpiar grupos limpia también las secciones", () => {
    const filters = withGroupsCleared(withSectionToggled(emptyFilters(), "planta"));
    expect(filters.sections).toEqual([]);
    expect(filters.groups).toEqual([]);
  });

  it("sanitizar conserva la sección y rederiva sus grupos", () => {
    const filters = sanitizeFilters(
      { years: [], months: [], groups: ["afiliados"], sections: ["externos"] },
      UNIVERSE,
    );
    expect(filters.sections).toEqual(["externos"]);
    expect(filters.groups).toEqual(["honorarios-medicos"]);
  });
});
