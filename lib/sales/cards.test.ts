import { describe, expect, it } from "vitest";
import { buildSalesCards, PAYER_SLICES, type SalesCardsInput } from "./cards";
import { monthlySeries, readSales, type MonthPoint } from "./derive";
import type { SalesLine, SalesMonth } from "./types";

function line(overrides: Partial<SalesLine>): SalesLine {
  return {
    serviceCode: "\\01",
    serviceName: "HONORARIOS",
    payer: "SALUDSA",
    quantity: 1,
    amount: 100,
    ...overrides,
  };
}

function input(lines: SalesLine[], monthly?: MonthPoint[]): SalesCardsInput {
  const reading = readSales(lines);
  return {
    reading,
    byYear: [{ year: 2026, reading }],
    period: "Abril 2026",
    monthlyByYear: [{ year: 2026, points: monthly ?? emptyYear() }],
  };
}

/** La forma COMPARATIVA: dos años, cada uno con sus líneas y sus doce meses. */
function comparing(
  byYear: { year: number; lines: SalesLine[]; months?: SalesMonth[] }[],
): SalesCardsInput {
  return {
    reading: readSales(byYear.flatMap((entry) => entry.lines)),
    byYear: byYear.map((entry) => ({ year: entry.year, reading: readSales(entry.lines) })),
    period: byYear.map((entry) => entry.year).join(", "),
    monthlyByYear: byYear.map((entry) => ({
      year: entry.year,
      points: monthlySeries(entry.months ?? [], entry.year),
    })),
  };
}

function emptyYear(): MonthPoint[] {
  return Array.from({ length: 12 }, (_unused, monthIndex) => ({ monthIndex, amount: null }));
}

function month(monthIndex: number, lines: SalesLine[], year = 2026): SalesMonth {
  return {
    id: `c1:${year}-${monthIndex}`,
    clientId: "c1",
    year,
    monthIndex,
    companyName: "HOSPITAL",
    lines,
    declaredTotal: null,
    warnings: [],
  };
}

describe("composición por servicio", () => {
  const lines = [
    line({ serviceCode: "\\01", serviceName: "HONORARIOS", amount: 60 }),
    line({ serviceCode: "\\02", serviceName: "MEDICINAS", amount: 40 }),
  ];

  it("el reparto suma el total y los porcentajes suman 100", () => {
    const { services } = buildSalesCards(input(lines));
    const shares = services.table.rows
      .filter((row) => !row.emphasis)
      .map((row) => Number(String(row.values[1]).replace(" %", "")));
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(100, 5);
    expect(services.table.rows.at(-1)?.values[0]).toBe("$100.00");
  });

  it("el denominador se nombra con su cifra", () => {
    const { services } = buildSalesCards(input(lines));
    expect(services.note).toContain("$100.00");
  });

  it("un servicio sin ventas no se dibuja y la tarjeta lo cuenta", () => {
    const { services } = buildSalesCards(
      input([...lines, line({ serviceCode: "\\03", serviceName: "IMAGENES", amount: 0 })]),
    );
    expect(services.option?.series[0].data).toHaveLength(2);
    expect(services.note).toContain("1 servicio");
  });

  it("sin ninguna línea no dibuja: la tarjeta dice por qué en vez de un plot vacío", () => {
    expect(buildSalesCards(input([])).services.option).toBeNull();
  });
});

describe("concentración por pagador", () => {
  const many = Array.from({ length: 14 }, (_unused, index) =>
    line({ payer: `ASEGURADORA${index}`, amount: 100 - index }),
  );

  it("dibuja los mayores y cuenta el resto con su suma", () => {
    const { payers } = buildSalesCards(input(many));
    expect(payers.option?.series[0].data).toHaveLength(PAYER_SLICES);
    expect(payers.note).toContain("4 restantes");
  });

  it("la tabla NO corta: están los catorce más el total", () => {
    const { payers } = buildSalesCards(input(many));
    expect(payers.table.rows).toHaveLength(15);
  });

  it("la concentración se dice en una cifra", () => {
    const { payers } = buildSalesCards(input(many));
    expect(payers.note).toMatch(/Estos 10 son el \d+\.\d %/);
  });

  it("un particular no llega con su nombre ni al gráfico ni a la tabla", () => {
    const { payers } = buildSalesCards(
      input([line({ payer: "SANDOVAL MORALES JUAN CARLOS", amount: 10 })]),
    );
    const axis = payers.option?.yAxis?.data ?? [];
    expect(axis).toEqual(["Particular · 1"]);
    expect(JSON.stringify(payers.table.rows)).not.toContain("SANDOVAL");
  });
});

