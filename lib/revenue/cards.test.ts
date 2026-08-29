import { describe, expect, it } from "vitest";
import { CHART_MAX_SERIES, CHART_SIGN } from "@/lib/charts/palette";
import { is3DOption } from "@/lib/charts/types";
import {
  buildAnnualCard,
  buildComparisonCard,
  flatComparisonCard,
  buildGrowthCard,
  buildRatioCard,
  buildRevenueCards,
  readRevenueSummary,
  type RevenueCardsInput,
} from "./cards";
import {
  ALL_MONTHS,
  loadedYears,
  REVENUE_2022,
  REVENUE_2023,
  REVENUE_2024,
  REVENUE_2026,
  yearInput,
} from "./fixtures";
import { RATIO_DESCRIPTORS } from "./series";
import { emptyMonthSeries, type RevenueYearInput } from "./types";

function input(years: RevenueYearInput[], overrides: Partial<RevenueCardsInput> = {}) {
  return {
    years,
    months: ALL_MONTHS,
    period: "Ene–Dic",
    canCapture: true,
    ...overrides,
  } satisfies RevenueCardsInput;
}

describe("buildComparisonCard · las dos formas", () => {
  it("con UN año marcado dibuja barras por mes", () => {
    const card = buildComparisonCard(input([yearInput(2026, REVENUE_2026)]));

    expect(card.option?.series).toHaveLength(1);
    expect(card.option?.series[0].type).toBe("bar");
  });

  it("con VARIOS años marcados dibuja una línea por año", () => {
    const card = buildComparisonCard(input(loadedYears()));

    expect(card.option?.series).toHaveLength(4);
    expect(card.option?.series.every((serie) => serie.type === "line")).toBe(true);
    expect(card.option?.series.map((serie) => serie.name)).toEqual([
      "2022",
      "2023",
      "2024",
      "2026",
    ]);
  });

  it("ninguna forma la elige un control: solo cuántos años están marcados", () => {
    const one = buildComparisonCard(input([yearInput(2024, REVENUE_2024)]));
    const two = buildComparisonCard(
      input([yearInput(2022, REVENUE_2022), yearInput(2024, REVENUE_2024)]),
    );

    expect(one.option?.series[0].type).toBe("bar");
    expect(two.option?.series[0].type).toBe("line");
  });

  it("con nueve años el gráfico corta en ocho y la tabla trae los nueve", () => {
    const nine = Array.from({ length: 9 }, (_, index) =>
      yearInput(2018 + index, index === 8 ? REVENUE_2026 : REVENUE_2024),
    );
    const card = buildComparisonCard(input(nine));

    expect(card.option?.series).toHaveLength(CHART_MAX_SERIES);
    expect(card.table.columns).toHaveLength(9);
    // Y lo DICE, en vez de dejar caer un año en silencio.
    expect(card.warnings?.[0]).toContain("2018");
  });

  it("con ocho años o menos no advierte nada", () => {
    const card = buildComparisonCard(input(loadedYears()));

    expect(card.warnings).toBeUndefined();
  });

  it("la tabla es la matriz meses × años con total y promedio", () => {
    const card = buildComparisonCard(input(loadedYears()));

    expect(card.table.columns).toEqual(["2022", "2023", "2024", "2026"]);
    expect(card.table.rows).toHaveLength(14);
    const total = card.table.rows[12];
    const average = card.table.rows[13];
    expect(total.label).toBe("Total ventas");
    expect(total.emphasis).toBe(true);
    expect(total.values[3]).toBe("$1,683,720.41");
    expect(average.label).toBe("Promedio mensual");
    expect(average.emphasis).toBe(true);
    expect(average.values[3]).toBe("$240,531.49");
  });

  it("un mes no cargado lleva raya en la tabla y no un cero", () => {
    const card = buildComparisonCard(input([yearInput(2026, REVENUE_2026)]));

    // Agosto de 2026.
    expect(card.table.rows[7].values[0]).toBeNull();
  });

  it("un año sin ningún mes cargado no dibuja y lo explica", () => {
    const card = buildComparisonCard(input([yearInput(2025, emptyMonthSeries())]));

    expect(card.option).toBeNull();
    expect(card.note).toContain("2025");
  });

  it("ninguna opción declara dos escalas", () => {
    const card = flatComparisonCard(input(loadedYears()));

    expect(Array.isArray(card.option?.yAxis)).toBe(false);
  });
});

