import { describe, expect, it } from "vitest";
import {
  buildSalesCards,
  buildTypeDetailCard,
  INSURER_SLICES,
  RANKING_SLICES,
  RANKING_TABLE_PRINT_LIMIT,
  type SalesCardsInput,
} from "./cards";
import { readSales, type MonthPoint, type SalesReading, type TypeMonthSeries } from "./derive";
import { is3DOption, type ChartOption } from "@/lib/charts/types";
import type { SalesLine } from "./types";

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

const LINES: SalesLine[] = [
  line({
    seguro: "PARTICULAR",
    tipo: "HONORARIOS",
    articleCode: "H1",
    articleName: "CONSULTA",
    amount: 500,
    vendor: "ANA",
  }),
  line({
    seguro: "HUMANA",
    tipo: "HONORARIOS",
    articleCode: "H2",
    articleName: "VISITA",
    amount: 300,
  }),
  line({
    seguro: "PARTICULAR",
    tipo: "MEDICINAS",
    articleCode: "M1",
    articleName: "PARACETAMOL",
    amount: 150,
    vendor: "BETO",
  }),
  line({
    seguro: "CONFIAMED",
    tipo: "INSUMOS",
    articleCode: "I1",
    articleName: "GASA",
    amount: 50,
  }),
];

function months(amounts: (number | null)[]): MonthPoint[] {
  return amounts.map((amount, monthIndex) => ({ monthIndex, amount }));
}

function typeSeries(id: string, label: string, amounts: (number | null)[]): TypeMonthSeries {
  return { id, label, points: months(amounts) };
}

function input(overrides: Partial<SalesCardsInput> = {}): SalesCardsInput {
  const reading = readSales(LINES);
  return {
    reading,
    byYear: [{ year: 2026, reading }],
    period: "2026",
    monthlyByYear: [{ year: 2026, points: months([1000, null, 0, ...Array(9).fill(null)]) }],
    ...overrides,
  };
}

/** A flat option, narrowed — `is3DOption` is the discriminator the app uses everywhere. */
function flat(option: unknown): ChartOption {
  if (option === null || is3DOption(option as never)) {
    throw new Error("se esperaba una opción plana");
  }
  return option as ChartOption;
}

describe("composición por tipo de servicio", () => {
  it("ordena los tipos de mayor a menor y cierra con su TOTAL", () => {
    const { types } = buildSalesCards(input());
    const labels = types.table.rows.map((row) => row.label);
    expect(labels).toEqual(["HONORARIOS", "MEDICINAS", "INSUMOS", "TOTAL"]);
  });

  it("los porcentajes son sobre la venta del periodo, y la nota escribe el denominador", () => {
    const { types } = buildSalesCards(input());
    const honorarios = types.table.rows[0];
    // 800 de 1000.
    expect(honorarios.values[1]).toContain("80");
    expect(types.note).toContain("$1,000.00");
  });

  it("un tipo que no movió nada no se dibuja, y la nota lo dice", () => {
    const reading: SalesReading = readSales([...LINES, line({ tipo: "IMAGENES", amount: 0 })]);
    const { types } = buildSalesCards(input({ reading, byYear: [{ year: 2026, reading }] }));
    const drawn = flat(types.option).yAxis?.data ?? [];
    expect(drawn).not.toContain("IMAGENES");
    expect(types.note).toContain("no se movió");
  });

  it("con VARIOS años marcados pone un año por serie, sin que ningún control lo elija", () => {
    const reading = readSales(LINES);
    const { types } = buildSalesCards(
      input({
        byYear: [
          { year: 2025, reading },
          { year: 2026, reading },
        ],
      }),
    );
    const series = flat(types.option).series ?? [];
    expect(series.map((s) => s.name)).toEqual(["2025", "2026"]);
    expect(types.table.columns.slice(0, 2)).toEqual(["2025", "2026"]);
  });
});

