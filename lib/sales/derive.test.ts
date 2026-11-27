import { describe, expect, it } from "vitest";
import {
  articlesByType,
  byArticle,
  byInsurer,
  byType,
  byVendor,
  loadedMonths,
  loadedYears,
  monthlySeries,
  monthlyTypeSeries,
  salesTotals,
  shareOf,
  unattributed,
} from "./derive";
import type { SalesCoverage, SalesLine, SalesMonth } from "./types";

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

function month(year: number, monthIndex: number, lines: SalesLine[]): SalesMonth {
  return { id: `c:${year}-${monthIndex}`, clientId: "c", year, monthIndex, lines };
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

describe("byInsurer", () => {
  it("suma por seguro, de mayor a menor", () => {
    const groups = byInsurer([
      line({ seguro: "HUMANA", amount: 50 }),
      line({ seguro: "PARTICULAR", amount: 120 }),
      line({ seguro: "HUMANA", amount: 30 }),
    ]);
    expect(groups.map((g) => [g.id, g.amount])).toEqual([
      ["PARTICULAR", 120],
      ["HUMANA", 80],
    ]);
  });
});

describe("byType", () => {
  it("«SERVICIOS» y «SERVICIOS INSTITUCIONALES» son DISTINTOS y no se fusionan", () => {
    const groups = byType([
      line({ tipo: "SERVICIOS", amount: 525 }),
      line({ tipo: "SERVICIOS INSTITUCIONALES", amount: 1000 }),
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe("byArticle", () => {
  it("la identidad es el CÓDIGO: dos escrituras del nombre siguen siendo un artículo", () => {
    const groups = byArticle([
      line({ articleCode: "001503", articleName: "OXIGENO (O2)", amount: 10 }),
      line({ articleCode: "001503", articleName: "OXIGENO - (O2)", amount: 15 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].amount).toBe(25);
    // La etiqueta es el NOMBRE del primero que declaró el código, y sin código: nadie más se llama
    // así, así que no hace falta para distinguirlo.
    expect(groups[0].label).toBe("OXIGENO (O2)");
  });

  it("CUARENTA Y DOS códigos con el mismo nombre truncado siguen siendo cuarenta y dos artículos", () => {
    const truncated = "Visita en la oficina de un nuevo paciente que requiere de tr";
    const specialities = [
      "CARD",
      "CARDH",
      "CIRCA",
      "CIRGE",
      "CIRGEH",
      "CIRPE",
      "CIRPEH",
      "CIRPL",
      "CIRVA",
      "CIRVAH",
      "EMA",
      "ENDO",
      "ENDOH",
      "GAS",
      "GASH",
      "GER",
      "GINOB",
      "GINOBH",
      "MEDIN",
      "MEDINH",
      "NEFRO",
      "NEUCI",
      "NEUMO",
      "NEURO",
      "NEUROH",
      "NEUROPED",
      "NUTR",
      "ONCO",
      "ONCOC",
      "ONCOH",
      "OTORR",
      "OTORRH",
      "PED",
      "PEDH",
      "PROC",
      "PROCH",
      "PSICO",
      "REU",
      "TRAUM",
      "TRAUMH",
      "URO",
      "UROH",
    ];
    const groups = byArticle(
      specialities.map((suffix) =>
        line({ articleCode: `99204${suffix}`, articleName: truncated, amount: 100 }),
      ),
    );
    expect(groups).toHaveLength(42);
    // Y cada fila se distingue: aquí SÍ aparece el código, porque el nombre solo no alcanza.
    expect(new Set(groups.map((g) => g.label)).size).toBe(42);
    expect(groups.every((g) => g.label.startsWith(truncated))).toBe(true);
    expect(groups.every((g) => g.label.includes(g.id))).toBe(true);
  });

  it("un código bajo dos tipos sigue siendo UN artículo", () => {
    const groups = byArticle([
      line({ articleCode: "001691", tipo: "INSUMOS", amount: 10 }),
      line({ articleCode: "001691", tipo: "MEDICINAS", amount: 10 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].amount).toBe(20);
  });
});

describe("el código aparece SOLO donde hace falta", () => {
  it("dos artículos con el mismo nombre llevan cada uno el suyo, y los demás siguen limpios", () => {
    const groups = byArticle([
      line({ articleCode: "99204CARD", articleName: "Visita en la oficina", amount: 30 }),
      line({ articleCode: "99204PED", articleName: "Visita en la oficina", amount: 20 }),
      line({ articleCode: "M1", articleName: "PARACETAMOL", amount: 10 }),
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "Visita en la oficina · 99204CARD",
      "Visita en la oficina · 99204PED",
      "PARACETAMOL",
    ]);
  });

  it("que un nombre sea ambiguo depende del CONJUNTO: acotado a uno solo, vuelve a ir sin código", () => {
    const groups = byArticle([
      line({ articleCode: "99204CARD", articleName: "Visita en la oficina", amount: 30 }),
    ]);
    expect(groups[0].label).toBe("Visita en la oficina");
  });
});

describe("articlesByType", () => {
  const lines = [
    line({ tipo: "MEDICINAS", articleCode: "M1", articleName: "PARACETAMOL", amount: 30 }),
    line({ tipo: "MEDICINAS", articleCode: "M2", articleName: "IBUPROFENO", amount: 50 }),
    line({ tipo: "IMAGENES", articleCode: "I1", articleName: "RX TORAX", amount: 200 }),
  ];

  it("abre cada tipo en SUS artículos, de mayor a menor", () => {
    const [imagenes, medicinas] = articlesByType(lines);
    expect(imagenes.id).toBe("IMAGENES");
    expect(medicinas.articles.map((a) => a.label)).toEqual(["IBUPROFENO", "PARACETAMOL"]);
  });

  it("lista los tipos en el MISMO orden que la composición simple", () => {
    expect(articlesByType(lines).map((t) => t.id)).toEqual(byType(lines).map((t) => t.id));
  });

  it("los artículos de un tipo suman la venta del tipo", () => {
    for (const type of articlesByType(lines)) {
      const sum = type.articles.reduce((acc, article) => acc + article.amount, 0);
      expect(sum).toBeCloseTo(type.amount, 6);
    }
  });

  it("un código bajo dos tipos aparece en CADA uno, con la parte que le toca", () => {
    const shared = articlesByType([
      line({ tipo: "INSUMOS", articleCode: "001691", articleName: "GASA", amount: 10 }),
      line({ tipo: "MEDICINAS", articleCode: "001691", articleName: "GASA", amount: 25 }),
    ]);
    expect(shared.find((t) => t.id === "INSUMOS")?.articles[0].amount).toBe(10);
    expect(shared.find((t) => t.id === "MEDICINAS")?.articles[0].amount).toBe(25);
  });

  it("los nombres repetidos se distinguen DENTRO de su tipo, que es donde se comparan", () => {
    const [honorarios] = articlesByType([
      line({ tipo: "HONORARIOS", articleCode: "99204CARD", articleName: "Visita", amount: 30 }),
      line({ tipo: "HONORARIOS", articleCode: "99204PED", articleName: "Visita", amount: 20 }),
    ]);
    expect(honorarios.articles.map((a) => a.label)).toEqual([
      "Visita · 99204CARD",
      "Visita · 99204PED",
    ]);
  });
});

describe("byVendor y unattributed", () => {
  const lines = [
    line({ vendor: "CASTELLANOS LOPEZ RAUL FABRICI", amount: 100 }),
    line({ vendor: "", amount: 300 }),
    line({ vendor: "", amount: 100 }),
  ];

  it("el ranking excluye las líneas sin vendedor en vez de dibujarlas como la barra más grande", () => {
    const groups = byVendor(lines);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("CASTELLANOS LOPEZ RAUL FABRICI");
  });

  it("lo no atribuido se cuenta aparte, con importe, líneas y porcentaje", () => {
    expect(unattributed(lines)).toEqual({ amount: 400, lineCount: 2, share: 80 });
  });

  it("sin dinero en el periodo, el porcentaje es null y no 0 %", () => {
    expect(unattributed([line({ vendor: "", amount: 0 })]).share).toBeNull();
  });
});

describe("salesTotals", () => {
  it("cuenta LÍNEAS, no facturas, y lo dice en el nombre del promedio", () => {
    const totals = salesTotals([line({ amount: 10 }), line({ amount: 20 })]);
    expect(totals.lineCount).toBe(2);
    expect(totals.averageLine).toBe(15);
  });

  it("sin líneas el promedio es null, nunca cero", () => {
    expect(salesTotals([]).averageLine).toBeNull();
  });

  it("una línea en $0 cuenta en las líneas y no en los dólares", () => {
    const totals = salesTotals([line({ amount: 0 }), line({ amount: 10 })]);
    expect(totals.lineCount).toBe(2);
    expect(totals.amount).toBe(10);
  });
});

describe("monthlySeries", () => {
  it("un mes que NUNCA se cargó vale null, y uno cargado sin ventas vale cero", () => {
    const points = monthlySeries(
      [month(2026, 0, [line({ amount: 10 })]), month(2026, 1, [])],
      [cover(2026, 0), cover(2026, 1)],
      2026,
    );
    expect(points[0].amount).toBe(10);
    // Febrero llegó y no trajo nada: es un cero real.
    expect(points[1].amount).toBe(0);
    // Marzo nunca llegó.
    expect(points[2].amount).toBeNull();
  });

  it("un mes cargado cuyas líneas se filtraron a nada sigue siendo un cero, no un hueco", () => {
    // La cobertura es la que declara que el mes llegó, no las líneas que sobrevivieron al filtro.
    const points = monthlySeries([], [cover(2026, 5)], 2026);
    expect(points[5].amount).toBe(0);
  });
});

describe("monthlyTypeSeries", () => {
  it("abre el eje por tipo, respetando hueco contra cero", () => {
    const series = monthlyTypeSeries(
      [
        month(2026, 0, [
          line({ tipo: "MEDICINAS", amount: 10 }),
          line({ tipo: "INSUMOS", amount: 40 }),
        ]),
        month(2026, 1, [line({ tipo: "INSUMOS", amount: 5 })]),
      ],
      [cover(2026, 0), cover(2026, 1)],
      2026,
    );
    expect(series.map((s) => s.id)).toEqual(["INSUMOS", "MEDICINAS"]);
    const medicinas = series.find((s) => s.id === "MEDICINAS")!;
    // Febrero llegó y MEDICINAS no vendió: cero.
    expect(medicinas.points[1].amount).toBe(0);
    // Marzo no llegó: hueco en TODOS los tipos.
    expect(series.every((s) => s.points[2].amount === null)).toBe(true);
  });
});

describe("loadedYears y loadedMonths", () => {
  it("salen de la COBERTURA, sin tocar una línea", () => {
    const coverage = [cover(2025, 10), cover(2026, 0), cover(2026, 2)];
    expect(loadedYears(coverage)).toEqual([2025, 2026]);
    expect(loadedMonths(coverage, [2026])).toEqual([0, 2]);
  });

  it("los meses de varios años son su UNIÓN, no su intersección", () => {
    const coverage = [cover(2025, 10), cover(2026, 0)];
    expect(loadedMonths(coverage, [2025, 2026])).toEqual([0, 10]);
  });
});

describe("shareOf", () => {
  it("sobre un total de cero es null, nunca 0 %", () => {
    expect(shareOf(0, 0)).toBeNull();
  });
});