describe("buildGrowthCard", () => {
  it("una serie por año base, con el año más reciente de referencia", () => {
    const card = buildGrowthCard(input(loadedYears()), "dolares");

    expect(card.option?.series.map((serie) => serie.name)).toEqual([
      "vs 2022",
      "vs 2023",
      "vs 2024",
    ]);
    expect(card.subtitle).toContain("2026 medido contra 2022, 2023, 2024");
  });

  it("«Ver en» cambia la unidad y no los datos", () => {
    const dollars = buildGrowthCard(input(loadedYears()), "dolares");
    const percent = buildGrowthCard(input(loadedYears()), "porcentaje");

    expect(dollars.option?.series[2].data[0]?.value).toBeCloseTo(155079.71, 2);
    expect(percent.option?.series[2].data[0]?.value).toBeCloseTo(168.61, 1);
    // La tabla trae SIEMPRE las dos, con independencia de la unidad del gráfico.
    expect(dollars.table.columns).toEqual(percent.table.columns);
    expect(dollars.table.rows).toEqual(percent.table.rows);
  });

  it("la tabla trae Δ dólares y Δ porcentaje contra cada base", () => {
    const card = buildGrowthCard(input(loadedYears()), "dolares");

    expect(card.table.columns).toEqual([
      "vs 2022 · Δ $",
      "vs 2022 · Δ %",
      "vs 2023 · Δ $",
      "vs 2023 · Δ %",
      "vs 2024 · Δ $",
      "vs 2024 · Δ %",
    ]);
    const total = card.table.rows[card.table.rows.length - 1];
    expect(total.label).toBe("Ene–Jul");
    expect(total.emphasis).toBe(true);
    expect(total.values[4]).toBe("+$706,189.26");
    expect(total.values[5]).toBe("+72.2 %");
  });

  it("el subtítulo y la nota nombran el tramo realmente comparado", () => {
    const card = buildGrowthCard(input(loadedYears()), "dolares");

    expect(card.subtitle).toContain("Ene–Jul");
    expect(card.note).toContain("Ene–Jul");
  });

  it("con un solo año marcado no hay nada contra qué comparar", () => {
    const card = buildGrowthCard(input([yearInput(2026, REVENUE_2026)]), "dolares");

    expect(card.option).toBeNull();
    expect(card.subtitle).toContain("marca otro año");
  });
});

describe("buildRatioCard · un solo constructor", () => {
  const descriptor = RATIO_DESCRIPTORS[0];

  it("«Montos» pone las dos series en el MISMO eje de dólares", () => {
    const card = buildRatioCard(descriptor, input(loadedYears()), "montos");

    expect(card.option?.series).toHaveLength(2);
    expect(Array.isArray(card.option?.yAxis)).toBe(false);
    expect(card.option?.yAxis?.type).toBe("value");
  });

  it("«Participación» dibuja una sola serie con el porcentaje", () => {
    const card = buildRatioCard(descriptor, input(loadedYears()), "participacion");

    expect(card.option?.series).toHaveLength(1);
    expect(card.option?.series[0].data[0]).toBeCloseTo(12.89, 1);
  });

  it("el color sigue a la ENTIDAD: los cobros TC son el mismo en la 3 y en la 4", () => {
    const asNumerator = buildRatioCard(RATIO_DESCRIPTORS[0], input(loadedYears()), "montos");
    const asDenominator = buildRatioCard(RATIO_DESCRIPTORS[1], input(loadedYears()), "montos");

    const inCard3 = asNumerator.option?.series.find((serie) => serie.id === "cobros-tc");
    const inCard4 = asDenominator.option?.series.find((serie) => serie.id === "cobros-tc");
    expect(inCard3?.itemStyle?.color).toBe(inCard4?.itemStyle?.color);
  });

  it("el total de la tabla es el del tramo compartido, no el de la venta entera", () => {
    const card = buildRatioCard(descriptor, input(loadedYears()), "montos");
    const total = card.table.rows[card.table.rows.length - 1];

    expect(total.label).toBe("Ene–Jun");
    expect(total.values[0]).toBe("$259,028.58");
    expect(total.values[1]).toBe("$1,441,876.38");
    expect(total.values[2]).toBe("18.0 %");
  });

  it("la nota nombra el mes que falta y lo que daría la división ingenua", () => {
    const card = buildRatioCard(descriptor, input(loadedYears()), "montos");

    expect(card.note).toContain("Julio");
    expect(card.note).toContain("18.0 %");
    // Lo que el Excel escribe al dividir seis meses de tarjeta entre siete de venta.
    expect(card.note).toContain("15.4 %");
  });

  it("sin meses que falten ni años vacíos no hay nota que dar", () => {
    // Comisión sobre cobros, con solo 2026 marcado: sus dos términos cubren los mismos seis meses.
    const card = buildRatioCard(
      RATIO_DESCRIPTORS[1],
      input([yearInput(2026, REVENUE_2026)]),
      "montos",
    );

    expect(card.note).toBeUndefined();
  });

  it("un año marcado SIN captura se nombra en la nota en vez de ignorarse", () => {
    // Es el caso real: se marcan cuatro años y solo 2026 tiene cifras registradas. Una tarjeta que
    // callara sería indistinguible de una que ignora el filtro de «Año».
    const card = buildRatioCard(RATIO_DESCRIPTORS[0], input(loadedYears()), "montos");

    expect(card.note).toContain("2022, 2023, 2024");
    expect(card.note).toContain("Registrar datos");
  });

  it("cada descriptor produce su tarjeta sin tocar el constructor", () => {
    const cards = RATIO_DESCRIPTORS.map((entry) =>
      buildRatioCard(entry, input(loadedYears()), "participacion"),
    );

    expect(cards.map((card) => card.id)).toEqual([
      "cobros-tc-vs-ventas",
      "comision-tc-vs-cobros-tc",
      "facebook-vs-ventas",
    ]);
    expect(cards.every((card) => card.option?.series.length === 1)).toBe(true);
  });
});

