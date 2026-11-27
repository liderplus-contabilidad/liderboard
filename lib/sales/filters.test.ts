import { describe, expect, it } from "vitest";
import {
  activeMarkCount,
  buildSalesUniverse,
  describeScope,
  emptyFilters,
  narrowLines,
  periodLabel,
  resolveOpenType,
  resolveYears,
  sanitizeFilters,
  scopedPeriodLabel,
  withAllYears,
  withChoiceToggled,
  withMonthToggled,
  withYearToggled,
  type SalesFilters,
} from "./filters";
import type { SalesCoverage, SalesLine } from "./types";

function line(overrides: Partial<SalesLine> = {}): SalesLine {
  return {
    seguro: "PARTICULAR",
    tipo: "MEDICINAS",
    articleCode: "000156",
    articleName: "CLARITROMICINA",
    vendor: "",
    amount: 10,
    ...overrides,
  };
}

function cover(year: number, monthIndex: number): SalesCoverage {
  return {
    id: `c:${year}-${monthIndex}`,
    clientId: "c",
    year,
    monthIndex,
    lineCount: 1,
    firstDay: 1,
    lastDay: 28,
    companyCode: "01",
  };
}

const COVERAGE = [cover(2025, 10), cover(2026, 0), cover(2026, 2), cover(2026, 3)];

const LINES = [
  line({ seguro: "PARTICULAR", tipo: "MEDICINAS", articleCode: "A", amount: 100, vendor: "V1" }),
  line({ seguro: "HUMANA", tipo: "IMAGENES", articleCode: "B", amount: 60 }),
  line({ seguro: "PARTICULAR", tipo: "IMAGENES", articleCode: "C", amount: 40, vendor: "V2" }),
];

function filters(overrides: Partial<SalesFilters> = {}): SalesFilters {
  return { ...emptyFilters(), ...overrides };
}

describe("resolveYears", () => {
  it("sin marca resuelve al año MÁS RECIENTE, nunca a todos", () => {
    expect(resolveYears(emptyFilters(), COVERAGE)).toEqual([2026]);
  });

  it("con marcas devuelve las que existen, en orden ascendente", () => {
    expect(resolveYears(filters({ years: [2026, 2025] }), COVERAGE)).toEqual([2025, 2026]);
  });

  it("una marca de un año que el cliente no tiene no sobrevive, y la lista vuelve al más reciente", () => {
    expect(resolveYears(filters({ years: [2019] }), COVERAGE)).toEqual([2026]);
  });
});

describe("buildSalesUniverse", () => {
  it("los años y los meses salen de la COBERTURA, los demás ejes de las líneas", () => {
    const universe = buildSalesUniverse(COVERAGE, LINES, [2026], []);
    expect(universe.years).toEqual([2025, 2026]);
    expect(universe.months).toEqual([0, 2, 3]);
    expect(universe.seguros.map((s) => s.id)).toEqual(["PARTICULAR", "HUMANA"]);
    // MEDICINAS 100 e IMAGENES 60+40=100 empatan, y el desempate es alfabético.
    expect(universe.tipos.map((t) => t.id)).toEqual(["IMAGENES", "MEDICINAS"]);
    expect(universe.vendors.map((v) => v.id)).toEqual(["V1", "V2"]);
  });

  it("ordena por IMPORTE de mayor a menor, igual que las tarjetas", () => {
    const universe = buildSalesUniverse(COVERAGE, LINES, [2026], []);
    // PARTICULAR 100+40=140 por delante de HUMANA 60.
    expect(universe.seguros.map((s) => s.id)).toEqual(["PARTICULAR", "HUMANA"]);
  });

  it("un empate de importe se desempata por nombre, para que el orden no dependa del azar", () => {
    const universe = buildSalesUniverse(
      COVERAGE,
      [line({ seguro: "ZETA", amount: 10 }), line({ seguro: "ALFA", amount: 10 })],
      [2026],
      [],
    );
    expect(universe.seguros.map((s) => s.id)).toEqual(["ALFA", "ZETA"]);
  });

  it("«Artículo» lista solo los artículos de los tipos marcados", () => {
    const universe = buildSalesUniverse(COVERAGE, LINES, [2026], ["IMAGENES"]);
    expect(universe.articles.map((a) => a.id)).toEqual(["B", "C"]);
  });

  it("una marca de tipo HUÉRFANA no deja la lista de artículos vacía: vale como ninguna", () => {
    const universe = buildSalesUniverse(COVERAGE, LINES, [2026], ["TIPO QUE NO EXISTE"]);
    expect(universe.articles).toHaveLength(3);
  });

  it("la etiqueta del artículo es su NOMBRE; la identidad sigue siendo el código", () => {
    const universe = buildSalesUniverse(
      COVERAGE,
      [line({ articleCode: "99204CARD", articleName: "Visita en la oficina" })],
      [2026],
      [],
    );
    expect(universe.articles[0]).toEqual({ id: "99204CARD", label: "Visita en la oficina" });
  });

  it("en el desplegable, dos artículos del mismo nombre se distinguen por su código", () => {
    const universe = buildSalesUniverse(
      COVERAGE,
      [
        line({ articleCode: "99204CARD", articleName: "Visita en la oficina", amount: 30 }),
        line({ articleCode: "99204PED", articleName: "Visita en la oficina", amount: 20 }),
      ],
      [2026],
      [],
    );
    expect(universe.articles.map((a) => a.label)).toEqual([
      "Visita en la oficina · 99204CARD",
      "Visita en la oficina · 99204PED",
    ]);
  });
});

