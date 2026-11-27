import { describe, expect, it } from "vitest";
import { buildSalesCards, RANKING_TABLE_PRINT_LIMIT } from "./cards";
import { monthlySeries, readSales } from "./derive";
import { buildSalesReport, type BuildSalesReportInput } from "./report";
import type { SalesCoverage, SalesLine, SalesMonth } from "./types";

const LINES: SalesLine[] = [
  {
    seguro: "SALUDSA NIVEL 3 RED STAR",
    tipo: "HONORARIOS MEDICOS",
    articleCode: "99204CARD",
    articleName: "Visita en la oficina de un nuevo paciente",
    vendor: "CASTELLANOS LOPEZ RAUL FABRICI",
    amount: 600,
  },
  {
    seguro: "PARTICULAR",
    tipo: "MEDICINAS",
    articleCode: "000156",
    articleName: "CLARITROMICINA",
    vendor: "",
    amount: 400,
  },
];

const MONTH: SalesMonth = {
  id: "c1:2026-04",
  clientId: "c1",
  year: 2026,
  monthIndex: 3,
  lines: LINES,
};

const COVERAGE: SalesCoverage[] = [
  {
    id: "c1:2026-04",
    clientId: "c1",
    year: 2026,
    monthIndex: 3,
    lineCount: 2,
    firstDay: 1,
    lastDay: 30,
    companyCode: "01",
  },
];

function input(overrides: Partial<BuildSalesReportInput> = {}): BuildSalesReportInput {
  const reading = readSales(LINES);
  return {
    reading,
    byYear: [{ year: 2026, reading }],
    period: "Abril 2026",
    monthlyByYear: [{ year: 2026, points: monthlySeries([MONTH], COVERAGE, 2026) }],
    clientName: "Clínica Durán",
    companyCode: "01",
    generatedAt: new Date(2026, 7, 18, 14, 5),
    ...overrides,
  };
}

/** A section by its id — the report gained one, so nothing here addresses them by position. */
function section(report: ReturnType<typeof buildSalesReport>, id: string) {
  const found = report.sections.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`el informe no trae la sección «${id}»`);
  }
  return found.card;
}

describe("buildSalesReport", () => {
  it("trae las CINCO lecturas, en el orden de la pantalla", () => {
    expect(buildSalesReport(input()).sections.map((entry) => entry.id)).toEqual([
      "types",
      "insurers",
      "articles",
      "vendors",
      "evolution",
    ]);
  });

  it("imprime EXACTAMENTE las tarjetas de la pantalla, no una segunda derivación", () => {
    const report = buildSalesReport(input());
    const onScreen = buildSalesCards(input());
    // They are compared by their SERIALIZABLE content: an `option`'s formatters are closures and
    // two constructions never share an instance, but what the paper and the screen cannot disagree
    // on is the figures and the labels.
    expect(JSON.stringify(section(report, "types"))).toBe(JSON.stringify(onScreen.types));
    expect(JSON.stringify(section(report, "evolution"))).toBe(JSON.stringify(onScreen.evolution));
    expect(section(report, "types").table).toEqual(onScreen.types.table);
    // And the ranking CHARTS are the same too: the only thing the paper changes is how far their
    // tables reach.
    expect(JSON.stringify(section(report, "insurers").option)).toBe(
      JSON.stringify(onScreen.insurers.option),
    );
    expect(JSON.stringify(section(report, "articles").option)).toBe(
      JSON.stringify(onScreen.articles.option),
    );
  });

  it("por OMISIÓN ninguna sección llega en 3D: el papel no puede llevar un lienzo", () => {
    // `buildSalesReport` no pide forma, y es esa omisión la que lo garantiza — `flatOnly` lanzaría.
    expect(() => buildSalesReport(input())).not.toThrow();
  });

  it("honra el periodo seleccionado: es el que la cabecera escribe", () => {
    const report = buildSalesReport(input({ period: "Ene–Abr 2026" }));
    expect(report.header.periodLabel).toBe("Ene–Abr 2026");
    expect(report.sections[0].card.subtitle).toContain("Ene–Abr 2026");
  });

  it("la cabecera dice el cliente, la empresa declarada y la fecha", () => {
    const { header } = buildSalesReport(input());
    expect(header.clientName).toBe("Clínica Durán");
    expect(header.companyCode).toBe("01");
    expect(header.generatedAt).toBe("18 de agosto de 2026, 14:05");
  });

  it("ninguna sección se omite por estar vacía: la tarjeta ya se explica sola", () => {
    const empty = readSales([]);
    const report = buildSalesReport(
      input({
        reading: empty,
        byYear: [{ year: 2026, reading: empty }],
        monthlyByYear: [{ year: 2026, points: monthlySeries([], [], 2026) }],
      }),
    );
    // Cuatro: «Vendedores» no existe cuando nada declara vendedor, que no es lo mismo que estar
    // vacía — no se construye.
    expect(report.sections.map((entry) => entry.id)).toEqual([
      "types",
      "insurers",
      "articles",
      "evolution",
    ]);
    expect(report.sections[0].card.option).toBeNull();
  });

  it("sin ningún vendedor en lo marcado, el papel no imprime una sección sobre una ausencia", () => {
    const reading = readSales([{ ...LINES[1] }]);
    const report = buildSalesReport(input({ reading, byYear: [{ year: 2026, reading }] }));
    expect(report.sections.some((entry) => entry.id === "vendors")).toBe(false);
  });
});