describe("buildRevenueCards", () => {
  it("sin captura disponible las tres tarjetas «vs» NO EXISTEN", () => {
    const cards = buildRevenueCards(input(loadedYears(), { canCapture: false }));

    expect(cards.ratios).toEqual([]);
    // El comparativo y el crecimiento se dibujan igual: salen del PyG.
    expect(cards.comparison.option).not.toBeNull();
    expect(cards.growth.option).not.toBeNull();
  });

  it("con captura disponible salen las cinco", () => {
    const cards = buildRevenueCards(input(loadedYears()));

    expect(cards.ratios).toHaveLength(3);
  });

  it("las cinco tarjetas llevan guía y tabla", () => {
    const cards = buildRevenueCards(input(loadedYears()));
    const all = [cards.comparison, cards.growth, ...cards.ratios];

    expect(all.every((card) => card.guide !== undefined)).toBe(true);
    expect(all.every((card) => card.table.rows.length > 0)).toBe(true);
  });

  it("todo tooltip va confinado dentro de la tarjeta", () => {
    const cards = buildRevenueCards(input(loadedYears()));
    const all = [cards.comparison, cards.growth, ...cards.ratios];

    expect(all.every((card) => card.option?.tooltip?.confine === true)).toBe(true);
  });

  it("el grid deja sitio a la leyenda en TODA tarjeta que la dibuja", () => {
    // La leyenda va en `bottom: 0`, así que un grid que no le ceda espacio la deja encima de las
    // etiquetas del eje — y el mes bajo la barra es lo que identifica la columna.
    const cards = buildRevenueCards(input(loadedYears()));
    const all = [flatComparisonCard(input(loadedYears())), cards.growth, ...cards.ratios];

    for (const card of all) {
      expect(card.option?.grid?.bottom).toBe(card.option?.legend?.show ? 28 : 8);
    }
    // Y aquí las tres la dibujan de verdad: si no, la comprobación de arriba pasaría vacía.
    expect(all.filter((card) => card.option?.legend?.show)).toHaveLength(5);
  });

  it("sin leyenda el grid recupera el espacio", () => {
    // Un año marcado: no hay nada que separar por color, así que no hay leyenda que alojar.
    const single = flatComparisonCard(input([yearInput(2026, REVENUE_2026)]));
    // «Participación» es una sola serie, y su etiqueta ya está en el eje.
    const share = buildRatioCard(RATIO_DESCRIPTORS[0], input(loadedYears()), "participacion");

    expect(single.option?.legend?.show).toBe(false);
    expect(single.option?.grid?.bottom).toBe(8);
    expect(share.option?.legend?.show).toBe(false);
    expect(share.option?.grid?.bottom).toBe(8);
  });

  it("el grid reserva la altura de las etiquetas del eje", () => {
    const all = [
      flatComparisonCard(input(loadedYears())),
      buildRevenueCards(input(loadedYears())).growth,
      ...buildRevenueCards(input(loadedYears())).ratios,
    ];

    expect(all.every((card) => card.option?.grid?.outerBoundsContain === "axisLabel")).toBe(true);
  });
});