describe("evolución mensual", () => {
  it("son doce columnas, cargadas o no", () => {
    const monthly = monthlySeries([month(3, [line({ amount: 10 })])], 2026);
    const { evolution } = buildSalesCards(input([line({ amount: 10 })], monthly));
    expect(evolution.table.columns).toHaveLength(12);
  });

  it("un mes ausente lleva RAYA y un mes cargado en cero lleva su cifra", () => {
    const monthly = monthlySeries([month(3, [line({ amount: 10 })]), month(4, [])], 2026);
    const { evolution } = buildSalesCards(input([line({ amount: 10 })], monthly));
    const values = evolution.table.rows[0].values;
    expect(values[0]).toBe("–");
    expect(values[3]).toBe("$10.00");
    expect(values[4]).toBe("$0.00");
  });

  it("la marca de ausencia se dibuja SILENCIOSA: su alto no es un dato", () => {
    const monthly = monthlySeries([month(3, [line({ amount: 10 })])], 2026);
    const { evolution } = buildSalesCards(input([line({ amount: 10 })], monthly));
    const absence = evolution.option?.series.find((series) => series.id === "sin-cargar");
    expect(absence?.silent).toBe(true);
    expect(absence?.data.filter((value) => value !== null)).toHaveLength(11);
  });

  it("la tarjeta dice cuántos meses faltan y los nombra", () => {
    const monthly = monthlySeries([month(3, [line({ amount: 10 })])], 2026);
    const { evolution } = buildSalesCards(input([line({ amount: 10 })], monthly));
    expect(evolution.note).toContain("11 meses sin cargar");
    expect(evolution.note).toContain("Ene");
  });

  it("con el año completo no hay aviso de meses que faltan", () => {
    const monthly = monthlySeries(
      Array.from({ length: 12 }, (_unused, index) => month(index, [line({ amount: 1 })])),
      2026,
    );
    const { evolution } = buildSalesCards(input([line({ amount: 1 })], monthly));
    expect(evolution.note).toContain("los doce meses del eje");
    // Su barra y su línea: la evolución es un combo desde que la línea existe.
    expect(evolution.option?.series.map((entry) => entry.type)).toEqual(["bar", "line"]);
  });
});

