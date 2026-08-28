import { describe, expect, it } from "vitest";
import {
  activeMarkCount,
  describeServiceScope,
  emptyFilters,
  periodLabel,
  sanitizeFilters,
  scopedPeriodLabel,
  selectedMonths,
  withAllYears,
  withMonthToggled,
  withMonthsCleared,
  withServiceToggled,
  withServicesCleared,
  withYearToggled,
  type SalesUniverse,
} from "./filters";

const UNIVERSE: SalesUniverse = {
  years: [2024, 2025, 2026],
  months: [0, 1, 3],
  services: [
    { code: "\\01", name: "HONORARIOS" },
    { code: "\\02", name: "MEDICINAS" },
    { code: "\\03", name: "INSUMOS" },
  ],
};

describe("sanitizeFilters", () => {
  it("sin marcas abre en el año MÁS RECIENTE, no en todos", () => {
    // The house rule is «no mark is all of them», and here it is broken on purpose: entering while
    // summing three exercises reads badly before touching a filter.
    expect(sanitizeFilters(emptyFilters(), UNIVERSE).years).toEqual([2026]);
  });

  it("un año que este cliente no tiene se poda", () => {
    expect(
      sanitizeFilters({ years: [2019, 2025], months: [], services: [] }, UNIVERSE).years,
    ).toEqual([2025]);
  });

  it("podados TODOS, vuelve al más reciente en vez de quedarse vacío", () => {
    expect(sanitizeFilters({ years: [2019], months: [], services: [] }, UNIVERSE).years).toEqual([
      2026,
    ]);
  });

  it("sin años cargados no hay nada que marcar", () => {
    expect(sanitizeFilters(emptyFilters(), { years: [], months: [], services: [] }).years).toEqual(
      [],
    );
  });

  it("los años salen en orden del universo, no en el de las marcas", () => {
    expect(
      sanitizeFilters({ years: [2026, 2024], months: [], services: [] }, UNIVERSE).years,
    ).toEqual([2024, 2026]);
  });

  it("poda los meses que los años marcados no tienen", () => {
    expect(
      sanitizeFilters({ years: [2026], months: [0, 5], services: [] }, UNIVERSE).months,
    ).toEqual([0]);
  });
});

describe("marcas de año", () => {
  it("marcar añade en orden del universo", () => {
    expect(
      withYearToggled({ years: [2026], months: [], services: [] }, 2024, UNIVERSE.years).years,
    ).toEqual([2024, 2026]);
  });

  it("volver a marcarlo lo quita", () => {
    expect(
      withYearToggled({ years: [2026], months: [], services: [] }, 2026, UNIVERSE.years).years,
    ).toEqual([]);
  });

  it("los MESES sobreviven al cambio de año: «Abr» ya no es «el abril de 2026»", () => {
    const filters = withYearToggled(
      { years: [2026], months: [3], services: [] },
      2025,
      UNIVERSE.years,
    );
    expect(filters.months).toEqual([3]);
  });

  it("«Todos los años» PUEBLA la lista, porque vacío aquí significa «el más reciente»", () => {
    expect(withAllYears({ years: [2026], months: [], services: [] }, UNIVERSE.years).years).toEqual(
      [2024, 2025, 2026],
    );
  });
});

describe("marcas de mes", () => {
  it("marcar un mes lo añade en orden del universo", () => {
    expect(
      withMonthToggled({ years: [2026], months: [3], services: [] }, 0, UNIVERSE.months).months,
    ).toEqual([0, 3]);
  });

  it("«todos los meses» vacía la lista, que es como esta app escribe «sin filtro»", () => {
    expect(withMonthsCleared({ years: [2026], months: [0, 3], services: [] }).months).toEqual([]);
  });

  it("solo los meses cuentan como marcas: el año nunca está vacío y no lleva chip", () => {
    expect(activeMarkCount({ years: [2024, 2026], months: [], services: [] })).toBe(0);
    expect(activeMarkCount({ years: [2026], months: [3], services: [] })).toBe(1);
  });
});

describe("selectedMonths", () => {
  it("sin marcas suma TODOS los meses cargados de los años marcados", () => {
    expect(selectedMonths({ years: [2026], months: [], services: [] }, UNIVERSE)).toEqual([
      0, 1, 3,
    ]);
  });

  it("con marcas suma exactamente esas", () => {
    expect(selectedMonths({ years: [2026], months: [3], services: [] }, UNIVERSE)).toEqual([3]);
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
    // Repeating «abril» for each year is what makes a comparison label illegible.
    expect(periodLabel([3], [2025, 2026])).toBe("Abr · 2025, 2026");
    expect(periodLabel([0, 1, 2], [2024, 2025, 2026])).toBe("Ene–Mar · 2024, 2025, 2026");
  });

  it("sin años no hay periodo que nombrar", () => {
    expect(periodLabel([3], [])).toBe("Sin datos");
  });
});

describe("marca de servicio", () => {
  it("marcar y desmarcar, en orden del universo y no del clic", () => {
    const marked = withServiceToggled(
      { years: [2026], months: [], services: ["\\03"] },
      "\\01",
      UNIVERSE.services.map((service) => service.code),
    );
    expect(marked.services).toEqual(["\\01", "\\03"]);
    expect(
      withServiceToggled(
        marked,
        "\\01",
        UNIVERSE.services.map((service) => service.code),
      ).services,
    ).toEqual(["\\03"]);
  });

  it("ninguna marca es TODOS, la regla de la casa", () => {
    expect(emptyFilters().services).toEqual([]);
    expect(withServicesCleared({ years: [2026], months: [], services: ["\\01"] }).services).toEqual(
      [],
    );
  });

  it("un servicio que este cliente no tiene se poda en lectura", () => {
    expect(
      sanitizeFilters({ years: [2026], months: [], services: ["\\09", "\\02"] }, UNIVERSE).services,
    ).toEqual(["\\02"]);
  });

  it("cuenta como marca activa, junto a los meses", () => {
    expect(activeMarkCount({ years: [2026], months: [3], services: ["\\01"] })).toBe(2);
  });
});

describe("describeServiceScope", () => {
  it("sin marcas no hay tramo que nombrar", () => {
    expect(describeServiceScope(emptyFilters(), UNIVERSE)).toBeNull();
  });

  it("con uno marcado dice su NOMBRE, que es lo que el usuario reconoce", () => {
    expect(describeServiceScope({ years: [2026], months: [], services: ["\\02"] }, UNIVERSE)).toBe(
      "MEDICINAS",
    );
  });

  it("con varios dice cuántos de cuántos, porque los nombres no caben", () => {
    expect(
      describeServiceScope({ years: [2026], months: [], services: ["\\01", "\\02"] }, UNIVERSE),
    ).toBe("2 de 3 servicios");
  });

  it("una marca huérfana vale como ninguna", () => {
    expect(
      describeServiceScope({ years: [2026], months: [], services: ["\\09"] }, UNIVERSE),
    ).toBeNull();
  });
});

describe("scopedPeriodLabel", () => {
  it("sin servicios marcados es el periodo tal cual", () => {
    expect(scopedPeriodLabel(null, "Abril 2026")).toBe("Abril 2026");
  });

  it("con marca, el tramo va DELANTE del periodo", () => {
    expect(scopedPeriodLabel("MEDICINAS", "Abril 2026")).toBe("MEDICINAS · Abril 2026");
  });
});