describe("readRevenueSummary", () => {
  it("las cuatro cifras de la cabecera", () => {
    const summary = readRevenueSummary(input(loadedYears()));

    expect(summary.reference?.year).toBe(2026);
    expect(summary.reference?.total).toBeCloseTo(1683720.41, 2);
    expect(summary.reference?.average).toBeCloseTo(240531.49, 2);
    expect(summary.reference?.best).toEqual({ monthIndex: 3, amount: 337092.91 });
    expect(summary.coverage).toBe("Ene–Jul · 7 de 12 meses cargados");
  });

  it("el crecimiento de la ficha es contra el año marcado inmediatamente anterior", () => {
    const summary = readRevenueSummary(input(loadedYears()));

    expect(summary.previous?.baseYear).toBe(2024);
    expect(summary.previous?.total.percent).toBeCloseTo(72.2, 1);
  });

  it("con un solo año no hay crecimiento que enseñar", () => {
    const summary = readRevenueSummary(input([yearInput(2026, REVENUE_2026)]));

    expect(summary.previous).toBeNull();
  });

  it("sin años no hay ficha", () => {
    const summary = readRevenueSummary(input([]));

    expect(summary.reference).toBeNull();
    expect(summary.coverage).toBeNull();
  });
});

describe("buildRatioCard · varios años con datos", () => {
  const descriptor = RATIO_DESCRIPTORS[0];

  /** 2025 con la mitad de lo capturado en 2026, y un mes MENOS: Ene–May. */
  const external2025 = {
    cardRevenue: [20000, 20000, 20000, 20000, 20000, null, null, null, null, null, null, null],
    cardFees: [1000, 1000, 1000, 1000, 1000, null, null, null, null, null, null, null],
    adSpend: [500, 500, 500, 500, 500, null, null, null, null, null, null, null],
  };
  const twoYears = [
    { year: 2025, monthlyRevenue: REVENUE_2024, external: external2025 },
    yearInput(2026, REVENUE_2026),
  ];

  it("el eje pasa a ser el AÑO cuando varios tienen datos", () => {
    const card = buildRatioCard(descriptor, input(twoYears), "montos");

    expect(card.option?.xAxis).toMatchObject({ data: ["2025", "2026"] });
    expect(card.table.rows.map((row) => row.label)).toEqual(["2025", "2026"]);
  });

  it("todos los años se miden sobre el tramo que COMPARTEN", () => {
    const card = buildRatioCard(descriptor, input(twoYears), "montos");

    // 2025 llega a mayo y 2026 a junio: el tramo común es Ene–May, no Ene–Jun.
    expect(card.subtitle).toContain("Ene–May");
    expect(card.note).toContain("Ene–May");
    // 2026 aporta solo sus cinco primeros meses de cobros: 209,379.04 y no 259,028.58.
    expect(card.table.rows[1].values[0]).toBe("$209,379.04");
  });

  it("el tooltip nombra el tramo, no solo el año", () => {
    // Es donde nace la confusión: la columna dice «2024» pero lleva la cifra de un TRAMO, y el total
    // anual del cajón de captura es otro número.
    const card = buildRatioCard(descriptor, input(twoYears), "montos");
    const head = card.option?.tooltip?.formatter?.([
      { name: "2025", value: 100, dataIndex: 0, seriesName: "Ventas" },
    ]);

    expect(head).toContain("2025 · Ene–May");
  });

  it("«Participación» compara el porcentaje de cada año", () => {
    const card = buildRatioCard(descriptor, input(twoYears), "participacion");

    expect(card.option?.series).toHaveLength(1);
    expect(card.option?.series[0].data).toHaveLength(2);
  });

  it("un solo año con datos vuelve al eje de meses", () => {
    const card = buildRatioCard(descriptor, input(loadedYears()), "montos");

    expect(card.option?.xAxis).toMatchObject({
      data: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
    });
  });

  it("el color sigue a la entidad también en el eje de años", () => {
    const months = buildRatioCard(descriptor, input(loadedYears()), "montos");
    const years = buildRatioCard(descriptor, input(twoYears), "montos");

    const inMonths = months.option?.series.find((serie) => serie.id === "cobros-tc");
    const inYears = years.option?.series.find((serie) => serie.id === "cobros-tc");
    expect(inMonths?.itemStyle?.color).toBe(inYears?.itemStyle?.color);
  });
});