describe("la forma COMPARATIVA (varios años)", () => {
  const spec = comparing([
    {
      year: 2025,
      lines: [
        line({ serviceCode: "\\01", serviceName: "HONORARIOS", payer: "SALUDSA", amount: 100 }),
        line({ serviceCode: "\\02", serviceName: "MEDICINAS", payer: "CONFIAMED", amount: 40 }),
      ],
      months: [month(3, [line({ amount: 140 })], 2025)],
    },
    {
      year: 2026,
      lines: [
        line({ serviceCode: "\\01", serviceName: "HONORARIOS", payer: "SALUDSA", amount: 200 }),
      ],
      months: [month(3, [line({ amount: 200 })])],
    },
  ]);

  it("cada AÑO es una serie, en las tres tarjetas", () => {
    const cards = buildSalesCards(spec);
    for (const card of [cards.services, cards.payers, cards.evolution]) {
      const years = card.option?.series.filter((s) => s.id.startsWith("year-")) ?? [];
      // La evolución trae dos por año —barra y línea— y las dos comparten nombre, así que lo que se
      // compara es el conjunto de años nombrados.
      expect([...new Set(years.map((s) => s.name))]).toEqual(["2025", "2026"]);
    }
  });

  it("un servicio que un año no tocó vale null, y NO cero", () => {
    // Cero afirmaría que ese año no vendió medicinas; null dice que no hay nada que afirmar.
    const services = buildSalesCards(spec).services;
    const y2026 = services.option?.series.find((s) => s.id === "year-2026");
    // Las filas van ordenadas por el agregado: HONORARIOS (300) y luego MEDICINAS (40).
    expect(y2026?.data).toEqual([200, null]);
  });

  it("la tabla comparativa lleva una columna por año, más el total y su porcentaje", () => {
    const table = buildSalesCards(spec).services.table;
    expect(table.columns).toEqual(["2025", "2026", "Total", "% del periodo"]);
    expect(table.rows[0].values).toEqual(["$100.00", "$200.00", "$300.00", "88.2 %"]);
    expect(table.rows[1].values[0]).toBe("$40.00");
    // El año que no tocó ese servicio lleva RAYA.
    expect(table.rows[1].values[1]).toBe("–");
  });

  it("la fila de TOTAL de la tabla comparativa cuadra por año", () => {
    const total = buildSalesCards(spec).services.table.rows.at(-1);
    expect(total?.values).toEqual(["$140.00", "$200.00", "$340.00", "100.0 %"]);
  });

  it("los mayores pagadores se eligen por el AGREGADO, no por un año", () => {
    // Si el elenco cambiara con las marcas, la tarjeta no se podría comparar consigo misma.
    const payers = buildSalesCards(spec).payers;
    expect(payers.option?.yAxis?.data).toEqual(["SALUDSA", "CONFIAMED"]);
    expect(payers.note).toContain("no por un año");
  });

  it("con varios años el color de un pagador lo lleva el AÑO, no su clase", () => {
    // Teñir por clase pintaría del mismo tono los tres años de un mismo pagador, que es justo lo
    // que la comparación necesita distinguir.
    const series = buildSalesCards(spec).payers.option?.series ?? [];
    expect(series).toHaveLength(2);
    expect(series[0].itemStyle?.color).not.toBe(series[1].itemStyle?.color);
    // Y las barras ya no llevan color por dato.
    expect(series[0].data.every((datum) => typeof datum !== "object" || datum === null)).toBe(true);
  });

  it("la evolución compara sobre los MISMOS doce meses, una fila por año", () => {
    const evolution = buildSalesCards(spec).evolution;
    expect(evolution.table.columns).toHaveLength(12);
    expect(evolution.table.rows.map((row) => row.label)).toEqual(["2025", "2026"]);
    expect(evolution.table.rows[0].values[3]).toBe("$140.00");
    expect(evolution.table.rows[0].values[0]).toBe("–");
  });

  it("comparando NO se dibujan marcas de ausencia: la barra que falta ya se ve", () => {
    // Una fila de topes grises bajo cada grupo añadiría hasta tres marcas falsas por columna a un
    // gráfico que ya lleva tres reales.
    const evolution = buildSalesCards(spec).evolution;
    expect(evolution.option?.series.some((s) => s.id === "sin-cargar")).toBe(false);
    // Con UN solo año sí se dibujan.
    const single = buildSalesCards(
      input([line({ amount: 10 })], monthlySeries([month(3, [line({ amount: 10 })])], 2026)),
    );
    expect(single.evolution.option?.series.some((s) => s.id === "sin-cargar")).toBe(true);
  });

  it("los huecos se dicen POR AÑO, nunca uno por mes", () => {
    const note = buildSalesCards(spec).evolution.note ?? "";
    expect(note).toContain("2025: 11 meses");
    expect(note).toContain("2026: 11 meses");
  });

  it("con varios años la leyenda se dibuja; con uno solo sobra", () => {
    expect(buildSalesCards(spec).evolution.option?.legend?.show).toBe(true);
    const single = buildSalesCards(
      input([line({ amount: 1 })], monthlySeries([month(3, [line({ amount: 1 })])], 2026)),
    );
    expect(single.evolution.option?.legend?.show).toBe(false);
  });

  it("el subtítulo nombra el periodo que resolvió la barra", () => {
    expect(buildSalesCards(spec).evolution.subtitle).toBe("Venta total · 2025, 2026");
  });
});