describe("los NIVELES de la composición: el tipo, y dentro, sus artículos", () => {
  it("el nivel uno dice qué tipo es cada barra, en el orden de sus filas", () => {
    const cards = buildSalesCards(input());
    expect(cards.typeOrder).toEqual(["HONORARIOS", "MEDICINAS", "INSUMOS"]);
    expect(flat(cards.types.option).yAxis?.data).toEqual(cards.typeOrder);
  });

  it("cada barra del nivel uno escribe su importe Y su parte del periodo", () => {
    const { types } = buildSalesCards(input());
    const label = flat(types.option).series?.[0].label;
    const text = label?.formatter?.({ name: "", value: 800, dataIndex: 0 });
    // Dos decimales, coma de miles y punto decimal: el formato del resto de la app.
    expect(text).toBe("$800.00 · 80.0 %");
  });

  it("el nivel dos lista los artículos del tipo pulsado, de mayor a menor", () => {
    const detail = buildTypeDetailCard(input(), "HONORARIOS");
    expect(detail?.title).toBe("Artículos de HONORARIOS");
    expect(detail?.table.rows.map((row) => row.label)).toEqual(["CONSULTA", "VISITA", "TOTAL"]);
  });

  it("en el nivel dos los porcentajes son contra la venta DEL TIPO, y el total es el del tipo", () => {
    const detail = buildTypeDetailCard(input(), "HONORARIOS")!;
    expect(detail.table.columns[1]).toBe("% del tipo");
    // CONSULTA: 500 de los 800 de HONORARIOS.
    expect(detail.table.rows[0].values[1]).toContain("62.5");
    expect(detail.table.rows.at(-1)?.values[0]).toBe("$800.00");
    expect(detail.note).toContain("la venta de HONORARIOS");
  });

  it("cada barra del nivel dos escribe su importe y su parte del tipo", () => {
    const detail = buildTypeDetailCard(input(), "HONORARIOS")!;
    const label = flat(detail.option).series?.[0].label;
    const text = label?.formatter?.({ name: "", value: 500, dataIndex: 0 });
    expect(text).toContain("$500");
    expect(text).toContain("62.5");
  });

  it("comparando años el nivel dos pone un año por serie, con el total del tipo por año", () => {
    const reading = readSales(LINES);
    const detail = buildTypeDetailCard(
      input({
        byYear: [
          { year: 2025, reading },
          { year: 2026, reading },
        ],
      }),
      "HONORARIOS",
    )!;
    expect(flat(detail.option).series?.map((entry) => entry.name)).toEqual(["2025", "2026"]);
    expect(detail.table.rows.at(-1)?.values.slice(0, 2)).toEqual(["$800.00", "$800.00"]);
  });

  it("un tipo que ya no está en lo marcado no tiene nivel dos: la pantalla vuelve al uno", () => {
    expect(buildTypeDetailCard(input(), "TIPO QUE NO EXISTE")).toBeNull();
  });
});