describe("el comparativo en tres dimensiones", () => {
  it("con varios años el skyline da a cada uno su propia fila", () => {
    const card = buildComparisonCard(input(loadedYears()), "skyline");
    const option = card.option;

    expect(option !== null && is3DOption(option)).toBe(true);
    if (option === null || !is3DOption(option)) {
      throw new Error("se esperaba la forma 3D");
    }
    expect(option.series).toHaveLength(4);
    expect(option.series.every((serie) => serie.type === "bar3D")).toBe(true);
    // Doce meses de ancho contra cuatro años de fondo: un horizonte, no un cubo.
    expect(option.grid3D.boxWidth).toBeGreaterThan(option.grid3D.boxDepth as number);
  });

  it("un mes nunca cargado NO produce dato, así que el suelo queda vacío", () => {
    const card = buildComparisonCard(input(loadedYears()), "skyline");
    const option = card.option;
    if (option === null || !is3DOption(option)) {
      throw new Error("se esperaba la forma 3D");
    }

    const y2026 = option.series.find((serie) => serie.name === "2026");
    // 2026 llega hasta julio: siete datos, no doce con cinco ceros.
    expect(y2026?.data).toHaveLength(7);
  });

  it("al fondo va el año de la barra MÁS ALTA, no el del total más alto", () => {
    // El caso que separa las dos reglas: 2026 son siete meses, así que su TOTAL es el menor de los
    // cuatro ($1,683,720.41) mientras su abril ($337,092.91) es la barra más alta del tablero.
    // Ordenando por total caía DELANTE y tapaba a los tres de atrás; la oclusión es un hecho sobre
    // alturas, no sobre sumas.
    const card = buildComparisonCard(input(loadedYears()), "skyline");
    const option = card.option;
    if (option === null || !is3DOption(option)) {
      throw new Error("se esperaba la forma 3D");
    }

    // El índice de profundidad MÁXIMO es el fondo de la caja.
    const depthOf = (year: string) =>
      option.series.find((serie) => serie.name === year)?.data[0]?.value[1];
    // Picos: 2026 $337,092.91 · 2024 $247,997.17 · 2022 $213,795.00 · 2023 $184,263.02.
    expect(depthOf("2026")).toBe(3);
    expect(depthOf("2024")).toBe(2);
    expect(depthOf("2022")).toBe(1);
    expect(depthOf("2023")).toBe(0);
  });

  it("2026 con siete meses va detrás de 2024 con doce", () => {
    const card = buildComparisonCard(
      input([yearInput(2024, REVENUE_2024), yearInput(2026, REVENUE_2026)]),
      "skyline",
    );
    const option = card.option;
    if (option === null || !is3DOption(option)) {
      throw new Error("se esperaba la forma 3D");
    }

    const depthOf = (year: string) =>
      option.series.find((serie) => serie.name === year)?.data[0]?.value[1];
    expect(depthOf("2026")).toBe(1);
    expect(depthOf("2024")).toBe(0);
  });

  it("la caja llena la tarjeta en vez de quedarse en un tercio", () => {
    const card = buildComparisonCard(input(loadedYears()), "skyline");
    const option = card.option;
    if (option === null || !is3DOption(option)) {
      throw new Error("se esperaba la forma 3D");
    }

    expect(option.grid3D.boxWidth).toBeGreaterThanOrEqual(140);
    expect(option.grid3D.boxWidth).toBeLessThanOrEqual(260);
    expect(option.grid3D.viewControl?.distance).toBe(170);
  });

  it("el color del año es el MISMO en las dos formas", () => {
    const flat = flatComparisonCard(input(loadedYears()));
    const solid = buildComparisonCard(input(loadedYears()), "skyline");
    const option = solid.option;
    if (option === null || !is3DOption(option)) {
      throw new Error("se esperaba la forma 3D");
    }

    const flatColor = flat.option?.series.find((serie) => serie.name === "2026")?.itemStyle?.color;
    const solidColor = option.series.find((serie) => serie.name === "2026")?.itemStyle?.color;
    expect(solidColor).toBe(flatColor);
  });

  it("con UN año no hay fondo que dar, así que no se ofrece", () => {
    const one = input([yearInput(2026, REVENUE_2026)]);

    expect(buildRevenueCards(one).skylineAvailable).toBe(false);
    // Y pedirlo igualmente cae en la forma plana en vez de dibujar una caja de una fila.
    const card = buildComparisonCard(one, "skyline");
    expect(card.option !== null && is3DOption(card.option)).toBe(false);
  });

  it("con varios años sí se ofrece", () => {
    expect(buildRevenueCards(input(loadedYears())).skylineAvailable).toBe(true);
  });

  it("el informe y el Excel exigen la forma PLANA", () => {
    // `flatComparisonCard` es la guarda: si el defecto se invirtiera algún día, tiene que fallar aquí
    // y no imprimir un rectángulo vacío.
    const card = flatComparisonCard(input(loadedYears()));

    expect(card.option !== null && is3DOption(card.option)).toBe(false);
  });
});

