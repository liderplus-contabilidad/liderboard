import { describe, expect, it } from "vitest";
import { namedSpans, type NamedSpan } from "@/lib/period";
import { ALL_MONTHS } from "./fixtures";
import {
  activeMarkCount,
  availableSpans,
  emptyFilters,
  markedSpanOf,
  monthSpanLabel,
  namedSpanLabel,
  periodLabel,
  spanIsMarked,
  withSpanToggled,
  sanitizeFilters,
  scopedPeriodLabel,
  selectedMonths,
  withYearsCleared,
  withMonthsCleared,
  withMonthToggled,
  withYearToggled,
  type RevenueUniverse,
} from "./filters";

const UNIVERSE: RevenueUniverse = {
  years: [2022, 2023, 2024, 2026],
  months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

describe("sanitizeFilters", () => {
  it("sin marcas de año se ven TODOS: es donde abre la pantalla", () => {
    const clean = sanitizeFilters(emptyFilters(), UNIVERSE);

    expect(clean.years).toEqual([2022, 2023, 2024, 2026]);
  });

  it("poda un año que el cliente ya no tiene", () => {
    // 2025 nunca se cargó: una marca suya no cuenta.
    const clean = sanitizeFilters({ years: [2024, 2025], months: [] }, UNIVERSE);

    expect(clean.years).toEqual([2024]);
  });

  it("un año huérfano dejando la lista vacía cae en todos, no en ninguno", () => {
    // 2025 no existe: la marca no cuenta, y lo que queda no es una pantalla en blanco.
    const clean = sanitizeFilters({ years: [2025], months: [] }, UNIVERSE);

    expect(clean.years).toEqual([2022, 2023, 2024, 2026]);
  });

  it("mantiene el orden del UNIVERSO y no el del clic", () => {
    const clean = sanitizeFilters({ years: [2026, 2022], months: [] }, UNIVERSE);

    expect(clean.years).toEqual([2022, 2026]);
  });

  it("poda un mes que los años marcados no tienen", () => {
    const narrow: RevenueUniverse = { years: [2026], months: [0, 1, 2] };
    const clean = sanitizeFilters({ years: [2026], months: [1, 7] }, narrow);

    expect(clean.months).toEqual([1]);
  });

  it("con el cliente sin años no inventa ninguno", () => {
    const clean = sanitizeFilters({ years: [2026], months: [3] }, { years: [], months: [] });

    expect(clean.years).toEqual([]);
    expect(clean.months).toEqual([]);
  });
});

describe("las marcas", () => {
  it("desmarcar el último año devuelve todos, nunca una pantalla vacía", () => {
    const toggled = withYearToggled({ years: [2026], months: [] }, 2026, UNIVERSE.years);

    expect(toggled.years).toEqual([]);
    expect(sanitizeFilters(toggled, UNIVERSE).years).toEqual([2022, 2023, 2024, 2026]);
  });

  it("«todos los años» VACÍA las marcas, como hace «todos los meses»", () => {
    const cleared = withYearsCleared({ years: [2024], months: [] });

    expect(cleared.years).toEqual([]);
    expect(sanitizeFilters(cleared, UNIVERSE).years).toEqual([2022, 2023, 2024, 2026]);
  });

  it("marcar un año concreto sí acota a ese año", () => {
    const one = withYearToggled(emptyFilters(), 2024, UNIVERSE.years);

    expect(sanitizeFilters(one, UNIVERSE).years).toEqual([2024]);
  });

  it("los meses sobreviven a un cambio de año", () => {
    const marked = withMonthToggled({ years: [2026], months: [] }, 3, UNIVERSE.months);
    const withYear = withYearToggled(marked, 2024, UNIVERSE.years);

    expect(withYear.months).toEqual([3]);
  });

  it("los meses se guardan en orden de universo", () => {
    let filters = emptyFilters();
    filters = withMonthToggled(filters, 6, UNIVERSE.months);
    filters = withMonthToggled(filters, 0, UNIVERSE.months);

    expect(filters.months).toEqual([0, 6]);
  });

  it("limpiar los meses los devuelve a «todos los cargados»", () => {
    const cleared = withMonthsCleared({ years: [2026], months: [0, 1] });

    expect(cleared.months).toEqual([]);
    expect(selectedMonths(cleared, UNIVERSE)).toEqual(UNIVERSE.months);
  });
});

describe("selectedMonths", () => {
  it("ninguna marca es todos los meses cargados", () => {
    expect(selectedMonths({ years: [2026], months: [] }, UNIVERSE)).toEqual(UNIVERSE.months);
  });

  it("con marcas es exactamente lo marcado", () => {
    expect(selectedMonths({ years: [2026], months: [0, 1] }, UNIVERSE)).toEqual([0, 1]);
  });
});

describe("periodLabel", () => {
  it("un tramo contiguo se escribe como rango", () => {
    expect(periodLabel([0, 1, 2, 3, 4, 5, 6], [2026])).toBe("Ene–Jul 2026");
  });

  it("un tramo con huecos se ENUMERA, para no afirmar los meses que faltan", () => {
    expect(periodLabel([0, 2, 3], [2026])).toBe("Ene, Mar, Abr 2026");
  });

  it("con varios años los meses se escriben una vez y los años detrás", () => {
    expect(periodLabel([0, 1, 2], [2024, 2026])).toBe("Ene–Mar · 2024, 2026");
  });

  it("un solo mes con un año va en su nombre completo", () => {
    expect(periodLabel([3], [2026])).toBe("Abril 2026");
  });

  it("sin meses marcados es el año a secas", () => {
    expect(periodLabel([], [2026])).toBe("2026");
  });

  it("sin años no hay periodo que nombrar", () => {
    expect(periodLabel([0], [])).toBe("Sin datos");
  });
});

describe("scopedPeriodLabel", () => {
  it("antepone el recorte cuando lo hay", () => {
    expect(scopedPeriodLabel("Cobros con tarjeta", "Ene–Jun 2026")).toBe(
      "Cobros con tarjeta · Ene–Jun 2026",
    );
  });

  it("sin recorte es el periodo tal cual", () => {
    expect(scopedPeriodLabel(null, "Ene–Jul 2026")).toBe("Ene–Jul 2026");
  });
});

describe("activeMarkCount", () => {
  it("cuenta los meses", () => {
    expect(activeMarkCount({ years: [2026], months: [0, 1] })).toBe(2);
  });

  it("NUNCA cuenta los años: la pantalla abre con todos marcados y la tira nacería llena", () => {
    expect(activeMarkCount({ years: [2022, 2023, 2024, 2026], months: [] })).toBe(0);
  });
});

describe("monthSpanLabel · UNA definición del rótulo", () => {
  it("un tramo contiguo se escribe como rango", () => {
    expect(monthSpanLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Ene–Jul");
  });

  it("un mes solo va con su nombre completo", () => {
    expect(monthSpanLabel([3])).toBe("Abril");
  });

  it("un conjunto con huecos se ENUMERA: «Ene–Abr» afirmaría que febrero entra", () => {
    expect(monthSpanLabel([0, 2, 3])).toBe("Ene, Mar, Abr");
  });

  it("sin meses devuelve null, para que quien componga diga en voz alta qué significa", () => {
    expect(monthSpanLabel([])).toBeNull();
  });

  it("periodLabel se compone sobre él y no sobre una segunda regla", () => {
    expect(periodLabel([0, 1, 2, 3, 4, 5, 6], [2026])).toBe("Ene–Jul 2026");
    expect(periodLabel([0, 2], [2024, 2026])).toBe("Ene, Mar · 2024, 2026");
  });
});

describe("semestre y quimestre · ATAJOS sobre los meses", () => {
  const universe = ALL_MONTHS;

  it("marcar S1 equivale a marcar Ene–Jun", () => {
    const s1 = namedSpans("semestre")[0];
    const bySpan = withSpanToggled(emptyFilters(), s1, universe);
    const byHand = [0, 1, 2, 3, 4, 5].reduce(
      (filters, month) => withMonthToggled(filters, month, universe),
      emptyFilters(),
    );

    expect(bySpan.months).toEqual([0, 1, 2, 3, 4, 5]);
    expect(bySpan.months).toEqual(byHand.months);
  });

  it("el quimestre es de cinco meses y Q3 son los dos que sobran", () => {
    const spans = namedSpans("quimestre");

    expect(spans.map((span) => span.code)).toEqual(["Q1", "Q2", "Q3"]);
    expect(spans[0].months).toEqual([0, 1, 2, 3, 4]);
    expect(spans[1].months).toEqual([5, 6, 7, 8, 9]);
    expect(spans[2].months).toEqual([10, 11]);
    // Los tres cubren el año entero: ningún mes queda inalcanzable desde el atajo.
    expect(spans.flatMap((span) => span.months)).toEqual(ALL_MONTHS);
  });

  it("volver a marcarlo lo DESMARCA, como cualquier otra marca", () => {
    const q2 = namedSpans("quimestre")[1];
    const marked = withSpanToggled(emptyFilters(), q2, universe);

    expect(withSpanToggled(marked, q2, universe).months).toEqual([]);
  });

  it("solo marca los meses CARGADOS: un atajo no puede elegir un mes que no existe", () => {
    const loaded = [0, 1, 2, 3, 4, 5, 6];
    const s2 = namedSpans("semestre")[1];

    // S2 es jul–dic y de ellos solo julio llegó.
    expect(withSpanToggled(emptyFilters(), s2, loaded).months).toEqual([6]);
  });

  it("la opción se marca cuando TODO su tramo cargado lo está", () => {
    const q1 = namedSpans("quimestre")[0];
    const marked = withSpanToggled(emptyFilters(), q1, universe);

    expect(spanIsMarked(marked, q1, universe)).toBe(true);
    expect(spanIsMarked(emptyFilters(), q1, universe)).toBe(false);
    // Desmarcar un solo mes deja de ser el tramo.
    expect(spanIsMarked(withMonthToggled(marked, 2, universe), q1, universe)).toBe(false);
  });

  it("un tramo sin ningún mes cargado NO se ofrece", () => {
    expect(availableSpans("quimestre", [0, 1, 2]).map((span) => span.code)).toEqual(["Q1"]);
  });

  it("el chip es DERIVADO: las marcas que SON un tramo se nombran por él", () => {
    const q1 = namedSpans("quimestre")[0];
    const marked = withSpanToggled(emptyFilters(), q1, universe);

    expect(markedSpanOf(marked.months)?.code).toBe("Q1");
    expect(namedSpanLabel(markedSpanOf(marked.months) as NamedSpan)).toBe("Q1 · Ene–May");
  });

  it("marcar S2 sobre un año que llega a julio NO se rotula «S2»: sería la mentira de bucketLabel", () => {
    const s2 = namedSpans("semestre")[1];
    const marked = withSpanToggled(emptyFilters(), s2, [0, 1, 2, 3, 4, 5, 6]);

    expect(marked.months).toEqual([6]);
    expect(markedSpanOf(marked.months)).toBeNull();
  });
});