describe("los tres rankings comparten constructor", () => {
  it("concentración por seguro: sin fila de «sin identificación», porque el seguro nunca viene vacío", () => {
    const { insurers } = buildSalesCards(input());
    const labels = insurers.table.rows.map((row) => row.label);
    expect(labels).not.toContain("Sin identificación");
    expect(labels).toEqual(["PARTICULAR", "HUMANA", "CONFIAMED", "TOTAL"]);
  });

  it("la nota dice en UNA cifra qué parte del periodo son los dibujados", () => {
    const { insurers } = buildSalesCards(input());
    expect(insurers.note).toContain("son el");
    expect(insurers.note).toContain("de la venta del periodo");
  });

  it("cuarenta y dos códigos con el mismo nombre dan cuarenta y dos filas distinguibles", () => {
    const truncated = "Visita en la oficina de un nuevo paciente que requiere de tr";
    const lines = Array.from({ length: 42 }, (_unused, index) =>
      line({ articleCode: `99204-${index}`, articleName: truncated, amount: 100 - index }),
    );
    const reading = readSales(lines);
    const { articles } = buildSalesCards(input({ reading, byYear: [{ year: 2026, reading }] }));
    const drawn = (flat(articles.option).yAxis?.data ?? []) as string[];
    expect(drawn).toHaveLength(RANKING_SLICES);
    expect(new Set(drawn).size).toBe(RANKING_SLICES);
  });

  it("en pantalla la tabla NO corta; en el reporte dobla la cola en una fila que sigue sumando", () => {
    const lines = Array.from({ length: 40 }, (_unused, index) =>
      line({ articleCode: `A${index}`, articleName: `ART ${index}`, amount: 100 - index }),
    );
    const reading = readSales(lines);
    const screen = buildSalesCards(input({ reading, byYear: [{ year: 2026, reading }] }));
    // 40 artículos + TOTAL.
    expect(screen.articles.table.rows).toHaveLength(41);

    const paper = buildSalesCards(
      input({
        reading,
        byYear: [{ year: 2026, reading }],
        rankingTableLimit: RANKING_TABLE_PRINT_LIMIT,
      }),
    );
    // 30 listados + «Otros artículos» + TOTAL.
    expect(paper.articles.table.rows).toHaveLength(32);
    expect(paper.articles.table.rows[30].label).toBe("Otros artículos");
    expect(paper.articles.note).toContain("agrupa");
  });

  it("solo las filas DIBUJADAS llevan punto de color", () => {
    const lines = Array.from({ length: 20 }, (_unused, index) =>
      line({ seguro: `SEG${index}`, amount: 100 - index }),
    );
    const reading = readSales(lines);
    const { insurers } = buildSalesCards(input({ reading, byYear: [{ year: 2026, reading }] }));
    const coloured = insurers.table.rows.filter((row) => row.color !== undefined);
    expect(coloured).toHaveLength(INSURER_SLICES);
  });
});

describe("la tarjeta de vendedores declara lo que no puede medir", () => {
  it("dice el importe y el porcentaje del NETO que no trae vendedor", () => {
    const { vendors } = buildSalesCards(input());
    // Sin vendedor: H2 (300) e I1 (50) = 350 de 1.000.
    expect(vendors?.note).toContain("$350.00");
    expect(vendors?.note).toContain("35.0 %");
    expect(vendors?.note).toContain("no trae vendedor");
  });

  it("las líneas sin vendedor NO se dibujan como una barra del ranking", () => {
    const { vendors } = buildSalesCards(input());
    const drawn = (flat(vendors?.option).yAxis?.data ?? []) as string[];
    expect(drawn).toEqual(["ANA", "BETO"]);
    expect(drawn).not.toContain("");
  });

  it("NO se dibuja en absoluto cuando lo marcado no trae ningún vendedor", () => {
    const reading = readSales([line({ vendor: "" })]);
    const cards = buildSalesCards(input({ reading, byYear: [{ year: 2026, reading }] }));
    expect(cards.vendors).toBeNull();
  });
});