describe("el crecimiento hace explícitas utilidades y pérdidas", () => {
  it("cada barra lleva glifo, signo y valor cuando caben", () => {
    const card = buildGrowthCard(
      input([yearInput(2026, REVENUE_2026), yearInput(2024, REVENUE_2024)]),
      "dolares",
    );
    const label = card.option?.series[0].label;

    expect(label?.show).toBe(true);
    // Enero de 2026 contra 2024: +$155,079.71.
    expect(label?.formatter?.({ name: "Ene", value: 155079.71, dataIndex: 0 })).toContain("▲");
    expect(label?.formatter?.({ name: "Ene", value: -35288.48, dataIndex: 0 })).toContain("▼");
  });

  it("el signo lleva su propia tinta, y la BARRA conserva la del año base", () => {
    const card = buildGrowthCard(input(loadedYears()), "dolares");
    const serie = card.option?.series[0];

    // La regla de la casa: `positive`/`negative` son el signo de un valor, nunca el color de una serie.
    expect(serie?.label?.rich?.pos?.color).toBe(CHART_SIGN.positive);
    expect(serie?.label?.rich?.neg?.color).toBe(CHART_SIGN.negative);
    expect(serie?.itemStyle?.color).not.toBe(CHART_SIGN.positive);
    expect(serie?.itemStyle?.color).not.toBe(CHART_SIGN.negative);
  });

  it("la línea de cero se dibuja UNA vez, no una por serie", () => {
    const card = buildGrowthCard(input(loadedYears()), "dolares");
    const withLine = card.option?.series.filter((serie) => serie.markLine !== undefined);

    expect(withLine).toHaveLength(1);
    expect(withLine?.[0].markLine?.data).toEqual([{ yAxis: 0 }]);
  });

  it("con pocos meses las barras se ensanchan en vez de quedarse perdidas", () => {
    const narrow = buildGrowthCard(input(loadedYears(), { months: [1, 2, 3] }), "dolares");
    const wide = buildGrowthCard(input(loadedYears()), "dolares");

    expect(narrow.option?.series[0].barMaxWidth).toBe(30);
    expect(wide.option?.series[0].barMaxWidth).toBe(18);
  });

  it("con UN año base la cifra se dibuja: hay una barra por mes y le pertenece sin ambigüedad", () => {
    const card = buildGrowthCard(
      input([yearInput(2024, REVENUE_2024), yearInput(2026, REVENUE_2026)]),
      "dolares",
    );

    expect(card.option?.series).toHaveLength(1);
    expect(card.option?.series[0].label?.show).toBe(true);
    expect(card.option?.series[0].labelLayout?.hideOverlap).toBe(true);
  });

  it("con VARIOS años base se calla: dos etiquetas no caben ni se pueden atribuir", () => {
    // Un mes mete N barras en una sola ranura, así que sus centros quedan a un ancho de barra —unos
    // 39px— mientras «▼ -$12,287.73» mide unos 90. Y la etiqueta lleva la tinta del SIGNO, no la de
    // la serie: con dos, nada empareja cada cifra con su barra salvo la posición.
    const card = buildGrowthCard(input(loadedYears()), "dolares");

    expect(card.option?.series.length).toBeGreaterThan(1);
    expect(card.option?.series.every((serie) => serie.label?.show === false)).toBe(true);
    // La línea de cero sigue ahí, y el tooltip y la tabla siguen trayendo las cifras con signo.
    expect(card.option?.series[0].markLine?.data).toEqual([{ yAxis: 0 }]);
    expect(card.table.columns).toContain("vs 2024 · Δ $");
    expect(card.table.columns).toContain("vs 2024 · Δ %");
  });

  it("la etiqueta se coloca por el SIGNO: encima de una subida, debajo de una caída", () => {
    // `position: "top"` es el borde superior del rectángulo del dato, y una barra que cae va de cero
    // hacia abajo: su borde superior ES la línea de cero. Con dos años base, dos etiquetas de ~90px
    // caían a ~20px una de otra a la MISMA altura, y salía «▼ -$4,5▼-$4,52…12,287.73».
    //
    // 2024 contra 2023 es el caso con los dos signos: enero cae (−$38,183.31) y marzo sube
    // (+$62,476.00).
    const card = buildGrowthCard(
      input([yearInput(2023, REVENUE_2023), yearInput(2024, REVENUE_2024)]),
      "dolares",
    );
    const data = card.option?.series[0].data;

    expect(data?.[0]?.value).toBeCloseTo(-38183.31, 2);
    expect(data?.[0]?.label?.position).toBe("bottom");
    expect(data?.[2]?.value).toBeCloseTo(62476.0, 2);
    // Una subida se queda con el `position` de la serie, que es «top».
    expect(data?.[2]?.label?.position).toBeUndefined();
    expect(card.option?.series[0].label?.position).toBe("top");
  });

  it("un mes sin dato no discute su posición: no dibuja etiqueta", () => {
    const card = buildGrowthCard(input(loadedYears(), { months: [0, 1] }), "dolares");
    const label = card.option?.series[0].label;

    expect(label?.formatter?.({ name: "Ene", value: null, dataIndex: 0 })).toBe("");
    expect(label?.formatter?.({ name: "Ene", value: 0, dataIndex: 0 })).toBe("");
  });

  it("el eje es el tramo COMPARTIDO, no el span marcado: nada de columnas muertas", () => {
    // 2026 llega hasta julio y 2024 está entero. El span marcado son doce meses y solo siete pueden
    // llevar barra; agosto a diciembre dibujaban un quinto de plot vacío.
    const card = buildGrowthCard(
      input([yearInput(2024, REVENUE_2024), yearInput(2026, REVENUE_2026)]),
      "dolares",
    );

    expect(card.option?.xAxis.data).toEqual(["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul"]);
    expect(card.option?.series[0].data).toHaveLength(7);
    // Y el eje dice lo mismo que la nota y que la fila TOTAL, que ya nombraban ese tramo.
    expect(card.subtitle).toContain("Ene–Jul");
    expect(card.note).toContain("Ene–Jul");
  });
});

