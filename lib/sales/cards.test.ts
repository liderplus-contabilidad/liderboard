import { describe, expect, it } from "vitest";
import { CHART_NEUTRAL, CHART_PALETTE, CHART_SLICE_SEQUENCE } from "@/lib/charts/palette";
import { buildSalesCards, PAYER_SLICES, type SalesCardsInput } from "./cards";
import { monthlySeries, monthlyServiceSeries, readSales, type MonthPoint } from "./derive";
import { UNIDENTIFIED_PAYER } from "./payer";
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

/** The COMPARATIVE shape: two years, each with its lines and its twelve months. */
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

  it("las barras son tonos saturados y NINGUNO es el de un servicio", () => {
    // On this screen a service's hue is its IDENTITY —the composition and the evolution's stack paint
    // «HONORARIOS» the same blue, and a legend names it—, so a payer out of that same blue would read
    // as paired with it. The ranking opens with the warm composition hues instead, which are disjoint
    // from the identity slots, and its dot in the table twin says the same.
    const { payers } = buildSalesCards(input(many));
    const fills = (payers.option?.series[0].data ?? []).map(
      (datum) => (datum as { itemStyle?: { color?: string } }).itemStyle?.color,
    );

    expect(fills).toEqual([...CHART_SLICE_SEQUENCE.slice(0, PAYER_SLICES)]);
    for (const fill of fills) {
      expect(CHART_PALETTE).not.toContain(fill);
      expect(fill).not.toBe(CHART_NEUTRAL);
    }
    expect(payers.table.rows[0].color).toBe(fills[0]);
  });

  it("un pagador llega con su nombre al gráfico y a la tabla", () => {
    const { payers } = buildSalesCards(
      input([line({ payer: "SANDOVAL MORALES JUAN CARLOS", amount: 10 })]),
    );
    const axis = payers.option?.yAxis?.data ?? [];
    expect(axis).toEqual(["SANDOVAL MORALES JUAN CARLOS"]);
    expect(JSON.stringify(payers.table.rows)).toContain("SANDOVAL MORALES JUAN CARLOS");
  });

  it("las líneas sin pagador son UNA fila rotulada, no una por línea", () => {
    const { payers } = buildSalesCards(
      input([
        line({ payer: "", amount: 10 }),
        line({ payer: "", amount: 20 }),
        line({ payer: "SALUDSA", amount: 5 }),
      ]),
    );

    expect(payers.option?.yAxis?.data).toEqual([UNIDENTIFIED_PAYER, "SALUDSA"]);
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
    // Its bar and its line: the evolution is a combo now that the line exists.
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
      // The evolution brings two per year —bar and line— and both share a name, so what is compared
      // is the set of named years.
      expect([...new Set(years.map((s) => s.name))]).toEqual(["2025", "2026"]);
    }
  });

  it("un servicio que un año no tocó vale null, y NO cero", () => {
    // Zero would claim that year sold no medicines; null says there is nothing to claim.
    const services = buildSalesCards(spec).services;
    const y2026 = services.option?.series.find((s) => s.id === "year-2026");
    // The rows are ordered by the aggregate: HONORARIOS (300) and then MEDICINAS (40).
    expect(y2026?.data).toEqual([200, null]);
  });

  it("la tabla comparativa lleva una columna por año, más el total y su porcentaje", () => {
    const table = buildSalesCards(spec).services.table;
    expect(table.columns).toEqual(["2025", "2026", "Total", "% del periodo"]);
    expect(table.rows[0].values).toEqual(["$100.00", "$200.00", "$300.00", "88.2 %"]);
    expect(table.rows[1].values[0]).toBe("$40.00");
    // The year that did not touch that service carries a DASH.
    expect(table.rows[1].values[1]).toBe("–");
  });

  it("la fila de TOTAL de la tabla comparativa cuadra por año", () => {
    const total = buildSalesCards(spec).services.table.rows.at(-1);
    expect(total?.values).toEqual(["$140.00", "$200.00", "$340.00", "100.0 %"]);
  });

  it("los mayores pagadores se eligen por el AGREGADO, no por un año", () => {
    // If the cast changed with the marks, the card could not be compared with itself.
    const payers = buildSalesCards(spec).payers;
    expect(payers.option?.yAxis?.data).toEqual(["SALUDSA", "CONFIAMED"]);
    expect(payers.note).toContain("no por un año");
  });

  it("con varios años el color de un pagador lo lleva el AÑO, no su clase", () => {
    // Tinting by class would paint the three years of one same payer in the same hue, which is
    // precisely what the comparison needs to tell apart.
    const series = buildSalesCards(spec).payers.option?.series ?? [];
    expect(series).toHaveLength(2);
    expect(series[0].itemStyle?.color).not.toBe(series[1].itemStyle?.color);
    // And the bars no longer carry a colour per datum.
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
    // A row of grey caps under each group would add up to three false marks per column to a chart
    // that already carries three real ones.
    const evolution = buildSalesCards(spec).evolution;
    expect(evolution.option?.series.some((s) => s.id === "sin-cargar")).toBe(false);
    // With ONE single year they are drawn.
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
  /** Three complete years, and then the axis narrowed to two months. */
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
    // The subtitle said «Ene–Feb» over twelve columns: the card contradicted itself.
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

describe("«Ocultar meses en 0» quita del eje las columnas sin facturación", () => {
  function year(amounts: Record<number, number>, y = 2026) {
    return {
      year: y,
      points: Array.from({ length: 12 }, (_unused, monthIndex) => ({
        monthIndex,
        amount: monthIndex in amounts ? amounts[monthIndex] : null,
      })),
    };
  }
  function spec(years: ReturnType<typeof year>[]): SalesCardsInput {
    const reading = readSales([line({ amount: 1 })]);
    return {
      reading,
      byYear: years.map((entry) => ({ year: entry.year, reading })),
      period: years.map((entry) => entry.year).join(", "),
      monthlyByYear: years,
    };
  }

  it("se van juntos el mes que nunca llegó y el que llegó en cero", () => {
    const input = spec([year({ 0: 500, 1: 0, 3: 300 })]);

    expect(buildSalesCards(input).evolution.table.columns).toHaveLength(12);
    expect(buildSalesCards(input, { hideEmptyMonths: true }).evolution.table.columns).toEqual([
      "Ene",
      "Abr",
    ]);
  });

  it("una columna sobrevive si CUALQUIER año marcado la mueve", () => {
    const cards = buildSalesCards(spec([year({ 0: 500 }), year({ 1: 400 }, 2025)]), {
      hideEmptyMonths: true,
    });

    expect(cards.evolution.table.columns).toEqual(["Ene", "Feb"]);
    expect(cards.evolution.table.rows.map((row) => row.values)).toEqual([
      ["$500.00", "–"],
      ["–", "$400.00"],
    ]);
  });

  it("`emptyMonths` se cuenta sobre el eje SIN podar, así el botón no se esfuma al pulsarlo", () => {
    const input = spec([year({ 0: 500, 3: 300 })]);

    expect(buildSalesCards(input).emptyMonths).toBe(10);
    expect(buildSalesCards(input, { hideEmptyMonths: true }).emptyMonths).toBe(10);
  });

  it("la nota DICE lo que quitó: un eje encogido en silencio se lee como un año de dos meses", () => {
    const note = buildSalesCards(spec([year({ 0: 500, 3: 300 })]), { hideEmptyMonths: true })
      .evolution.note;

    expect(note).toContain("Se ocultaron 10 meses sin facturación");
  });

  it("el informe NO hereda la poda: construye con la misma entrada y sin estas opciones", () => {
    // A printed toggle is a button nobody can press, PyG's report's rule.
    const input = spec([year({ 0: 500, 3: 300 })]);

    expect(buildSalesCards(input).evolution.table.columns).toHaveLength(12);
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
    // And switching it off takes its bar and its line at once.
    const series = seriesOf([2025, 2026], 12);
    expect(series.map((entry) => entry.name)).toEqual(["2025", "2025", "2026", "2026"]);
    expect(new Set(series.map((entry) => entry.id)).size).toBe(4);
  });

  it("la línea va POR ENCIMA de las barras y sin suavizar", () => {
    // A curve invents values between two months nobody measured.
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

describe("la guía del ⓘ", () => {
  const lines = [line({ amount: 60 }), line({ serviceCode: "\\02", amount: 40 })];

  it("las tres tarjetas la traen, con su para qué y sus controles, en las dos formas", () => {
    const formas = [
      buildSalesCards(input(lines)),
      buildSalesCards(
        comparing([
          { year: 2025, lines },
          { year: 2026, lines },
        ]),
      ),
    ];

    for (const cards of formas) {
      for (const card of [cards.services, cards.payers, cards.evolution]) {
        expect(card.guide?.purpose, card.title).toBeTruthy();
        expect(card.guide?.actions.length ?? 0, card.title).toBeGreaterThan(0);
        for (const action of card.guide?.actions ?? []) {
          expect(action.control, card.title).toBeTruthy();
          expect(action.effect, card.title).toBeTruthy();
        }
      }
    }
  });

  it("cada guía describe SU tarjeta y no la de al lado", () => {
    const { services, payers, evolution } = buildSalesCards(input(lines));
    const purposes = [services, payers, evolution].map((card) => card.guide?.purpose);
    expect(new Set(purposes).size).toBe(3);
  });

  it("solo nombra controles que existen en esta pantalla", () => {
    const cards = buildSalesCards(input(lines));
    const controls = [cards.services, cards.payers, cards.evolution].flatMap((card) =>
      (card.guide?.actions ?? []).map((action) => action.control),
    );
    expect(new Set(controls)).toEqual(new Set(["Año", "Mes", "Servicio", "Ver como tabla"]));
  });
});

/** The color of a bar whose datum carries its own `itemStyle` — how the two one-year cards paint. */
function datumColor(series: { data: unknown[] } | undefined, index: number): string | undefined {
  const datum = series?.data[index] as { itemStyle?: { color?: string } } | undefined;
  return datum?.itemStyle?.color;
}

describe("la evolución se desglosa por servicio", () => {
  const LINES = [
    line({ serviceCode: "\\01", serviceName: "HONORARIOS", amount: 160 }),
    line({ serviceCode: "\\02", serviceName: "MEDICINAS", amount: 60 }),
  ];
  const MONTHS = [
    month(0, [
      line({ serviceCode: "\\01", serviceName: "HONORARIOS", amount: 100 }),
      line({ serviceCode: "\\02", serviceName: "MEDICINAS", amount: 60 }),
    ]),
    month(1, [line({ serviceCode: "\\01", serviceName: "HONORARIOS", amount: 60 })]),
  ];

  function stacked(lines = LINES, months = MONTHS): SalesCardsInput {
    const reading = readSales(lines);
    return {
      reading,
      byYear: [{ year: 2026, reading }],
      period: "Ene–Feb 2026",
      monthlyByYear: [{ year: 2026, points: monthlySeries(months, 2026) }],
      serviceMonthly: monthlyServiceSeries(months, 2026),
    };
  }

  it("cada servicio es un segmento del MISMO apilado", () => {
    const series = buildSalesCards(stacked()).evolution.option?.series ?? [];
    const bars = series.filter((entry) => entry.type === "bar" && entry.id !== "sin-cargar");
    expect(bars.map((entry) => entry.name)).toEqual(["HONORARIOS", "MEDICINAS"]);
    expect(new Set(bars.map((entry) => entry.stack)).size).toBe(1);
  });

  it("un servicio lleva el MISMO color que en la composición", () => {
    const cards = buildSalesCards(stacked());
    const segment = cards.evolution.option?.series.find((entry) => entry.name === "HONORARIOS");
    expect(segment?.itemStyle?.color).toBe(datumColor(cards.services.option?.series[0], 0));
  });

  it("la línea del total es de TINTA, no un paso de la paleta de servicios", () => {
    const series = buildSalesCards(stacked()).evolution.option?.series ?? [];
    const total = series.find((entry) => entry.type === "line");
    const colors = series
      .filter((entry) => entry.type === "bar")
      .map((entry) => entry.itemStyle?.color);
    expect(total?.itemStyle?.color).not.toBeUndefined();
    expect(colors).not.toContain(total?.itemStyle?.color);
    expect(total?.z).toBe(3);
  });

  it("la leyenda nombra los servicios, no la línea", () => {
    const option = buildSalesCards(stacked()).evolution.option;
    expect(option?.legend?.show).toBe(true);
    expect(option?.legend?.data).toEqual(["HONORARIOS", "MEDICINAS"]);
  });

  it("la tabla gemela es una fila por servicio y cierra con el TOTAL", () => {
    const { table } = buildSalesCards(stacked()).evolution;
    expect(table.rows.map((row) => row.label)).toEqual(["HONORARIOS", "MEDICINAS", "TOTAL"]);
    expect(table.rows.at(-1)?.emphasis).toBe(true);
    // Enero: 100 + 60 = 160, y febrero solo honorarios.
    expect(table.rows[0].values[0]).toBe("$100.00");
    expect(table.rows[1].values[1]).toBe("$0.00");
    expect(table.rows[2].values[0]).toBe("$160.00");
  });

  it("un mes que nunca llegó no da segmento a NINGÚN servicio", () => {
    const bars = (buildSalesCards(stacked()).evolution.option?.series ?? []).filter(
      (entry) => entry.type === "bar" && entry.id !== "sin-cargar",
    );
    expect(bars.every((entry) => entry.data[5] === null)).toBe(true);
  });

  it("pasadas las ranuras de identidad, la cola se pliega en «Otros» y la nota lo dice", () => {
    const lines = Array.from({ length: 11 }, (_unused, index) =>
      line({
        serviceCode: `\\${index}`,
        serviceName: `SERVICIO ${index}`,
        amount: 100 - index,
      }),
    );
    const { evolution } = buildSalesCards(stacked(lines, [month(0, lines)]));
    const bars = (evolution.option?.series ?? []).filter(
      (entry) => entry.type === "bar" && entry.id !== "sin-cargar",
    );
    expect(bars).toHaveLength(9);
    expect(bars.at(-1)?.name).toBe("Otros");
    expect(evolution.note).toContain("3 servicios");
    // La tabla NO pliega: es donde un servicio agrupado conserva su cifra.
    expect(evolution.table.rows).toHaveLength(12);
  });

  it("con UN solo servicio la nota no habla de un desglose que no se ve", () => {
    const only = [line({ serviceCode: "\\01", serviceName: "HONORARIOS", amount: 100 })];
    const { evolution } = buildSalesCards(stacked(only, [month(0, only)]));
    expect(evolution.note).not.toContain("desglose");
  });

  it("comparando años NO se apila: el color ahí es la identidad del año", () => {
    const spec = comparing([
      { year: 2025, lines: LINES, months: [month(0, LINES, 2025)] },
      { year: 2026, lines: LINES, months: [month(0, LINES)] },
    ]);
    const series = buildSalesCards({ ...spec, serviceMonthly: monthlyServiceSeries(MONTHS, 2026) })
      .evolution.option?.series;
    expect(series?.every((entry) => entry.stack === undefined)).toBe(true);
  });
});

describe("el color de una barra de pagador", () => {
  const many = Array.from({ length: 10 }, (_unused, index) =>
    line({ payer: `PAGADOR${index}`, amount: 100 - index }),
  );

  it("las diez barras llevan tonos DISTINTOS: diez iguales son una mancha", () => {
    const { payers } = buildSalesCards(input(many));
    const colors = Array.from({ length: PAYER_SLICES }, (_unused, index) =>
      datumColor(payers.option?.series[0], index),
    );
    expect(new Set(colors).size).toBe(PAYER_SLICES);
  });

  it("no choca con el color del primer servicio, que está justo encima", () => {
    const cards = buildSalesCards(input(many));
    expect(datumColor(cards.payers.option?.series[0], 0)).not.toBe(
      datumColor(cards.services.option?.series[0], 0),
    );
  });

  it("la fila de la tabla lleva el tono de SU barra", () => {
    const { payers } = buildSalesCards(input(many));
    expect(payers.table.rows[3].color).toBe(datumColor(payers.option?.series[0], 3));
  });
});

describe("el tramo marcado se nombra en el subtítulo", () => {
  it("con un servicio marcado, las tres tarjetas lo dicen", () => {
    const cards = buildSalesCards({ ...input([line({ amount: 10 })]), scope: "MEDICINAS" });
    for (const card of [cards.services, cards.payers, cards.evolution]) {
      expect(card.subtitle).toContain("MEDICINAS");
      expect(card.subtitle).toContain("Abril 2026");
    }
  });

  it("sin marca de servicio el subtítulo es el de siempre", () => {
    const cards = buildSalesCards(input([line({ amount: 10 })]));
    expect(cards.evolution.subtitle).toBe("Venta total · Abril 2026");
  });
});