describe("la cola de un ranking en el papel", () => {
  /** More insurers than the print cap, so there is a tail to fold. */
  function manyInsurers(): SalesLine[] {
    return Array.from({ length: RANKING_TABLE_PRINT_LIMIT + 12 }, (_unused, index) => ({
      seguro: `ASEGURADORA${String(index).padStart(2, "0")}`,
      tipo: "HONORARIOS MEDICOS",
      articleCode: "99204CARD",
      articleName: "Visita",
      vendor: "",
      amount: 1000 - index,
    }));
  }

  function reportOf(lines: SalesLine[]) {
    const reading = readSales(lines);
    return buildSalesReport(input({ reading, byYear: [{ year: 2026, reading }] }));
  }

  it("la tabla impresa lista los mayores y pliega el resto en UNA fila", () => {
    const table = section(reportOf(manyInsurers()), "insurers").table;
    // The ones within the cap, plus the folded row, plus the TOTAL.
    expect(table.rows).toHaveLength(RANKING_TABLE_PRINT_LIMIT + 2);
    expect(table.rows.at(-2)?.label).toBe("Otros seguros");
    expect(table.rows.at(-2)?.sublabel).toContain("12 seguros");
  });

  it("la fila plegada dice cuánto era el MAYOR de los que agrupa", () => {
    // It is the question a folded row raises: what am I missing.
    expect(section(reportOf(manyInsurers()), "insurers").table.rows.at(-2)?.sublabel).toContain(
      "ninguno supera $970.00",
    );
  });

  it("plegar NO descuadra: las filas siguen sumando el TOTAL", () => {
    const table = section(reportOf(manyInsurers()), "insurers").table;
    const money = (value: string | null) => Number(String(value).replace(/[$,]/g, ""));
    const body = table.rows.filter((row) => !row.emphasis);
    const sum = body.reduce((acc, row) => acc + money(row.values[0]), 0);
    expect(sum).toBeCloseTo(money(table.rows.at(-1)?.values[0] ?? "0"), 2);
  });

  it("la nota DICE que la tabla pliega, en vez de prometer la lista completa", () => {
    const note = section(reportOf(manyInsurers()), "insurers").note ?? "";
    expect(note).toContain("agrupa a los 12 últimos");
    expect(note).not.toContain("los lista uno a uno");
  });

  it("la PANTALLA los sigue listando a todos", () => {
    const reading = readSales(manyInsurers());
    const table = buildSalesCards(input({ reading, byYear: [{ year: 2026, reading }] })).insurers
      .table;
    expect(table.rows).toHaveLength(RANKING_TABLE_PRINT_LIMIT + 12 + 1);
    expect(table.rows.some((row) => row.id === "otros")).toBe(false);
  });
});

describe("lo que la cabecera del informe dice", () => {
  it("nombra los filtros APARTE del periodo: en el papel la barra no está", () => {
    const report = buildSalesReport(input({ scope: "MEDICINAS" }));
    expect(report.header.periodLabel).toBe("Abril 2026");
    expect(report.header.filtersLabel).toBe("MEDICINAS");
    expect(buildSalesReport(input()).header.filtersLabel).toBeNull();
  });

  it("trae las cuatro cifras de cabecera de la pantalla, con dos decimales", () => {
    expect(buildSalesReport(input()).header.summary).toEqual([
      { label: "Venta total (neto)", value: "$1,000.00" },
      { label: "Líneas facturadas", value: "2" },
      { label: "Promedio por línea", value: "$500.00" },
      { label: "Seguros", value: "2" },
    ]);
  });
});

describe("un solo tipo marcado en la barra", () => {
  it("el informe imprime los artículos de ese tipo en el lugar de la composición", () => {
    const report = buildSalesReport(input({ openTypeId: "MEDICINAS" }));
    expect(report.sections[0].id).toBe("type-detail");
    expect(report.sections[0].card.title).toBe("Artículos de MEDICINAS");
    expect(report.sections.some((entry) => entry.id === "types")).toBe(false);
  });

  it("si ese tipo no está en lo leído, vuelve a la composición", () => {
    const report = buildSalesReport(input({ openTypeId: "NO EXISTE" }));
    expect(report.sections[0].id).toBe("types");
  });
});