describe("las etiquetas van ESCRITAS, nunca bajadas de caja", () => {
  const facebook = RATIO_DESCRIPTORS[2];
  const comision = RATIO_DESCRIPTORS[1];

  it("una sigla sobrevive dentro de la frase", () => {
    // `.toLowerCase()` no distingue una sigla de un nombre propio: «Comisiones TC» salía
    // «comisiones tc» y «Publicidad Facebook» salía «publicidad facebook».
    const card = buildRatioCard(
      comision,
      input([yearInput(2024, REVENUE_2024), yearInput(2026, REVENUE_2026)]),
      "montos",
    );

    expect(card.note).toContain("las comisiones TC");
    expect(card.note).not.toContain("comisiones tc");
  });

  it("un nombre propio conserva su mayúscula", () => {
    const card = buildRatioCard(facebook, input(loadedYears()), "montos");

    expect(card.note).toContain("la pauta de Facebook");
    expect(card.note).not.toContain("publicidad facebook");
  });

  it("la nota de años sin registrar concuerda con su sujeto", () => {
    const several = buildRatioCard(facebook, input(loadedYears()), "montos");
    const one = buildRatioCard(
      facebook,
      input([yearInput(2022, REVENUE_2022), yearInput(2026, REVENUE_2026)]),
      "montos",
    );

    // El verbo concuerda con los AÑOS, que es lo que se cuenta; un participio tendría que concordar
    // además con el género de la serie, y «la pauta de Facebook» es femenina y singular.
    expect(several.note).toContain("están marcados y no registran la pauta de Facebook");
    expect(one.note).toContain("está marcado y no registra la pauta de Facebook");
    expect(several.note).not.toContain("registrado");
  });
});

describe("un año sin nada registrado lo dice, no finge un tramo", () => {
  it("el subtítulo nombra la ausencia en vez de componer «Sin meses 2026»", () => {
    const card = buildRatioCard(
      RATIO_DESCRIPTORS[0],
      input([yearInput(2024, REVENUE_2024)]),
      "montos",
    );

    expect(card.subtitle).toBe(
      "2024 · sin datos registrados · qué parte de la venta se cobró con tarjeta",
    );
    expect(card.subtitle).not.toContain("Sin meses");
  });

  it("ningún año marcado con cifras deja las TRES tarjetas sin nada que dibujar", () => {
    const cards = buildRevenueCards(input([yearInput(2024, REVENUE_2024)]));

    expect(cards.ratios.every((card) => card.option === null)).toBe(true);
    expect(cards.ratiosIdle).toBe(true);
  });

  it("con SOLO algunos años sin registrar, las tarjetas se quedan: ese caso lo resuelve la nota", () => {
    const cards = buildRevenueCards(input(loadedYears()));

    expect(cards.ratiosIdle).toBe(false);
    expect(cards.ratios[0].note).toContain("no registran");
  });

  it("donde no se puede capturar no hay tarjetas, y por lo tanto tampoco vacío que anunciar", () => {
    const cards = buildRevenueCards(input(loadedYears(), { canCapture: false }));

    expect(cards.ratios).toEqual([]);
    expect(cards.ratiosIdle).toBe(false);
  });
});

