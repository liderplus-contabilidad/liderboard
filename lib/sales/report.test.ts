import { describe, expect, it } from "vitest";
import { buildSalesCards, PAYER_TABLE_PRINT_LIMIT } from "./cards";
import { monthlySeries, readSales } from "./derive";
import { buildSalesReport, type BuildSalesReportInput } from "./report";
import type { SalesLine, SalesMonth } from "./types";

const LINES: SalesLine[] = [
  { serviceCode: "\\01", serviceName: "HONORARIOS", payer: "SALUDSA", quantity: 2, amount: 600 },
  {
    serviceCode: "\\02",
    serviceName: "MEDICINAS",
    payer: "MENDOZA PARRA LUIS ALBERTO",
    quantity: 1,
    amount: 400,
  },
];

const MONTH: SalesMonth = {
  id: "c1:2026-04",
  clientId: "c1",
  year: 2026,
  monthIndex: 3,
  companyName: "HOSPITAL DE PRUEBA S.A.",
  lines: LINES,
  declaredTotal: 1000,
  warnings: [],
};

function input(overrides: Partial<BuildSalesReportInput> = {}): BuildSalesReportInput {
  const reading = readSales(LINES);
  return {
    reading,
    byYear: [{ year: 2026, reading }],
    period: "Abril 2026",
    monthlyByYear: [{ year: 2026, points: monthlySeries([MONTH], 2026) }],
    clientName: "Clínica Durán",
    companyName: "HOSPITAL DE PRUEBA S.A.",
    generatedAt: new Date(2026, 7, 18, 14, 5),
    ...overrides,
  };
}

describe("buildSalesReport", () => {
  it("trae las TRES lecturas, en el orden de la pantalla", () => {
    expect(buildSalesReport(input()).sections.map((section) => section.id)).toEqual([
      "services",
      "payers",
      "evolution",
    ]);
  });

  it("imprime EXACTAMENTE las tarjetas de la pantalla, no una segunda derivación", () => {
    const report = buildSalesReport(input());
    const onScreen = buildSalesCards(input());
    // They are compared by their SERIALIZABLE content: an `option`'s formatters are closures and two
    // constructions never share an instance, but what the paper and the screen cannot disagree on is
    // the figures and the labels.
    expect(JSON.stringify(report.sections[0].card)).toBe(JSON.stringify(onScreen.services));
    expect(JSON.stringify(report.sections[2].card)).toBe(JSON.stringify(onScreen.evolution));
    expect(report.sections[0].card.table).toEqual(onScreen.services.table);
    // And the payer CHART is the same too: the only thing the paper changes is how far its table
    // reaches.
    expect(JSON.stringify(report.sections[1].card.option)).toBe(
      JSON.stringify(onScreen.payers.option),
    );
  });

  it("honra el periodo seleccionado: es el que la cabecera escribe", () => {
    const report = buildSalesReport(input({ period: "Ene–Abr 2026" }));
    expect(report.header.periodLabel).toBe("Ene–Abr 2026");
    expect(report.sections[0].card.subtitle).toContain("Ene–Abr 2026");
  });

  it("la cabecera dice el cliente, la empresa declarada y la fecha", () => {
    const { header } = buildSalesReport(input());
    expect(header.clientName).toBe("Clínica Durán");
    expect(header.companyName).toBe("HOSPITAL DE PRUEBA S.A.");
    expect(header.generatedAt).toBe("18 de agosto de 2026, 14:05");
  });

  it("el papel dice lo MISMO que la pantalla: cada pagador con su nombre", () => {
    const report = buildSalesReport(input());
    expect(JSON.stringify(report)).toContain("MENDOZA");
  });

  it("ninguna sección se omite por estar vacía: la tarjeta ya se explica sola", () => {
    const report = buildSalesReport(
      input({
        reading: readSales([]),
        byYear: [{ year: 2026, reading: readSales([]) }],
        monthlyByYear: [{ year: 2026, points: monthlySeries([], 2026) }],
      }),
    );
    expect(report.sections).toHaveLength(3);
    expect(report.sections[0].card.option).toBeNull();
  });
});

describe("la cola de pagadores en el papel", () => {
  /** More payers than the print cap, so there is a tail to fold. */
  function manyPayers(): SalesLine[] {
    return Array.from({ length: PAYER_TABLE_PRINT_LIMIT + 12 }, (_unused, index) => ({
      serviceCode: "\\01",
      serviceName: "HONORARIOS",
      payer: `ASEGURADORA${index}`,
      quantity: 1,
      amount: 1000 - index,
    }));
  }

  function reportOf(lines: SalesLine[]) {
    const reading = readSales(lines);
    return buildSalesReport(input({ reading, byYear: [{ year: 2026, reading }] }));
  }

  it("la tabla impresa lista los mayores y pliega el resto en UNA fila", () => {
    const table = reportOf(manyPayers()).sections[1].card.table;
    // The ones within the cap, plus the folded row, plus the TOTAL.
    expect(table.rows).toHaveLength(PAYER_TABLE_PRINT_LIMIT + 2);
    expect(table.rows.at(-2)?.label).toBe("Otros pagadores");
    expect(table.rows.at(-2)?.sublabel).toContain("12 pagadores");
  });

  it("la fila plegada dice cuánto era el MAYOR de los que agrupa", () => {
    // It is the question a folded row raises: what am I missing.
    expect(reportOf(manyPayers()).sections[1].card.table.rows.at(-2)?.sublabel).toContain(
      "ninguno supera $970.00",
    );
  });

  it("plegar NO descuadra: las filas siguen sumando el TOTAL", () => {
    const table = reportOf(manyPayers()).sections[1].card.table;
    const money = (value: string | null) => Number(String(value).replace(/[$,]/g, ""));
    const body = table.rows.filter((row) => !row.emphasis);
    const sum = body.reduce((acc, row) => acc + money(row.values[0]), 0);
    expect(sum).toBeCloseTo(money(table.rows.at(-1)?.values[0] ?? "0"), 2);
  });

  it("la nota DICE que la tabla pliega, en vez de prometer la lista completa", () => {
    const note = reportOf(manyPayers()).sections[1].card.note ?? "";
    expect(note).toContain("agrupa a los 12 últimos");
    expect(note).not.toContain("los lista uno a uno");
  });

  it("sin cola que plegar la tabla impresa es la de siempre", () => {
    const table = reportOf(LINES).sections[1].card.table;
    expect(table.rows.some((row) => row.id === "otros")).toBe(false);
    expect(table.rows.at(-1)?.label).toBe("TOTAL");
  });

  it("la PANTALLA los sigue listando a todos", () => {
    const reading = readSales(manyPayers());
    const table = buildSalesCards(input({ reading, byYear: [{ year: 2026, reading }] })).payers
      .table;
    expect(table.rows).toHaveLength(PAYER_TABLE_PRINT_LIMIT + 12 + 1);
    expect(table.rows.some((row) => row.id === "otros")).toBe(false);
  });
});

describe("el informe nombra el tramo marcado", () => {
  it("la cabecera dice qué servicio se está mirando", () => {
    // On paper the bar is not there: if the header does not say it, nothing does.
    const report = buildSalesReport(input({ scope: "MEDICINAS" }));
    expect(report.header.periodLabel).toBe("MEDICINAS · Abril 2026");
  });

  it("sin marca de servicio la cabecera es la de siempre", () => {
    expect(buildSalesReport(input()).header.periodLabel).toBe("Abril 2026");
  });
});
