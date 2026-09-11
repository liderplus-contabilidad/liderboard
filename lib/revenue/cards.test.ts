import { describe, expect, it } from "vitest";
import {
  CHART_MAX_SERIES,
  CHART_PALETTE,
  CHART_STAGE,
  CHART_STAGE_PALETTE,
  stageColor,
} from "@/lib/charts/palette";
import { fitBarWidth } from "@/lib/charts/bar-fit";
import { bar3DSeries, flatOnly, is3DOption } from "@/lib/charts/types";
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
  REVENUE_2024,
  REVENUE_2026,
  yearInput,
} from "./fixtures";
import { RATIO_DESCRIPTORS } from "./series";
import { emptyMonthSeries, type RevenueYearInput } from "./types";

/**
 * «Ventas por año» en su cuerpo PLANO, que es el que casi todas estas pruebas leen.
 *
 * `flatOnly` es la misma guarda que aplican el informe y el Excel: deja el tipo en 2D sin castear y
 * revienta si algún día el defecto se invirtiera, en vez de dejar una prueba mirando un `undefined`.
 * Las pruebas del cuerpo sólido llaman al constructor directamente. El crecimiento no pasa por aquí:
 * no tiene más cuerpo que el plano.
 */
const flatAnnual = (...args: Parameters<typeof buildAnnualCard>) =>
  flatOnly(buildAnnualCard(...args));

function input(years: RevenueYearInput[], overrides: Partial<RevenueCardsInput> = {}) {
  return {
    years,
    months: ALL_MONTHS,
    period: "Ene–Dic",
    canCapture: true,
    ...overrides,
  } satisfies RevenueCardsInput;
}