describe("sanitizeFilters", () => {
  const universe = buildSalesUniverse(COVERAGE, LINES, [2026], []);

  it("poda las marcas huérfanas", () => {
    const clean = sanitizeFilters(
      filters({ seguros: ["PARTICULAR", "DE OTRO CLIENTE"], months: [0, 7] }),
      universe,
    );
    expect(clean.seguros).toEqual(["PARTICULAR"]);
    expect(clean.months).toEqual([0]);
  });

  it("guarda en orden del UNIVERSO y no en el del clic", () => {
    const clean = sanitizeFilters(filters({ seguros: ["HUMANA", "PARTICULAR"] }), universe);
    expect(clean.seguros).toEqual(["PARTICULAR", "HUMANA"]);
  });

  it("un artículo cuyo tipo dejó de estar marcado se poda solo, sin que ningún efecto lo note", () => {
    const narrowed = buildSalesUniverse(COVERAGE, LINES, [2026], ["IMAGENES"]);
    const clean = sanitizeFilters(filters({ tipos: ["IMAGENES"], articles: ["A", "B"] }), narrowed);
    // «A» es de MEDICINAS: ya no está en el universo de artículos, así que desaparece.
    expect(clean.articles).toEqual(["B"]);
  });

  it("el año nunca queda vacío", () => {
    expect(sanitizeFilters(filters({ years: [1999] }), universe).years).toEqual([2026]);
  });
});

describe("narrowLines", () => {
  it("cruza los ejes con Y", () => {
    const narrowed = narrowLines(LINES, filters({ seguros: ["PARTICULAR"], tipos: ["IMAGENES"] }));
    expect(narrowed.map((l) => l.articleCode)).toEqual(["C"]);
  });

  it("acota por artículo usando el CÓDIGO", () => {
    expect(narrowLines(LINES, filters({ articles: ["B"] }))).toHaveLength(1);
  });
});

describe("los interruptores de las marcas", () => {
  const universe = buildSalesUniverse(COVERAGE, LINES, [2026], []);

  it("«Todos los años» POBLA la lista, no la vacía", () => {
    expect(withAllYears(emptyFilters(), universe.years).years).toEqual([2025, 2026]);
  });

  it("los meses sobreviven a un cambio de año: «Abr» ya no significa «abril de 2026»", () => {
    const withMonth = withMonthToggled(emptyFilters(), 3, universe.months);
    expect(withYearToggled(withMonth, 2025, universe.years).months).toEqual([3]);
  });

  it("un eje de ids se marca en orden del universo", () => {
    const marked = withChoiceToggled(
      withChoiceToggled(emptyFilters(), "seguros", "HUMANA", universe.seguros),
      "seguros",
      "PARTICULAR",
      universe.seguros,
    );
    expect(marked.seguros).toEqual(["PARTICULAR", "HUMANA"]);
  });
});

describe("describeScope", () => {
  const universe = buildSalesUniverse(COVERAGE, LINES, [2026], []);

  it("con una marca es su NOMBRE", () => {
    expect(describeScope(filters({ seguros: ["HUMANA"] }), universe)).toBe("HUMANA");
  });

  it("con varias dice cuántas de cuántas", () => {
    expect(describeScope(filters({ seguros: ["HUMANA", "PARTICULAR"] }), universe)).toBe(
      "2 de 2 seguros",
    );
  });

  it("varios ejes a la vez se encadenan en el orden de la barra", () => {
    expect(describeScope(filters({ seguros: ["HUMANA"], tipos: ["IMAGENES"] }), universe)).toBe(
      "HUMANA · IMAGENES",
    );
  });

  it("una marca huérfana no nombra nada", () => {
    expect(describeScope(filters({ seguros: ["NO EXISTE"] }), universe)).toBeNull();
  });
});

describe("periodLabel", () => {
  it("meses contiguos como rango", () => {
    expect(periodLabel([0, 1, 2], [2026])).toBe("Ene–Mar 2026");
  });

  it("meses con hueco se ENUMERAN: un rango afirmaría que febrero está sumado", () => {
    expect(periodLabel([0, 2, 3], [2026])).toBe("Ene, Mar, Abr 2026");
  });

  it("con varios años los meses se escriben una vez y los años detrás", () => {
    expect(periodLabel([3], [2025, 2026])).toBe("Abr · 2025, 2026");
  });
});

describe("resolveOpenType", () => {
  it("con UN tipo marcado en la barra, la composición se abre en él, fijada", () => {
    expect(resolveOpenType(null, filters({ tipos: ["MEDICINAS"] }))).toEqual({
      id: "MEDICINAS",
      pinned: true,
    });
  });

  it("el tipo marcado manda sobre la barra que se hubiera pulsado antes", () => {
    expect(resolveOpenType("IMAGENES", filters({ tipos: ["MEDICINAS"] }))?.id).toBe("MEDICINAS");
  });

  it("con varios tipos marcados o ninguno, vale la barra pulsada, sin fijar", () => {
    expect(resolveOpenType("IMAGENES", filters({ tipos: ["MEDICINAS", "IMAGENES"] }))).toEqual({
      id: "IMAGENES",
      pinned: false,
    });
    expect(resolveOpenType(null, emptyFilters())).toBeNull();
  });
});

describe("scopedPeriodLabel y activeMarkCount", () => {
  it("compone la acotación delante del periodo, una sola vez", () => {
    expect(scopedPeriodLabel("HUMANA", "Abril 2026")).toBe("HUMANA · Abril 2026");
    expect(scopedPeriodLabel(null, "Abril 2026")).toBe("Abril 2026");
  });

  it("cuenta las marcas de todos los ejes MENOS el año, que nunca está vacío", () => {
    expect(
      activeMarkCount(filters({ years: [2025, 2026], months: [1], seguros: ["A"], tipos: ["B"] })),
    ).toBe(3);
  });
});