describe("evolución", () => {
  it("un mes que nunca llegó lleva RAYA en la tabla, y uno cargado en cero su importe", () => {
    const { evolution } = buildSalesCards(input());
    const row = evolution.table.rows[0];
    expect(row.values[0]).toContain("1,000");
    expect(row.values[1]).toBe("–");
    expect(row.values[2]).toBe("$0.00");
  });

  it("cuenta los meses vacíos sobre el eje SIN podar, para que el interruptor no desaparezca al pulsarlo", () => {
    const cards = buildSalesCards(input(), { hideEmptyMonths: true });
    expect(cards.emptyMonths).toBe(11);
  });

  it("abre el mes por TIPO DE SERVICIO cuando hay un año marcado", () => {
    const cards = buildSalesCards(
      input({
        typeMonthly: [
          typeSeries("HONORARIOS", "HONORARIOS", [800, null, 0]),
          typeSeries("MEDICINAS", "MEDICINAS", [200, null, 0]),
        ],
      }),
    );
    const labels = cards.evolution.table.rows.map((row) => row.label);
    expect(labels).toEqual(["HONORARIOS", "MEDICINAS", "TOTAL"]);
    expect(cards.evolution.note).toContain("tipo de servicio");
  });

  it("el skyline se ofrece solo si hay desglose Y meses que seguir", () => {
    const withBreakdown = buildSalesCards(
      input({
        typeMonthly: [
          typeSeries("HONORARIOS", "HONORARIOS", [800, 700, 0]),
          typeSeries("MEDICINAS", "MEDICINAS", [200, 100, 0]),
        ],
      }),
    );
    expect(withBreakdown.skylineAvailable).toBe(true);
    expect(buildSalesCards(input()).skylineAvailable).toBe(false);
  });

  it("por OMISIÓN la evolución es plana: el reporte impreso no puede llevar un lienzo 3D", () => {
    const cards = buildSalesCards(
      input({
        typeMonthly: [
          typeSeries("HONORARIOS", "HONORARIOS", [800, 700, 0]),
          typeSeries("MEDICINAS", "MEDICINAS", [200, 100, 0]),
        ],
      }),
    );
    expect(is3DOption(cards.evolution.option as never)).toBe(false);
  });

  it("pedido el skyline, la opción SÍ es tridimensional", () => {
    const cards = buildSalesCards(
      input({
        typeMonthly: [
          typeSeries("HONORARIOS", "HONORARIOS", [800, 700, 0]),
          typeSeries("MEDICINAS", "MEDICINAS", [200, 100, 0]),
        ],
      }),
      { evolutionView: "skyline" },
    );
    expect(is3DOption(cards.evolution.option as never)).toBe(true);
  });

  it("el subtítulo dice EN RELACIÓN A QUÉ se lee la evolución", () => {
    const plain = buildSalesCards(input());
    expect(plain.evolution.title).toBe("Evolución mensual de la venta");
    expect(plain.evolution.subtitle).toContain("Venta neta de cada mes");

    const broken = buildSalesCards(
      input({
        typeMonthly: [
          typeSeries("HONORARIOS", "HONORARIOS", [800, 700, 0]),
          typeSeries("MEDICINAS", "MEDICINAS", [200, 100, 0]),
        ],
      }),
    );
    expect(broken.evolution.subtitle).toContain("desglosada por tipo de servicio");

    const reading = readSales(LINES);
    const compared = buildSalesCards(
      input({
        byYear: [
          { year: 2025, reading },
          { year: 2026, reading },
        ],
        monthlyByYear: [
          { year: 2025, points: months([100, 200]) },
          { year: 2026, points: months([150, 250]) },
        ],
      }),
    );
    expect(compared.evolution.subtitle).toContain("un año contra otro");
  });

  it("con varios años vuelve a una serie por año y no apila", () => {
    const reading = readSales(LINES);
    const cards = buildSalesCards(
      input({
        byYear: [
          { year: 2025, reading },
          { year: 2026, reading },
        ],
        monthlyByYear: [
          { year: 2025, points: months([100, 200, 300]) },
          { year: 2026, points: months([150, 250, 350]) },
        ],
        typeMonthly: [typeSeries("HONORARIOS", "HONORARIOS", [800, 700, 0])],
      }),
    );
    expect(cards.evolution.table.rows.map((row) => row.label)).toEqual(["2025", "2026"]);
    expect(cards.skylineAvailable).toBe(false);
  });
});

describe("el periodo se nombra en un solo sitio", () => {
  it("los subtítulos de las cinco tarjetas leen esa misma composición", () => {
    const cards = buildSalesCards(input({ scope: "HUMANA", period: "Abril 2026" }));
    for (const card of [cards.insurers, cards.evolution, cards.articles]) {
      expect(card.subtitle).toContain("HUMANA · Abril 2026");
    }
    // La composición nombra la acotación en lugar del recuento de tipos.
    expect(cards.types.subtitle).toContain("HUMANA");
  });
});