describe("Ventas por año · la lectura anual", () => {
  it("una barra por año marcado, con el color de su identidad", () => {
    const card = buildAnnualCard(input(loadedYears()), "total");

    expect(card.option?.xAxis.data).toEqual(["2022", "2023", "2024", "2026"]);
    expect(card.option?.series).toHaveLength(1);
    expect(card.option?.series[0].data).toHaveLength(4);
  });

  it("«Ver como» cambia la CIFRA sobre el mismo eje, nunca añade un segundo", () => {
    const total = buildAnnualCard(input(loadedYears()), "total");
    const average = buildAnnualCard(input(loadedYears()), "promedio");

    // 2026: $1,683,720.41 en siete meses → $240,531.487… al mes.
    const valueOf = (card: typeof total, index: number) =>
      card.option?.series[0].data[index]?.value;
    expect(valueOf(total, 3)).toBeCloseTo(1683720.41, 2);
    expect(valueOf(average, 3)).toBeCloseTo(240531.49, 2);
    // La invariante de la casa: ninguna tarjeta declara dos `yAxis`.
    expect(total.option?.series).toHaveLength(1);
    expect(average.option?.series).toHaveLength(1);
  });

  it("la tabla lleva las tres cifras, esté en la forma que esté", () => {
    const card = buildAnnualCard(input(loadedYears()), "total");

    expect(card.table.columns).toEqual(["Total", "Promedio mensual", "Meses cargados"]);
    expect(card.table.rows.map((row) => row.label)).toEqual(["2022", "2023", "2024", "2026"]);
    expect(card.table.rows[3].values[2]).toBe("7 meses");
  });

  it("un año a medias se explica: la barra es corta por el calendario, no por el negocio", () => {
    const card = buildAnnualCard(input(loadedYears()), "total");

    expect(card.note).toContain("2026 llega hasta julio");
    expect(card.note).toContain("Promedio mensual");
  });

  it("un año sin ningún mes cargado no dibuja y lleva raya", () => {
    const card = buildAnnualCard(
      input([yearInput(2026, REVENUE_2026), yearInput(2025, emptyMonthSeries())]),
      "total",
    );

    expect(card.option?.xAxis.data).toEqual(["2026"]);
    expect(card.table.rows.find((row) => row.label === "2025")?.values).toEqual([null, null, null]);
  });
});

describe("marcar un semestre no cambia cómo se mide, solo sobre qué", () => {
  const S1 = [0, 1, 2, 3, 4, 5];

  it("el crecimiento sigue midiéndose sobre el tramo COMPARTIDO dentro del semestre", () => {
    const card = buildGrowthCard(
      input([yearInput(2024, REVENUE_2024), yearInput(2026, REVENUE_2026)], { months: S1 }),
      "dolares",
    );

    // Los dos años tienen Ene–Jun, así que el tramo compartido es el semestre entero: el atajo
    // acota QUÉ se mide y la regla (c) sigue decidiendo SOBRE QUÉ.
    expect(card.option?.xAxis.data).toEqual(["Ene", "Feb", "Mar", "Abr", "May", "Jun"]);
    expect(card.note).toContain("El tramo comparado es Ene–Jun");
  });

  it("las razones siguen midiéndose sobre el tramo en que los dos términos existen", () => {
    // Lo capturado de 2026 llega a JUNIO, así que dentro de S1 no falta ningún mes.
    const card = buildRatioCard(
      RATIO_DESCRIPTORS[0],
      input([yearInput(2026, REVENUE_2026)], { months: S1 }),
      "montos",
    );

    expect(card.subtitle).toBe("Ene–Jun 2026 · qué parte de la venta se cobró con tarjeta");
    // Julio queda FUERA del span, así que no es un mes «que falta registrar»: no existe aquí.
    expect(card.note).toBeUndefined();
  });
});