describe("el eje de la evolución obedece la marca de Mes", () => {
  /** Tres años completos, y luego el eje acotado a dos meses. */
  function threeYears(months: number[] | null) {
    const all = [0, 1, 2, 3];
    const axis = months ?? all;
    return {
      reading: readSales([line({ amount: 1 })]),
      byYear: [2025, 2026].map((year) => ({ year, reading: readSales([line({ amount: 1 })]) })),
      period: months ? "Ene–Feb · 2025, 2026" : "2025, 2026",
      monthlyByYear: [2025, 2026].map((year) => ({
        year,
        points: axis.map((monthIndex) => ({ monthIndex, amount: 100 + monthIndex })),
      })),
    };
  }

  it("con «Mes» acotado el eje dibuja SOLO lo marcado", () => {
    // El subtítulo decía «Ene–Feb» sobre doce columnas: la tarjeta se contradecía a sí misma.
    const evolution = buildSalesCards(threeYears([0, 1])).evolution;
    expect(evolution.table.columns).toEqual(["Ene", "Feb"]);
    expect(evolution.option?.xAxis).toMatchObject({ data: ["Ene", "Feb"] });
    expect(evolution.option?.series[0].data).toHaveLength(2);
  });

  it("sin marcas el eje es el del ejercicio, para que un mes ausente se siga viendo", () => {
    expect(buildSalesCards(threeYears(null)).evolution.table.columns).toEqual([
      "Ene",
      "Feb",
      "Mar",
      "Abr",
    ]);
  });
});

describe("barras CON línea en la evolución", () => {
  function spec(years: number[], monthCount: number) {
    const points = Array.from({ length: monthCount }, (_unused, monthIndex) => ({
      monthIndex,
      amount: 100 + monthIndex,
    }));
    return {
      reading: readSales([line({ amount: 1 })]),
      byYear: years.map((year) => ({ year, reading: readSales([line({ amount: 1 })]) })),
      period: years.join(", "),
      monthlyByYear: years.map((year) => ({ year, points })),
    };
  }

  function seriesOf(years: number[], monthCount: number) {
    return buildSalesCards(spec(years, monthCount)).evolution.option?.series ?? [];
  }

  it("cada año trae SU barra y SU línea, del mismo color", () => {
    const series = seriesOf([2025, 2026], 12);
    expect(series.map((entry) => entry.type)).toEqual(["bar", "line", "bar", "line"]);
    expect(series[0].itemStyle?.color).toBe(series[1].itemStyle?.color);
    expect(series[0].itemStyle?.color).not.toBe(series[2].itemStyle?.color);
  });

  it("las dos series de un año comparten NOMBRE, así que la leyenda saca un ítem por año", () => {
    // Y al apagarlo se van su barra y su línea a la vez.
    const series = seriesOf([2025, 2026], 12);
    expect(series.map((entry) => entry.name)).toEqual(["2025", "2025", "2026", "2026"]);
    expect(new Set(series.map((entry) => entry.id)).size).toBe(4);
  });

  it("la línea va POR ENCIMA de las barras y sin suavizar", () => {
    // Una curva inventa valores entre dos meses que nadie midió.
    const line2025 = seriesOf([2025, 2026], 12)[1];
    expect(line2025.z).toBe(3);
    expect(line2025.smooth).toBe(false);
  });

  it("con un solo año también lleva línea: es la misma lectura", () => {
    expect(seriesOf([2026], 12).map((entry) => entry.type)).toEqual(["bar", "line"]);
  });

  it("con una sola columna NO hay línea: sería un punto suelto", () => {
    expect(seriesOf([2024, 2025, 2026], 1).every((entry) => entry.type === "bar")).toBe(true);
  });

  it("la banda del eje se reserva siempre, porque siempre hay barras", () => {
    expect(buildSalesCards(spec([2025, 2026], 12)).evolution.option?.xAxis).toMatchObject({
      boundaryGap: true,
    });
  });
});