describe("buildComparisonCard · una línea por año", () => {
  it("con UN año marcado dibuja UNA línea, no barras", () => {
    const card = buildComparisonCard(input([yearInput(2026, REVENUE_2026)]));

    expect(card.option?.series).toHaveLength(1);
    expect(card.option?.series[0].type).toBe("line");
    expect(card.option?.series[0].symbol).toBe("circle");
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

  it("la forma no cambia con las marcas: un año y dos años son la misma línea", () => {
    const one = buildComparisonCard(input([yearInput(2024, REVENUE_2024)]));
    const two = buildComparisonCard(
      input([yearInput(2022, REVENUE_2022), yearInput(2024, REVENUE_2024)]),
    );

    expect(one.option?.series[0].type).toBe("line");
    expect(two.option?.series[0].type).toBe("line");
    // Con un año no hay leyenda: el subtítulo ya lo nombra.
    expect(one.option?.legend?.show).toBe(false);
    expect(two.option?.legend?.show).toBe(true);
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

  describe("con varios años se lee UNA línea a la vez", () => {
    it("el tooltip es de la línea y lista los MESES de ese año, no los años del mes", () => {
      const card = flatComparisonCard(input(loadedYears()));
      const tooltip = card.option?.tooltip;

      expect(tooltip?.trigger).toBe("item");
      const html = tooltip?.formatter?.({
        name: "Jul",
        seriesId: "year-2026",
        seriesName: "2026",
        value: REVENUE_2026[6],
        dataIndex: 6,
      });
      expect(html).toContain("2026");
      // Los siete meses cargados de 2026, en orden, y ninguno de los otros años.
      expect(html).toContain("Ene");
      expect(html).toContain("$247,053.11");
      expect(html).toContain("Jul");
      expect(html).toContain("$241,844.03");
      expect(html).not.toContain("2024");
      // Agosto no está cargado: raya, no cero.
      expect(html).not.toContain("$0.00");
    });

    it("el recuadro reparte los meses en DOS columnas, no en una lista de doce", () => {
      const card = flatComparisonCard(input(loadedYears()));
      const html = card.option?.tooltip?.formatter?.({
        name: "Ene",
        seriesId: "year-2024",
        seriesName: "2024",
        value: REVENUE_2024[0],
        dataIndex: 0,
      });

      expect(html).toMatch(/grid-template-columns:\s*auto auto auto auto/);
    });

    it("al pasar por el trazo la línea se resalta y las demás se atenúan", () => {
      const card = flatComparisonCard(input(loadedYears()));

      for (const serie of card.option?.series ?? []) {
        expect(serie.emphasis?.focus).toBe("series");
        expect(serie.triggerEvent).toBe("line");
      }
    });

    it("con UN año las barras conservan el tooltip de columna", () => {
      const card = flatComparisonCard(input([yearInput(2026, REVENUE_2026)]));

      expect(card.option?.tooltip?.trigger).toBe("axis");
    });
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

    // El dato es un objeto porque lleva de qué lado se escribe su cifra; el valor es el mismo.
    const valueOf = (card: typeof dollars, serie: number) => {
      const datum = card.option?.series[serie].data[0];
      return typeof datum === "object" && datum !== null ? datum.value : datum;
    };
    expect(valueOf(dollars, 2)).toBeCloseTo(155079.71, 2);
    expect(valueOf(percent, 2)).toBeCloseTo(168.61, 1);
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

describe("cada gráfica del módulo escribe su cifra sobre la marca, tumbada", () => {
  function wrote(series: { label?: { show: boolean; formatter?: (p: never) => string } }) {
    const label = series.label;
    const param = { value: 100_000, name: "Ene", dataIndex: 0 } as never;
    return label?.show ? (label.formatter?.(param) ?? "") : "";
  }

  it("«Ventas por año» escribe el total de cada año sobre su barra", () => {
    const card = flatAnnual(input(loadedYears()), "total");

    expect(wrote(card.option?.series[0] ?? {})).toBe("$100,000.00");
  });

  it("el comparativo de VARIOS años no escribe ninguna: doce cifras por año tapan la trayectoria", () => {
    const several = flatComparisonCard(input(loadedYears()));

    expect(several.option?.series.every((serie) => !serie.label?.show)).toBe(true);
    // Y sin cifras arriba la rejilla no gasta margen en alojarlas.
    expect(several.option?.grid?.top).toBe(16);
  });

  it("con UN año escribe la cifra sobre cada punto, en la tinta del escenario", () => {
    const one = flatComparisonCard(input([yearInput(2026, REVENUE_2026)]));
    const [serie] = one.option?.series ?? [];

    expect(wrote(serie)).toBe("$100,000.00");
    expect(serie.label?.position).toBe("top");
    expect(serie.label?.color).toBe(CHART_STAGE.ink);
    // Y la rejilla abre arriba la fila que esas cifras necesitan.
    expect(one.option?.grid?.top).toBeGreaterThan(16);
  });

  it("la rejilla abre arriba lo que la fila más alta necesita", () => {
    // `outerBoundsContain` solo reserva para las etiquetas del EJE: sin esto la cifra de la columna
    // más alta se recorta contra el borde de la tarjeta.
    const [ratio] = buildRevenueCards(input(loadedYears())).ratios;

    expect(Number(ratio.option?.grid?.top)).toBeGreaterThan(
      Number(flatComparisonCard(input(loadedYears())).option?.grid?.top),
    );
  });

  it("en las «vs» la cifra del numerador crece HACIA LA DERECHA, no sobre la barra de al lado", () => {
    // Centrada sobre su barra corta, sus primeros dígitos se imprimían encima de la barra del
    // denominador, diez veces más alta y justo a su izquierda. Anclar el borde izquierdo es lo que
    // deja todo lo que ocupa a la derecha de ese relleno; empujarla solo cambiaba de vecino.
    const [ratio] = buildRevenueCards(input(loadedYears())).ratios;
    const [denominator, numerator] = ratio.option?.series ?? [];

    expect(numerator.label?.align).toBe("left");
    expect(numerator.label?.offset?.[1]).toBe(0);
    // Empieza a la altura del borde izquierdo de su propia barra, no más allá.
    expect(numerator.label?.offset?.[0]).toBe(-(numerator.barMaxWidth ?? 0) / 2);
    // La del denominador corona la barra más alta de la tarjeta: nada hay a su lado a esa altura.
    expect(denominator.label?.align).toBeUndefined();
  });

  it("el skyline no entra en el trato: una cifra por teja tapa las de detrás", () => {
    const card = buildComparisonCard(input(loadedYears()), "skyline");

    expect(is3DOption(card.option)).toBe(true);
  });
});

describe("buildRatioCard · un solo constructor", () => {
  const descriptor = RATIO_DESCRIPTORS[0];

  it("las dos series van en el MISMO eje de dólares", () => {
    const card = buildRatioCard(descriptor, input(loadedYears()));

    expect(card.option?.series).toHaveLength(2);
    expect(Array.isArray(card.option?.yAxis)).toBe(false);
    expect(card.option?.yAxis?.type).toBe("value");
  });

  it("la participación se escribe BAJO la cifra del numerador, no en otra gráfica", () => {
    // Era «Ver como»: el monto o el porcentaje, nunca los dos. Son una sola lectura —«esto es tanto,
    // y es tanto por ciento de aquello»— y partirla obligaba a sostener una mitad de memoria.
    const card = buildRatioCard(descriptor, input(loadedYears()));
    const [denominator, numerator] = card.option?.series ?? [];

    const written =
      numerator.label?.formatter?.({ value: 34_558, name: "Ene", dataIndex: 0 }) ?? "";
    expect(written).toContain("$34,558.00");
    expect(written).toMatch(/\{share\|12\.9 %\}/);
    // Y el denominador escribe su monto y nada más: el porcentaje es del numerador.
    expect(denominator.label?.formatter?.({ value: 268_100, name: "Ene", dataIndex: 0 })).toBe(
      "$268,100.00",
    );
  });

  it("cada serie escribe en SU fila, así que las dos cifras del mes no se disputan una franja", () => {
    const card = buildRatioCard(descriptor, input(loadedYears()));
    const [denominator, numerator] = card.option?.series ?? [];

    expect(numerator.label?.distance).toBeGreaterThan(denominator.label?.distance ?? 0);
  });

  it("el color sigue a la ENTIDAD: los cobros TC son el mismo en la 3 y en la 4", () => {
    const asNumerator = buildRatioCard(RATIO_DESCRIPTORS[0], input(loadedYears()));
    const asDenominator = buildRatioCard(RATIO_DESCRIPTORS[1], input(loadedYears()));

    const inCard3 = asNumerator.option?.series.find((serie) => serie.id === "cobros-tc");
    const inCard4 = asDenominator.option?.series.find((serie) => serie.id === "cobros-tc");
    expect(inCard3?.itemStyle?.color).toBe(inCard4?.itemStyle?.color);
  });

  it("el total de la tabla es el del tramo compartido, no el de la venta entera", () => {
    const card = buildRatioCard(descriptor, input(loadedYears()));
    const total = card.table.rows[card.table.rows.length - 1];

    expect(total.label).toBe("Ene–Jun");
    expect(total.values[0]).toBe("$259,028.58");
    expect(total.values[1]).toBe("$1,441,876.38");
    expect(total.values[2]).toBe("18.0 %");
  });

  it("la nota nombra el mes que falta y lo que daría la división ingenua", () => {
    const card = buildRatioCard(descriptor, input(loadedYears()));

    expect(card.note).toContain("Julio");
    expect(card.note).toContain("18.0 %");
    // Lo que el Excel escribe al dividir seis meses de tarjeta entre siete de venta.
    expect(card.note).toContain("15.4 %");
  });

  it("sin meses que falten ni años vacíos no hay nota que dar", () => {
    // Comisión sobre cobros, con solo 2026 marcado: sus dos términos cubren los mismos seis meses.
    const card = buildRatioCard(RATIO_DESCRIPTORS[1], input([yearInput(2026, REVENUE_2026)]));

    expect(card.note).toBeUndefined();
  });

  it("un año marcado SIN captura se nombra en la nota en vez de ignorarse", () => {
    // Es el caso real: se marcan cuatro años y solo 2026 tiene cifras registradas. Una tarjeta que
    // callara sería indistinguible de una que ignora el filtro de «Año».
    const card = buildRatioCard(RATIO_DESCRIPTORS[0], input(loadedYears()));

    expect(card.note).toContain("2022, 2023, 2024");
    expect(card.note).toContain("Registrar datos");
  });

  it("cada descriptor produce su tarjeta sin tocar el constructor", () => {
    const cards = RATIO_DESCRIPTORS.map((entry) => buildRatioCard(entry, input(loadedYears())));

    expect(cards.map((card) => card.id)).toEqual([
      "cobros-tc-vs-ventas",
      "comision-tc-vs-cobros-tc",
      "publicidad-vs-ventas",
    ]);
    expect(cards.every((card) => card.option?.series.length === 2)).toBe(true);
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

    expect(single.option?.legend?.show).toBe(false);
    expect(single.option?.grid?.bottom).toBe(8);
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
    manualRevenue: emptyMonthSeries(),
    cardRevenue: [20000, 20000, 20000, 20000, 20000, null, null, null, null, null, null, null],
    cardFees: [1000, 1000, 1000, 1000, 1000, null, null, null, null, null, null, null],
    adSpend: [500, 500, 500, 500, 500, null, null, null, null, null, null, null],
  };
  const twoYears = [
    { year: 2025, monthlyRevenue: REVENUE_2024, external: external2025 },
    yearInput(2026, REVENUE_2026),
  ];

  it("el eje pasa a ser el AÑO cuando varios tienen datos", () => {
    const card = buildRatioCard(descriptor, input(twoYears));

    expect(card.option?.xAxis).toMatchObject({ data: ["2025", "2026"] });
    expect(card.table.rows.map((row) => row.label)).toEqual(["2025", "2026"]);
  });

  it("todos los años se miden sobre el tramo que COMPARTEN", () => {
    const card = buildRatioCard(descriptor, input(twoYears));

    // 2025 llega a mayo y 2026 a junio: el tramo común es Ene–May, no Ene–Jun.
    expect(card.subtitle).toContain("Ene–May");
    expect(card.note).toContain("Ene–May");
    // 2026 aporta solo sus cinco primeros meses de cobros: 209,379.04 y no 259,028.58.
    expect(card.table.rows[1].values[0]).toBe("$209,379.04");
  });

  it("el tooltip nombra el tramo, no solo el año", () => {
    // Es donde nace la confusión: la columna dice «2024» pero lleva la cifra de un TRAMO, y el total
    // anual del cajón de captura es otro número.
    const card = buildRatioCard(descriptor, input(twoYears));
    const head = card.option?.tooltip?.formatter?.([
      { name: "2025", value: 100, dataIndex: 0, seriesName: "Ventas" },
    ]);

    expect(head).toContain("2025 · Ene–May");
  });

  it("en el eje de años cada columna trae sus dos montos y su porcentaje", () => {
    const card = buildRatioCard(descriptor, input(twoYears));
    const [denominator, numerator] = card.option?.series ?? [];

    expect(denominator.data).toHaveLength(2);
    expect(numerator.data).toHaveLength(2);
    expect(numerator.label?.formatter?.({ value: 1, name: "2025", dataIndex: 0 })).toContain(
      "{share|",
    );
  });

  it("un solo año con datos vuelve al eje de meses", () => {
    const card = buildRatioCard(descriptor, input(loadedYears()));

    expect(card.option?.xAxis).toMatchObject({
      data: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
    });
  });

  it("el color sigue a la entidad también en el eje de años", () => {
    const months = buildRatioCard(descriptor, input(loadedYears()));
    const years = buildRatioCard(descriptor, input(twoYears));

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

  it("la cifra de la barra bajo el cursor sale como dinero, no como el dato en crudo", () => {
    // `echarts-gl` escribe el dato TAL CUAL sobre la barra a la que se apunta si no se le dice otra
    // cosa: era el único importe de la app que llegaba a pantalla como «39684.6195…».
    const card = buildComparisonCard(input(loadedYears()), "skyline");
    const option = card.option;
    if (option === null || !is3DOption(option)) {
      throw new Error("se esperaba la forma 3D");
    }
    const label = option.series[0].emphasis?.label;

    expect(label?.show).toBe(true);
    expect(label?.formatter?.({ name: "2022", value: [0, 0, 39_684.6195] })).toBe("$39,684.62");
  });

  it("los años van en ORDEN: el más antiguo al fondo y el más reciente delante", () => {
    // Fue «el año de la barra más alta al fondo», y así el eje leía «2021 · 2026 · 2024 · 2022»:
    // un lector busca un año por su posición, y la oclusión no vale lo que cuesta esa lectura.
    const card = buildComparisonCard(input(loadedYears()), "skyline");
    const option = card.option;
    if (option === null || !is3DOption(option)) {
      throw new Error("se esperaba la forma 3D");
    }

    // El índice de profundidad MÁXIMO es el fondo de la caja.
    const depthOf = (year: string) =>
      option.series.find((serie) => serie.name === year)?.data[0]?.value[1];
    expect(depthOf("2022")).toBe(3);
    expect(depthOf("2023")).toBe(2);
    expect(depthOf("2024")).toBe(1);
    expect(depthOf("2026")).toBe(0);
    // El eje se rotula de delante hacia atrás, así que leído de atrás hacia delante es cronológico.
    expect(option.yAxis3D.data).toEqual(["2026", "2024", "2023", "2022"]);
  });

  it("2026 va delante de 2024 aunque su abril sea la barra más alta del tablero", () => {
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
    expect(depthOf("2024")).toBe(1);
    expect(depthOf("2026")).toBe(0);
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

  it("el año guarda su RANURA en la escala del escenario", () => {
    const flat = flatComparisonCard(input(loadedYears()));
    const solid = buildComparisonCard(input(loadedYears()), "skyline");
    const annual = flatAnnual(input(loadedYears()), "total");
    const option = solid.option;
    if (option === null || !is3DOption(option)) {
      throw new Error("se esperaba la forma 3D");
    }

    const flatColor = flat.option?.series.find((serie) => serie.name === "2026")?.itemStyle?.color;
    const solidColor = option.series.find((serie) => serie.name === "2026")?.itemStyle?.color;
    // «Ventas por año» dibuja en blanco: es donde el año lleva su ranura en la escala clara.
    const column = annual.option?.xAxis;
    const at = Array.isArray(column) ? -1 : (column?.data?.indexOf("2026") ?? -1);
    const datum = annual.option?.series[0].data[at];
    const lightColor =
      typeof datum === "object" && datum !== null ? datum.itemStyle?.color : undefined;
    // Las dos formas del comparativo están sobre el MISMO escenario, así que el año es UN color en
    // la línea y en la fila del skyline. Lo que se conserva frente a la tarjeta blanca es la
    // POSICIÓN: `stageColor` traduce por ranura desde el color que ese año lleva en blanco.
    expect(flatColor).toBe(solidColor);
    expect(solidColor).toBe(stageColor(lightColor ?? ""));
    expect(CHART_PALETTE.indexOf(lightColor as (typeof CHART_PALETTE)[number])).toBe(
      CHART_STAGE_PALETTE.indexOf(solidColor as (typeof CHART_STAGE_PALETTE)[number]),
    );
  });

  it("el comparativo está sobre el escenario con varios años y también con uno", () => {
    const several = flatComparisonCard(input(loadedYears()));
    const one = flatComparisonCard(input([yearInput(2026, REVENUE_2026)]));
    const growth = buildGrowthCard(input(loadedYears()), "dolares");

    // Varios años son trazos finos sobre un plano: el fondo navy es lo que les da borde.
    expect(several.option?.backgroundColor).toBe(CHART_STAGE.sky);
    expect(several.option?.legend?.textStyle?.color).toBe(CHART_STAGE.inkMuted);
    expect(several.option?.tooltip?.backgroundColor).toBe(CHART_STAGE.panel);
    // Un año es una línea sola, y el suelo no va y viene con las marcas: la misma escala del
    // escenario, por ranura.
    expect(one.option?.backgroundColor).toBe(CHART_STAGE.sky);
    expect(CHART_STAGE_PALETTE).toContain(one.option?.series[0].lineStyle?.color);
    // Y ninguna otra tarjeta del módulo hereda el escenario por omisión.
    expect(growth.option?.backgroundColor).toBeUndefined();
  });

  it("las tres «vs» toman cuerpo sólido con los MISMOS dos importes, el numerador delante", () => {
    const entrada = input(loadedYears());
    const [descriptor] = RATIO_DESCRIPTORS;
    const plano = buildRatioCard(descriptor, entrada);
    const solido = buildRatioCard(descriptor, entrada, "solido");
    if (solido.option === null || !is3DOption(solido.option)) {
      throw new Error("se esperaba el cuerpo sólido");
    }
    const barras = bar3DSeries(solido.option);

    // El numerador va DELANTE, y no es preferencia: un numerador es una PARTE de su denominador, así
    // que nunca es el más alto de los dos y delante es el único sitio donde no lo tapa.
    expect(barras.map((serie) => serie.id)).toEqual([descriptor.numerator, descriptor.denominator]);
    // El mismo eje y la misma tabla: es un cuerpo del mismo dato, no una segunda lectura.
    const ejeX = plano.option?.xAxis;
    expect(solido.option.xAxis3D.data).toEqual((Array.isArray(ejeX) ? ejeX[0] : ejeX)?.data);
    expect(solido.table).toEqual(plano.table);
  });

  it("por omisión vienen PLANAS, que es lo que el informe y el Excel pueden imprimir", () => {
    const entrada = input(loadedYears());
    for (const descriptor of RATIO_DESCRIPTORS) {
      const card = buildRatioCard(descriptor, entrada);
      expect(card.option !== null && is3DOption(card.option)).toBe(false);
      // Y el guardián compartido las deja pasar sin lanzar, que es su contrato.
      expect(() => flatOnly(card)).not.toThrow();
    }
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

describe("el crecimiento se lee contra la LÍNEA DE CERO, con su cifra encima", () => {
  it("cada barra escribe su variación CON SIGNO, y cada año base en su propia fila", () => {
    // Un mes mete una barra por año base en una sola ranura, así que medida contra UNA franja la
    // cifra no cabría; medida contra tantas franjas como series, cada fila lleva una cifra por
    // COLUMNA, que es la densidad a la que ya escribe la tarjeta anual.
    const card = buildGrowthCard(input(loadedYears(), { months: [0, 1, 2] }), "dolares");
    const series = card.option?.series ?? [];

    expect(series.length).toBeGreaterThan(1);
    expect(series.every((serie) => serie.label?.show === true)).toBe(true);
    // Una fila por serie: la distancia crece con el índice y no se repite.
    const rows = series.map((serie) => serie.label?.distance ?? 0);
    expect(new Set(rows).size).toBe(rows.length);
    // Y la cifra lleva el signo, que es lo que se lee de una variación.
    const wrote = series[0].label?.formatter?.({
      value: 155_079.71,
      name: "Ene",
      dataIndex: 0,
    } as never);
    expect(wrote?.startsWith("+")).toBe(true);
  });

  it("una caída escribe su cifra DEBAJO de la barra, no sobre la línea de cero", () => {
    // El rect de una barra que cae va de cero hacia abajo, así que su borde «top» ES la línea de
    // cero: todas las negativas aparcarían su cifra sobre el eje, una encima de otra. `position` no
    // acepta función, así que el lado se resuelve por DATO.
    // Un año de referencia MÁS BAJO que su base: es la única forma de que haya caídas que colocar.
    const card = buildGrowthCard(
      input([yearInput(2024, REVENUE_2026), yearInput(2026, REVENUE_2022)], { months: [0, 1, 2] }),
      "dolares",
    );
    const data = card.option?.series.flatMap((serie) => serie.data) ?? [];
    const negatives = data.filter(
      (datum) => typeof datum === "object" && datum !== null && (datum.value ?? 0) < 0,
    );
    const positives = data.filter(
      (datum) => typeof datum === "object" && datum !== null && (datum.value ?? 0) > 0,
    );

    expect(negatives.length).toBeGreaterThan(0);
    for (const datum of negatives) {
      expect((datum as { label?: { position?: string } }).label?.position).toBe("bottom");
    }
    // Y la positiva no declara nada: se queda con el «top» de la serie.
    for (const datum of positives) {
      expect((datum as { label?: { position?: string } }).label).toBeUndefined();
    }
  });

  it("las filas escritas se pagan en ALTO, no a costa del dibujo", () => {
    const card = buildGrowthCard(input(loadedYears(), { months: [0, 1, 2] }), "dolares");

    // La rejilla reserva las filas —sin eso la de arriba sale cortada contra el borde— y la tarjeta
    // crece lo mismo, en vez de dejar las barras un tercio más cortas.
    expect(card.option?.grid?.top).toBeGreaterThan(16);
    expect(card.height).toBeGreaterThan(280);
  });

  it("las cifras con signo siguen enteras en la tabla, en las DOS unidades", () => {
    const card = buildGrowthCard(input(loadedYears()), "dolares");

    expect(card.table.columns).toContain("vs 2024 · Δ $");
    expect(card.table.columns).toContain("vs 2024 · Δ %");
    expect(card.table.rows.at(-1)?.values.some((value) => String(value).startsWith("+"))).toBe(
      true,
    );
  });

  it("la línea de cero se dibuja UNA vez, no una por serie", () => {
    const card = buildGrowthCard(input(loadedYears()), "dolares");
    const withLine = card.option?.series.filter((serie) => serie.markLine !== undefined);

    expect(withLine).toHaveLength(1);
    expect(withLine?.[0].markLine?.data).toEqual([{ yAxis: 0 }]);
  });

  it("las barras de un mismo mes NO se tocan: el hueco es lo que dice que son varias", () => {
    // El defecto de ECharts por omisión es `'10%'` del ancho de la barra, y estas tarjetas topan el
    // ancho: lo que sobra se va al hueco ENTRE CATEGORÍAS, no entre las barras, así que los rellenos
    // salen pegados y se leen como un bloque apilado — lo contrario de lo que dice un agrupado.
    const card = buildGrowthCard(input(loadedYears(), { months: [0, 1, 2] }), "dolares");

    expect(card.option?.series.length).toBeGreaterThan(1);
    for (const serie of card.option?.series ?? []) {
      expect(serie.barGap).toBe("30%");
    }
  });

  it("con UN solo mes compartido el eje son los AÑOS BASE, y las barras se reparten a lo ancho", () => {
    // El mes no distingue nada cuando es uno solo: es un rótulo debajo de todo, y las series se
    // apilan en UNA ranura topadas a 30 px, como una isla en medio del gráfico. Lo que sí varía es
    // el año base, así que toma el eje y cada barra recibe su propia categoría.
    const uno = buildGrowthCard(input(loadedYears(), { months: [0] }), "dolares");
    const varios = buildGrowthCard(input(loadedYears(), { months: [0, 1, 2] }), "dolares");

    expect(uno.option?.xAxis.data?.[0]).toMatch(/^vs \d{4}$/);
    expect(uno.option?.series).toHaveLength(1);
    // La leyenda se va con ellas: nombrar «vs 2018» debajo de la barra y otra vez en un cuadrito es
    // la leyenda diciendo lo que ya dijo el eje.
    expect(uno.option?.legend?.show).toBe(false);
    // Y la línea de cero sigue ahí, que es donde se lee el signo.
    expect(uno.option?.series[0].markLine?.data).toEqual([{ yAxis: 0 }]);
    // Con dos meses o más nada de esto pasa: el mes vuelve al eje y los años a las series.
    expect(varios.option?.xAxis.data).toEqual(["Ene", "Feb", "Mar"]);
    expect(varios.option?.series.length).toBeGreaterThan(1);
  });

  it("con los años en el eje, cada barra lleva SU color y el mes se nombra en el tooltip", () => {
    const uno = buildGrowthCard(input(loadedYears(), { months: [0] }), "dolares");
    const varios = buildGrowthCard(input(loadedYears(), { months: [0, 1, 2] }), "dolares");
    const fills = (uno.option?.series[0].data ?? []).map((datum) =>
      typeof datum === "object" && datum !== null ? datum.itemStyle?.color : undefined,
    );

    // El color sigue al AÑO BASE y nunca al signo: es el mismo tono que ese año lleva cuando es una
    // serie, solo que ahora su nombre está en el eje.
    expect(fills).toEqual(varios.option?.series.map((serie) => serie.itemStyle?.color));
    // Y el mes, que ya no está en el eje, se nombra en la cabecera del tooltip.
    const head = uno.option?.tooltip?.formatter?.([
      { name: "vs 2018", value: 100, dataIndex: 0, seriesName: "Variación" },
    ] as never);
    expect(head).toContain("vs 2018 · Enero");
  });

  it("con pocos meses las barras se ensanchan en vez de quedarse perdidas", () => {
    const narrow = buildGrowthCard(input(loadedYears(), { months: [1, 2, 3] }), "dolares");
    const wide = buildGrowthCard(input(loadedYears()), "dolares");
    const columnas = (card: typeof narrow) => card.option?.xAxis.data?.length ?? 0;

    // El ancho no es un número escrito aquí: sale de cuántas columnas se reparten el gráfico y
    // cuántas barras se reparten la columna, que es lo que `fitBarWidth` responde una sola vez para
    // toda la app. Pocas columnas, más ancho; muchas, menos.
    expect(narrow.option?.series[0].barMaxWidth).toBe(
      fitBarWidth(columnas(narrow), narrow.option?.series.length ?? 1),
    );
    expect(wide.option?.series[0].barMaxWidth).toBe(
      fitBarWidth(columnas(wide), wide.option?.series.length ?? 1),
    );
    expect(narrow.option?.series[0].barMaxWidth).toBeGreaterThan(
      wide.option?.series[0].barMaxWidth ?? 0,
    );
  });

  it("con VARIOS años base la línea de cero sigue dibujándose UNA sola vez", () => {
    const card = buildGrowthCard(input(loadedYears(), { months: [0, 1, 2] }), "dolares");

    expect(card.option?.series.length).toBeGreaterThan(1);
    expect(card.option?.series[0].markLine?.data).toEqual([{ yAxis: 0 }]);
    expect(card.option?.series.filter((serie) => serie.markLine !== undefined)).toHaveLength(1);
  });

  it("pasados TRES meses las cifras se van al cursor: la rejilla no gasta margen en alojarlas", () => {
    // Las filas hacen que quepan a cualquier densidad, pero caber no es leerse: siete meses por
    // cinco años base son treinta y cinco importes, y quien tiene que recorrer esa cuadrícula para
    // encontrar uno va más lento que quien pasa el cursor por el mes.
    const tres = buildGrowthCard(input(loadedYears(), { months: [0, 1, 2] }), "dolares");
    const doce = buildGrowthCard(input(loadedYears()), "dolares");

    expect(tres.option?.xAxis.data).toHaveLength(3);
    expect(tres.option?.series.every((serie) => serie.label?.show === true)).toBe(true);
    expect((doce.option?.xAxis.data?.length ?? 0) > 3).toBe(true);
    expect(doce.option?.series.every((serie) => serie.label === undefined)).toBe(true);
    // Y sin cifras escritas la tarjeta vuelve a su alto y el dibujo se queda con toda la caja.
    expect(doce.option?.grid?.top).toBe(16);
    expect(doce.height).toBe(280);
    expect(tres.height).toBeGreaterThan(280);
  });

  it("el eje de AÑOS BASE escribe siempre: un mes, una barra por columna y banda entera", () => {
    const uno = buildGrowthCard(input(loadedYears(), { months: [0] }), "dolares");

    expect(uno.option?.series).toHaveLength(1);
    expect(uno.option?.series[0].label?.show).toBe(true);
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
  const publicidad = RATIO_DESCRIPTORS[2];
  const comision = RATIO_DESCRIPTORS[1];

  it("una sigla sobrevive dentro de la frase", () => {
    // `.toLowerCase()` no distingue una sigla: «Comisiones TC» salía «comisiones tc».
    const card = buildRatioCard(
      comision,
      input([yearInput(2024, REVENUE_2024), yearInput(2026, REVENUE_2026)]),
    );

    expect(card.note).toContain("las comisiones TC");
    expect(card.note).not.toContain("comisiones tc");
  });

  it("la nota de años sin registrar concuerda con su sujeto", () => {
    const several = buildRatioCard(publicidad, input(loadedYears()));
    const one = buildRatioCard(
      publicidad,
      input([yearInput(2022, REVENUE_2022), yearInput(2026, REVENUE_2026)]),
    );

    // El verbo concuerda con los AÑOS, que es lo que se cuenta; un participio tendría que concordar
    // además con el género de la serie, y «la publicidad» es femenina y singular.
    expect(several.note).toContain("están marcados y no registran la publicidad");
    expect(one.note).toContain("está marcado y no registra la publicidad");
    expect(several.note).not.toContain("registrado");
  });
});

describe("un año sin nada registrado lo dice, no finge un tramo", () => {
  it("el subtítulo nombra la ausencia en vez de componer «Sin meses 2026»", () => {
    const card = buildRatioCard(RATIO_DESCRIPTORS[0], input([yearInput(2024, REVENUE_2024)]));

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
    const card = flatAnnual(input(loadedYears()), "total");

    expect(card.option?.xAxis.data).toEqual(["2022", "2023", "2024", "2026"]);
    expect(card.option?.series).toHaveLength(1);
    expect(card.option?.series[0].data).toHaveLength(4);
  });

  it("«Ver como» cambia la CIFRA sobre el mismo eje, nunca añade un segundo", () => {
    const total = flatAnnual(input(loadedYears()), "total");
    const average = flatAnnual(input(loadedYears()), "promedio");

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
    const card = flatAnnual(input(loadedYears()), "total");

    expect(card.table.columns).toEqual(["Total", "Promedio mensual", "Meses cargados"]);
    expect(card.table.rows.map((row) => row.label)).toEqual(["2022", "2023", "2024", "2026"]);
    expect(card.table.rows[3].values[2]).toBe("7 meses");
  });

  it("un año a medias se explica: la barra es corta por el calendario, no por el negocio", () => {
    const card = flatAnnual(input(loadedYears()), "total");

    expect(card.note).toContain("2026 llega hasta julio");
    expect(card.note).toContain("Promedio mensual");
  });

  it("un año sin ningún mes cargado no dibuja y lleva raya", () => {
    const card = flatAnnual(
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
    );

    expect(card.subtitle).toBe("Ene–Jun 2026 · qué parte de la venta se cobró con tarjeta");
    // Julio queda FUERA del span, así que no es un mes «que falta registrar»: no existe aquí.
    expect(card.note).toBeUndefined();
  });
});

describe("«Ventas por año» toma cuerpo sólido; el crecimiento no", () => {
  /** El cuerpo sólido de una tarjeta, ya estrechado: si llega plano es que el «Ver como» no llegó. */
  function solidOf(card: { option: unknown }) {
    const option = card.option as Parameters<typeof is3DOption>[0] | null;
    if (option === null || !is3DOption(option)) {
      throw new Error("se esperaba el cuerpo sólido");
    }
    return option;
  }

  it("«Ventas por año» se levanta con las MISMAS cifras y un color por año", () => {
    const entrada = input(loadedYears());
    const plano = flatAnnual(entrada, "total");
    const solido = solidOf(buildAnnualCard(entrada, "total", "solido"));
    const [barras] = bar3DSeries(solido);

    // Un año es una COLUMNA y no hay nada que poner en el fondo: una sola fila, donde la
    // profundidad es el grosor de la barra.
    expect(bar3DSeries(solido)).toHaveLength(1);
    expect(solido.xAxis3D.data).toEqual(plano.option?.xAxis.data);
    // La misma cifra, en el mismo orden: es un cuerpo de la misma lectura, no una segunda.
    expect(barras.data.map((datum) => datum.value[2])).toEqual(
      plano.option?.series[0].data.map((datum) =>
        typeof datum === "object" && datum !== null ? datum.value : datum,
      ),
    );
    // El color es la IDENTIDAD del año, traducida al escenario por ranura: el mismo 2024 de la
    // línea del comparativo y de la fila del skyline.
    const fills = barras.data.map(
      (datum) => (datum as { itemStyle?: { color?: string } }).itemStyle?.color,
    );
    const flatFills = plano.option?.series[0].data.map((datum) =>
      typeof datum === "object" && datum !== null ? datum.itemStyle?.color : undefined,
    );
    expect(fills).toEqual(flatFills?.map((color) => stageColor(color ?? "")));
    expect(new Set(fills).size).toBe(fills.length);
    // Y la tabla no se mueve: lleva el total, el promedio y los meses cargados en cualquier cuerpo.
    expect(solidOf(buildAnnualCard(entrada, "total", "solido"))).toBeDefined();
    expect(buildAnnualCard(entrada, "total", "solido").table).toEqual(plano.table);
    expect(buildAnnualCard(entrada, "total", "solido").note).toContain(
      "Arrastra para girar la vista.",
    );
  });

  it("«Cifra» sigue eligiendo qué se levanta: el promedio no es el total", () => {
    const entrada = input(loadedYears());
    const total = bar3DSeries(solidOf(buildAnnualCard(entrada, "total", "solido")))[0];
    const promedio = bar3DSeries(solidOf(buildAnnualCard(entrada, "promedio", "solido")))[0];

    expect(total.name).toBe("Total del tramo");
    expect(promedio.name).toBe("Promedio mensual");
    expect(promedio.data[0].value[2]).toBeLessThan(total.data[0].value[2]);
  });

  it("por omisión viene PLANA, que es lo que el informe y el Excel imprimen", () => {
    const entrada = input(loadedYears());

    // Y la guarda compartida la deja pasar sin lanzar, que es su contrato.
    expect(() => flatOnly(buildAnnualCard(entrada, "total"))).not.toThrow();
  });

  it("el CRECIMIENTO no ofrece cuerpo sólido: una variación se lee contra la línea de cero", () => {
    // `zeroLine` es un `markLine` y `echarts-gl` no tiene ninguno, así que en el escenario esa línea
    // se vuelve un suelo que hay que deducir de dónde arrancan los sólidos, con la base de cada uno
    // tapada por el de delante. La forma que lleva la lectura es la plana, y es la única.
    const card = buildGrowthCard(input(loadedYears()), "dolares");

    expect(card.option !== null && is3DOption(card.option)).toBe(false);
  });

  it("sin nada que dibujar no hay cuerpo que ofrecer", () => {
    // Un año sin ningún mes cargado no levanta una barra de cero.
    const sinMeses = input([yearInput(2026, emptyMonthSeries())]);

    expect(buildAnnualCard(sinMeses, "total", "solido").option).toBeNull();
  });
});
