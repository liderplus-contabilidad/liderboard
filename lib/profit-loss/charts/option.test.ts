import { describe, expect, it } from "vitest";
import {
  CHART_INK,
  CHART_LINES,
  CHART_MARK,
  CHART_PALETTE,
  CHART_SECTION,
  CHART_SIGN,
} from "@/lib/charts/palette";
import type { ChartBarDatum, ChartOption, ChartParam, ChartPieDatum } from "@/lib/charts/types";
import { formatCurrency } from "@/lib/format";
import { CULTURA_MANOR_SOURCE, makeSeries } from "../analytics/fixtures";
import { periodsForYear } from "../analytics/period";
import { buildSeries } from "../analytics/series";
import { toPieSlices, toPareto, type AmountEntry } from "../analytics/structure";
import { distributionShares } from "./distribution";
import type { Series, SeriesKey } from "../analytics/types";
import {
  barOption,
  categoryBarOption,
  formatAxisValue,
  formatChartValue,
  comboOption,
  entryTable,
  horizontalBarOption,
  hundredPercentOption,
  hundredPercentSeries,
  lineOption,
  paretoOption,
  pieOption,
  seriesOptionFor,
  seriesTable,
  seriesTableFor,
  signColorOf,
  stackedOption,
  stackedTotalOption,
  stackedTotalTable,
  variationBarOption,
  waterfallOption,
  waterfallTable,
  shareOfTotalOption,
  verticalBarOption,
  shareOfTotalTable,
} from "./option";
import { RESULT_CODE, type WaterfallStep } from "./waterfall";

const PERIODS = periodsForYear(2026, "mensual");
const CONTEXT = { colorOf: (key: SeriesKey) => slotFor(key.code), periods: PERIODS };
const ENTRY_CONTEXT = { colorOf: (code: string) => slotFor(code) };

/** A deterministic stand-in for `colorResolver`; the color rule itself is tested elsewhere. */
function slotFor(id: string): string {
  let hash = 0;
  for (const char of id) {
    hash += char.charCodeAt(0);
  }
  return CHART_PALETTE[hash % CHART_PALETTE.length];
}

function data(option: ChartOption, index = 0): unknown[] {
  return option.series[index].data;
}

/** Runs the tooltip callback the way the renderer would, with one param per series. */
function tooltipOf(option: ChartOption, params: Partial<ChartParam>[]): string {
  const formatter = option.tooltip?.formatter;
  const full = params.map((param, index) => ({
    name: "Ene",
    dataIndex: 0,
    value: null,
    seriesName: option.series[index]?.name,
    seriesId: option.series[index]?.id,
    marker: "•",
    ...param,
  })) as ChartParam[];
  return formatter ? formatter(full) : "";
}

describe("los periodos sin cobertura no se dibujan", () => {
  it("keeps a null as a null so no mark is drawn and no line interpolates it", () => {
    const [series] = buildSeries([CULTURA_MANOR_SOURCE], {
      codes: ["4.1.1.1.1.1"],
      centerIds: ["cultura-manor"],
      years: [2026],
      frequency: "mensual",
    }).series;

    // The file reaches July; Aug–Dec must reach the renderer as null, never as 0.
    expect(data(barOption([series], CONTEXT))).toEqual([
      17338,
      17338,
      17338,
      17338,
      17338,
      17338,
      17338,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(data(lineOption([series], CONTEXT))).toEqual(data(barOption([series], CONTEXT)));
  });

  it("draws a real zero as a zero", () => {
    const [series] = buildSeries([CULTURA_MANOR_SOURCE], {
      codes: ["4.1.1.3"],
      centerIds: ["cultura-manor"],
      years: [2026],
      frequency: "mensual",
    }).series;

    // Ventas Eventos books nothing in February inside a covered stretch: a genuine 0.
    expect(data(barOption([series], CONTEXT))[1]).toBe(0);
    expect(data(barOption([series], CONTEXT))[7]).toBeNull();
  });

  it("prints no value on the direct label of an uncovered period", () => {
    const series = makeSeries([1000, null]);
    const label = barOption([series], CONTEXT).series[0].label;

    expect(label?.formatter?.({ value: null, name: "Feb", dataIndex: 1 })).toBe("");
    expect(label?.formatter?.({ value: 1000, name: "Ene", dataIndex: 0 })).toContain("1,000");
  });
});

describe("tipos de gráfico soportados", () => {
  it("takes the 100% stack denominator from the engine's container, not the visible series", () => {
    // Three of a parent's children: their shares must fall short of 100 on purpose.
    const children = [
      makeSeries([200], { code: "4.1.1.2", container: [1000] }),
      makeSeries([100], { code: "4.1.1.3", container: [1000] }),
      makeSeries([50], { code: "4.1.1.5", container: [1000] }),
    ];
    const option = hundredPercentOption(children, { ...CONTEXT, periods: PERIODS.slice(0, 1) });
    const january = option.series.map((series) => series.data[0] as number);

    expect(january).toEqual([20, 10, 5]);
    expect(january.reduce((sum, value) => sum + value, 0)).toBe(35);
    expect(option.series.every((series) => series.stack === "total")).toBe(true);
    expect(option.yAxis?.max).toBe(100);
  });

  it("leaves the negative account out of the pie and reports why", () => {
    const entries: AmountEntry[] = [
      { code: "4.1.1.1.1.1", label: "Ventas Habitaciones", value: 17338 },
      { code: "4.1.1.2", label: "Ventas Restaurante", value: 6500 },
      { code: "4.1.4", label: "Rebaja y/o Descuentos sobre Ventas", value: -507 },
    ];
    const result = toPieSlices(entries);
    const option = pieOption(result, ENTRY_CONTEXT);
    const slices = option.series[0].data as ChartPieDatum[];

    expect(slices.map((slice) => slice.id)).not.toContain("4.1.4");
    expect(result.excluded).toEqual([{ ...entries[2], reason: "negativo" }]);
  });

  it("es una TARTA y no un anillo: el hueco solo sirve para poner el total, y nadie lo pone", () => {
    const result = toPieSlices([{ code: "4.1.1.2", label: "Restaurante", value: 100 }]);

    expect(pieOption(result, ENTRY_CONTEXT).series[0].radius).toEqual(["0%", "74%"]);
  });

  it("orders horizontal bars from largest to smallest", () => {
    const option = horizontalBarOption(
      [
        { code: "5.1.5.3", label: "Publicidad", value: 2411 },
        { code: "5.1.5.12", label: "Arrendamiento", value: 8000 },
        { code: "5.1.5.7", label: "Mantenimiento", value: 590 },
      ],
      ENTRY_CONTEXT,
    );

    expect(option.yAxis?.data).toEqual(["Arrendamiento", "Publicidad", "Mantenimiento"]);
    expect(option.yAxis?.inverse).toBe(true);
  });

  it("labels each Pareto bar with its cumulative share instead of a second scale", () => {
    const result = toPareto([
      { code: "5.1.5.12", label: "Arrendamiento", value: 8000 },
      { code: "5.1.5.3", label: "Publicidad", value: 1500 },
      { code: "5.1.5.7", label: "Mantenimiento", value: 500 },
    ]);
    const option = paretoOption(result, ENTRY_CONTEXT);
    const label = option.series[0].label;

    expect(option.series).toHaveLength(1);
    expect(label?.show).toBe(true);
    expect(label?.formatter?.({ value: 8000, name: "Arrendamiento", dataIndex: 0 })).toContain(
      "80.0 %",
    );
    expect(option.series[0].markLine?.data[0].yAxis).toBe(0.5);
  });
});

describe("un solo eje por gráfica", () => {
  const series = makeSeries([1000, 1200, 900]);

  it("never declares two Y scales, whatever the builder", () => {
    const built: ChartOption[] = [
      barOption([series], CONTEXT),
      stackedOption([series], CONTEXT),
      hundredPercentOption([makeSeries([200], { container: [1000] })], CONTEXT),
      lineOption([series], CONTEXT),
      comboOption(series, makeSeries([1000, 1050, 1030]), "Media móvil (3)", CONTEXT),
      horizontalBarOption([{ code: "5.1", label: "Gastos", value: 10 }], ENTRY_CONTEXT),
      paretoOption(toPareto([{ code: "5.1", label: "Gastos", value: 10 }]), ENTRY_CONTEXT),
    ];

    for (const option of built) {
      expect(Array.isArray(option.yAxis)).toBe(false);
      expect(Array.isArray(option.xAxis)).toBe(false);
    }
  });

  it("shares the axis between the bars and the line of a combo", () => {
    const option = comboOption(series, makeSeries([1000, 1050, 1030]), "Media móvil (3)", CONTEXT);

    expect(option.series.map((entry) => entry.type)).toEqual(["bar", "line"]);
    expect(option.yAxis?.type).toBe("value");
    // Neither series names an axis of its own: there is only one to name.
    expect(option.series.every((entry) => !("yAxisIndex" in entry))).toBe(true);
  });

  it("shares the axis between the stack and its total line", () => {
    const total = makeSeries([2100, 2250, 1900], { code: "4.1", label: "Ventas" });
    const option = stackedTotalOption([series, makeSeries([1100, 1050, 1000])], total, CONTEXT);

    expect(option.series.map((entry) => entry.type)).toEqual(["bar", "bar", "line"]);
    expect(option.series.slice(0, 2).every((entry) => entry.stack === "total")).toBe(true);
    expect(Array.isArray(option.yAxis)).toBe(false);
    // The line is a reading of the same entity, not a second one: ink, never a slot.
    expect(option.series[2].lineStyle?.color).toBe(CHART_INK.strong);
    expect(CHART_PALETTE).not.toContain(option.series[2].lineStyle?.color);
  });

  /** The stack as the card draws it: its children, its total and the split between the two. */
  function distributionOf(children: Series[], total: Series, periods = PERIODS): ChartOption {
    const shares = distributionShares(children, total, "Ventas");
    return stackedTotalOption(children, total, {
      ...CONTEXT,
      periods,
      shares: new Map(shares.map((share) => [share.seriesId, share])),
    });
  }

  it("cada segmento imprime su porcentaje y la línea el monto", () => {
    const year = (value: number) => Array.from({ length: 12 }, () => value);
    const mayor = makeSeries(year(1500), { code: "4.1.1", label: "Alojamiento" });
    const menor = makeSeries(year(500), { code: "4.1.8", label: "Otros ingresos" });
    const option = distributionOf(
      [mayor, menor],
      makeSeries(year(2000), { code: "4.1", label: "Ventas" }),
    );

    // Twelve columns do not admit an amount per segment, but they do admit the percentage: it is
    // shorter and it is the reading the stack adds. The column's amount is declared by the line, just
    // once.
    expect(option.series[0].label?.formatter?.({ value: 1500, name: "Ene", dataIndex: 0 })).toBe(
      "{share|75.0 %}",
    );
    expect(option.series[1].label?.formatter?.({ value: 500, name: "Ene", dataIndex: 0 })).toBe(
      "{share|25.0 %}",
    );
    expect(option.series[2].label?.formatter?.({ value: 2000, name: "Ene", dataIndex: 0 })).toBe(
      formatCurrency(2000, { cents: true }),
    );
  });

  it("con el eje despejado el segmento lleva las dos cifras, monto y porcentaje", () => {
    const option = distributionOf(
      [
        makeSeries([1500], { code: "4.1.1", label: "Alojamiento" }),
        makeSeries([500], { code: "4.1.8", label: "Otros ingresos" }),
      ],
      makeSeries([2000], { code: "4.1", label: "Ventas" }),
      PERIODS.slice(0, 1),
    );

    expect(option.series[0].label?.formatter?.({ value: 1500, name: "Ene", dataIndex: 0 })).toBe(
      `${formatCurrency(1500, { cents: true })}\n{share|75.0 %}`,
    );
  });

  it("un segmento demasiado fino para su número no lo imprime, pero el tooltip sí lo dice", () => {
    const year = (value: number) => Array.from({ length: 12 }, () => value);
    const option = distributionOf(
      [
        makeSeries(year(1960), { code: "4.1.1", label: "Alojamiento" }),
        makeSeries(year(40), { code: "4.1.8", label: "Otros ingresos" }),
      ],
      makeSeries(year(2000), { code: "4.1", label: "Ventas" }),
    );

    // 2 % does not fit inside its own piece: it switches off instead of overflowing it…
    expect(option.series[1].label?.formatter?.({ value: 40, name: "Ene", dataIndex: 0 })).toBe("");
    // …and the tooltip, where width is plentiful, says it while also naming the base.
    expect(
      tooltipOf(option, [
        { value: 1960, seriesId: "4.1.1|cultura-manor|2026" },
        { value: 40, seriesId: "4.1.8|cultura-manor|2026" },
        { value: 2000, seriesId: "4.1|cultura-manor|2026|total" },
      ]),
    ).toContain("2.0 % de Ventas");
  });

  it("apila sin costuras cuando la columna ya lleva su total encima", () => {
    const total = makeSeries([2100, 2250, 1900], { code: "4.1", label: "Ventas" });
    const option = stackedTotalOption([series, makeSeries([1100, 1050, 1000])], total, CONTEXT);

    // At eight segments the seams split the bar into loose pieces; here the colour separates them.
    expect(option.series[0].itemStyle?.borderWidth).toBeUndefined();
    // And the stack WITHOUT a total keeps them: there is nothing there declaring the column as one.
    expect(stackedOption([series], CONTEXT).series[0].itemStyle?.borderWidth).toBe(CHART_MARK.gap);
  });

  it("la tabla gemela cierra con el total, separado por su peso y no por su sitio", () => {
    const total = makeSeries([2100, 2250, 1900], { code: "4.1", label: "Ventas" });
    const table = stackedTotalTable([series], total, CONTEXT);

    expect(table.rows.map((row) => row.emphasis)).toEqual([undefined, true]);
    expect(table.rows.at(-1)?.label).toBe("Ventas");
    expect(table.rows.at(-1)?.color).toBe(CHART_INK.strong);
  });

  it("paints the combo overlay in ink, not in a palette slot", () => {
    const option = comboOption(series, makeSeries([1000]), "Media móvil (3)", CONTEXT);

    expect(option.series[1].lineStyle?.color).toBe(CHART_INK.strong);
    expect(CHART_PALETTE).not.toContain(option.series[1].lineStyle?.color);
  });
});

describe("marcas, leyenda y etiquetas", () => {
  function manySeries(count: number): Series[] {
    return Array.from({ length: count }, (_, index) =>
      makeSeries([100 + index], { code: `4.1.1.${index}`, label: `Cuenta ${index}` }),
    );
  }

  it("draws no legend box for a single series", () => {
    expect(barOption(manySeries(1), CONTEXT).legend?.show).toBe(false);
    expect(barOption(manySeries(2), CONTEXT).legend?.show).toBe(true);
  });

  it("gives eight series a legend and no number per point", () => {
    const option = barOption(manySeries(8), CONTEXT);

    expect(option.legend?.show).toBe(true);
    expect(option.series.every((series) => series.label?.show === false)).toBe(true);
  });

  it("keeps direct labels up to four series", () => {
    expect(barOption(manySeries(4), CONTEXT).series.every((s) => s.label?.show)).toBe(true);
    expect(barOption(manySeries(5), CONTEXT).series.every((s) => s.label?.show === false)).toBe(
      true,
    );
  });

  it("drops a label that does not fit instead of clipping it", () => {
    const option = stackedOption(manySeries(3), CONTEXT);

    expect(option.series.every((series) => series.labelLayout?.hideOverlap)).toBe(true);
  });

  it("keeps the grid continuous and recessive, never dotted", () => {
    const option = barOption(manySeries(2), CONTEXT);

    expect(option.yAxis?.splitLine?.lineStyle).toMatchObject({
      type: "solid",
      color: CHART_LINES.grid,
    });
    expect(option.xAxis?.splitLine?.show).toBe(false);
    expect(option.xAxis?.axisLine?.lineStyle?.type).toBe("solid");
  });

  it("separates contiguous fills with 2px of the surface, and leaves one series alone", () => {
    expect(barOption(manySeries(3), CONTEXT).series[0].itemStyle?.borderWidth).toBe(CHART_MARK.gap);
    expect(stackedOption(manySeries(2), CONTEXT).series[0].itemStyle?.borderWidth).toBe(
      CHART_MARK.gap,
    );
    expect(barOption(manySeries(1), CONTEXT).series[0].itemStyle?.borderWidth).toBeUndefined();
  });

  it("writes every text in ink and never in the color of its series", () => {
    const option = barOption(manySeries(2), CONTEXT);
    const inks: string[] = [...Object.values(CHART_INK)];

    for (const series of option.series) {
      expect(inks).toContain(series.label?.color);
      expect(CHART_PALETTE).not.toContain(series.label?.color);
      expect(series.label?.color).not.toBe(series.itemStyle?.color);
    }
    expect(inks).toContain(option.xAxis?.axisLabel?.color);
    expect(inks).toContain(option.yAxis?.axisLabel?.color);
    expect(inks).toContain(option.legend?.textStyle?.color);
  });

  it("formats the axis with formatCurrency and the periods with periodLabel", () => {
    const option = barOption(manySeries(1), CONTEXT);

    expect(option.yAxis?.axisLabel?.formatter?.(17338)).toBe("$17,338");
    expect(option.xAxis?.data?.slice(0, 3)).toEqual(["Ene", "Feb", "Mar"]);
  });

  it("labels a percentage axis as a percentage and an index as a plain number", () => {
    const share = hundredPercentOption([makeSeries([20], { container: [100] })], CONTEXT);
    const index = lineOption([makeSeries([120])], { ...CONTEXT, unit: "indice" });

    expect(share.yAxis?.axisLabel?.formatter?.(20)).toBe("20.0 %");
    expect(index.yAxis?.axisLabel?.formatter?.(120)).toBe("120");
  });
});

describe("el porcentaje dentro de la cuenta que la contiene", () => {
  const PARENT_ID = `4|cultura-manor|2026`;
  const CHILD_ID = `4.1|cultura-manor|2026`;

  /** Parent and child, with as many periods as the case asks for. */
  function pair(points: number): Series[] {
    const values = (amount: number) => Array.from({ length: points }, () => amount);
    return [
      makeSeries(values(25_229), { code: "4", label: "Ingresos" }),
      makeSeries(values(7_161), { code: "4.1", label: "Ventas" }),
    ];
  }

  function sharesOf(values: (number | null)[]) {
    return new Map([
      [CHILD_ID, { seriesId: CHILD_ID, label: "Ventas", baseLabel: "Ingresos", values }],
    ]);
  }

  function labelOf(option: ChartOption, index: number, dataIndex = 0): string {
    const label = option.series[index].label;
    const value = (option.series[index].data[dataIndex] ?? null) as number | null;
    return label?.show ? (label.formatter?.({ value, name: "Ene", dataIndex }) ?? "") : "";
  }

  it("pone el porcentaje bajo el monto de la hija y deja al padre con su monto", () => {
    const option = barOption(pair(3), { ...CONTEXT, shares: sharesOf([28.4, 29.1, 27.8]) });

    expect(labelOf(option, 0)).toBe("$25,229.00");
    expect(labelOf(option, 1)).toBe("$7,161.00\n{share|28.4 %}");
  });

  it("apaga el monto pero conserva el porcentaje cuando el eje se aprieta", () => {
    // Two series over twelve months are 24 marks and no amount fits; only the child carries the
    // percentage, so there are 12 and they do fit. It is the reading that was asked for, and it
    // survives more density.
    const option = barOption(pair(12), { ...CONTEXT, shares: sharesOf(Array(12).fill(28.4)) });

    expect(option.series[0].label?.show).toBe(false);
    expect(labelOf(option, 1)).toBe("{share|28.4 %}");
  });

  it("deja el monto solo cuando el porcentaje de ese periodo no se pudo calcular", () => {
    const option = barOption(pair(3), { ...CONTEXT, shares: sharesOf([28.4, null, 27.8]) });

    expect(labelOf(option, 1, 1)).toBe("$7,161.00");
  });

  it("escribe el porcentaje en tinta más tenue y nunca en el color de la serie", () => {
    const option = barOption(pair(3), { ...CONTEXT, shares: sharesOf([28.4, 29.1, 27.8]) });
    const rich = option.series[1].label?.rich?.share;

    expect(rich?.color).toBe(CHART_INK.muted);
    expect(rich?.color).not.toBe(option.series[1].itemStyle?.color);
    expect(option.series[0].label?.rich).toBeUndefined();
  });

  it("nombra la base en el tooltip, donde sí hay sitio para decirlo", () => {
    const option = barOption(pair(12), { ...CONTEXT, shares: sharesOf(Array(12).fill(28.4)) });
    const rows = tooltipOf(option, [
      { seriesId: PARENT_ID, value: 25_229 },
      { seriesId: CHILD_ID, value: 7_161 },
    ]);

    expect(rows).toContain("Ingresos: $25,229.00<br/>");
    expect(rows).toContain("Ventas: $7,161.00 · 28.4 % de Ingresos");
  });

  it("no cambia ni una etiqueta cuando no hay ningún porcentaje que anotar", () => {
    const plain = barOption(pair(3), CONTEXT);

    expect(labelOf(plain, 1)).toBe("$7,161.00");
    expect(plain.series[1].label?.rich).toBeUndefined();
    expect(tooltipOf(plain, [{ seriesId: CHILD_ID, value: 7_161 }])).not.toContain("%");
  });

  it("no anota un segundo porcentaje sobre unas barras que ya son porcentajes", () => {
    const series = [makeSeries([20], { code: "4.1", container: [100] })];
    const option = hundredPercentOption(series, { ...CONTEXT, shares: sharesOf([28.4]) });

    expect(option.series[0].label?.rich).toBeUndefined();
    expect(labelOf(option, 0)).toBe("20.0 %");
  });
});

describe("el signo de una variación", () => {
  const entries: AmountEntry[] = [
    { code: "5.1.5.3", label: "Publicidad", value: 1200 },
    { code: "5.1.5.7", label: "Mantenimiento", value: -450 },
  ];

  it("uses the sign tokens as the fill, and never as a series color", () => {
    const bars = variationBarOption(entries).series[0].data as { itemStyle: { color: string } }[];

    expect(bars[0].itemStyle.color).toBe(CHART_SIGN.positive);
    expect(bars[1].itemStyle.color).toBe(CHART_SIGN.negative);
    expect(CHART_PALETTE).not.toContain(CHART_SIGN.positive);
    expect(CHART_PALETTE).not.toContain(CHART_SIGN.negative);
  });

  it("carries an arrow and the signed value, so color is not the only cue", () => {
    const label = variationBarOption(entries).series[0].label;

    expect(label?.formatter?.({ value: 1200, name: "Publicidad", dataIndex: 0 })).toBe(
      "▲ $1,200.00",
    );
    expect(label?.formatter?.({ value: -450, name: "Mantenimiento", dataIndex: 1 })).toBe(
      "▼ -$450.00",
    );
  });

  it("colors the table twin by the same sign as its bars", () => {
    const color = signColorOf(entries);

    expect(color("5.1.5.3")).toBe(CHART_SIGN.positive);
    expect(color("5.1.5.7")).toBe(CHART_SIGN.negative);
  });
});

describe("la forma que la transformación admite", () => {
  const series = [
    makeSeries([200, 300], { code: "4.1.1.2", container: [1000, 1000] }),
    makeSeries([100, 150], { code: "4.1.1.3", container: [1000, 1000] }),
  ];
  const context = { ...CONTEXT, periods: PERIODS.slice(0, 2) };

  it("routes each chart type to its builder", () => {
    expect(seriesOptionFor("barras", series, context).series[0].stack).toBeUndefined();
    expect(seriesOptionFor("barras-apiladas", series, context).series[0].stack).toBe("total");
    expect(seriesOptionFor("linea", series, context).series[0].type).toBe("line");
    expect(seriesOptionFor("barras-100", series, context).yAxis?.max).toBe(100);
  });

  it("makes the table twin of a 100% stack show shares, not amounts", () => {
    expect(seriesTableFor("barras-100", series, context).rows[0].values).toEqual([
      "20.0 %",
      "30.0 %",
    ]);
    expect(seriesTableFor("barras", series, context).rows[0].values).toEqual([
      "$200.00",
      "$300.00",
    ]);
  });
});

describe("la gemela en tabla", () => {
  it("puts one row per series and one column per period", () => {
    const series = [
      makeSeries([1000, 1200], { code: "4.1.1.2", label: "Ventas Restaurante" }),
      makeSeries([500, 600], { code: "4.1.1.3", label: "Ventas Eventos" }),
    ];
    const table = seriesTable(series, { ...CONTEXT, periods: PERIODS.slice(0, 2) });

    expect(table.columns).toEqual(["Ene", "Feb"]);
    expect(table.rows.map((row) => row.label)).toEqual(["Ventas Restaurante", "Ventas Eventos"]);
    expect(table.rows[0].values).toEqual(["$1,000.00", "$1,200.00"]);
    expect(table.rows[0].id).toBe("4.1.1.2|cultura-manor|2026");
  });

  it("leaves an uncovered period empty instead of showing a zero", () => {
    const table = seriesTable([makeSeries([1000, null])], {
      ...CONTEXT,
      periods: PERIODS.slice(0, 2),
    });

    expect(table.rows[0].values).toEqual(["$1,000.00", null]);
  });

  it("shows the transformation, not the amounts behind it", () => {
    const children = [makeSeries([200], { code: "4.1.1.2", container: [1000] })];
    const shares = hundredPercentSeries(children);
    const table = seriesTable(shares, {
      ...CONTEXT,
      periods: PERIODS.slice(0, 1),
      unit: "porcentaje",
    });

    expect(table.rows[0].values).toEqual(["20.0 %"]);
  });

  it("ranks the entries of an entry-based card largest first", () => {
    const table = entryTable(
      [
        { code: "5.1.5.3", label: "Publicidad", value: 2411 },
        { code: "5.1.5.12", label: "Arrendamiento", value: 8000 },
      ],
      ENTRY_CONTEXT,
    );

    expect(table.columns).toEqual(["Monto"]);
    expect(table.rows.map((row) => row.label)).toEqual(["Arrendamiento", "Publicidad"]);
  });
});

describe("interacción de la gráfica", () => {
  const series = [
    makeSeries([1000, null], { code: "4.1.1.2", label: "Ventas Restaurante" }),
    makeSeries([500, null], { code: "4.1.1.3", label: "Ventas Eventos" }),
  ];

  it("names the series, the period and the formatted amount", () => {
    const option = barOption(series, CONTEXT);
    const html = tooltipOf(option, [{ value: 1000 }, { value: 500 }]);

    expect(html).toContain("Ene");
    expect(html).toContain("Ventas Restaurante");
    expect(html).toContain("$1,000");
    expect(html).toContain("$500");
  });

  it("omits an uncovered series rather than reporting it as $0", () => {
    const option = barOption(series, CONTEXT);
    const html = tooltipOf(option, [
      { value: 1000, name: "Ago" },
      { value: null, name: "Ago" },
    ]);

    expect(html).toContain("Ventas Restaurante");
    expect(html).not.toContain("Ventas Eventos");
    expect(html).not.toContain("$0");
  });

  it("renders nothing when no series covered the period", () => {
    const option = barOption(series, CONTEXT);

    expect(tooltipOf(option, [{ value: null }, { value: null }])).toBe("");
  });

  it("uses a crosshair on lines and a column shadow on bars", () => {
    expect(barOption(series, CONTEXT).tooltip?.axisPointer?.type).toBe("shadow");
    expect(lineOption(series, CONTEXT).tooltip?.axisPointer?.type).toBe("cross");
  });

  it("gives the pie an item tooltip with its share", () => {
    const result = toPieSlices([
      { code: "4.1.1.2", label: "Restaurante", value: 750 },
      { code: "4.1.1.3", label: "Eventos", value: 250 },
    ]);
    const option = pieOption(result, ENTRY_CONTEXT);
    const html = option.tooltip?.formatter?.({
      name: "Restaurante",
      value: 750,
      percent: 75,
      dataIndex: 0,
      marker: "•",
    });

    expect(option.tooltip?.trigger).toBe("item");
    expect(html).toContain("Restaurante");
    expect(html).toContain("$750");
    expect(html).toContain("75.0 %");
  });
});

describe("la cascada se dibuja como barras", () => {
  /** Cultura Manor Ene–Jul, already derived: revenue, two expense groups and the profit. */
  const STEPS: WaterfallStep[] = [
    { kind: "total", code: "4", label: "Ingresos", value: 176_303, start: 0, end: 176_303 },
    {
      kind: "delta",
      code: "5.1.5",
      label: "Gastos Generales",
      value: -77_847,
      start: 176_303,
      end: 98_456,
    },
    {
      kind: "delta",
      code: "5.1.1",
      label: "Gastos de Personal",
      value: -63_000,
      start: 98_456,
      end: 35_456,
    },
    { kind: "total", code: RESULT_CODE, label: "Utilidad", value: 35_456, start: 0, end: 35_456 },
  ];

  /** A center whose expenses eat the revenue: the step crosses zero and the close sits below it. */
  const PERDIDA: WaterfallStep[] = [
    { kind: "total", code: "4", label: "Ingresos", value: 10_000, start: 0, end: 10_000 },
    {
      kind: "delta",
      code: "5.1.1",
      label: "Sueldos",
      value: -25_000,
      start: 10_000,
      end: -15_000,
    },
    { kind: "total", code: RESULT_CODE, label: "Pérdida", value: -15_000, start: 0, end: -15_000 },
  ];

  const seriesById = (option: ChartOption, id: string) =>
    option.series.find((series) => series.id === id);

  it("apila barras, y solo barras, en un mismo stack", () => {
    const option = waterfallOption(STEPS);

    expect(option.series.every((series) => series.type === "bar")).toBe(true);
    expect(new Set(option.series.map((series) => series.stack)).size).toBe(1);
  });

  it("deja el tramo base invisible y fuera de la leyenda y del tooltip", () => {
    const option = waterfallOption(STEPS);
    const base = seriesById(option, "cascada-base-positivo");

    // Gastos Generales closes at 98,456: that is the height of its transparent segment.
    expect(base?.data[1]).toBe(98_456);
    expect(base?.itemStyle?.color).toBe("transparent");
    expect(base?.label?.show).toBe(false);
    expect(option.legend?.show).toBe(false);
    expect(tooltipOf(option, [{ dataIndex: 1 }])).toBe(
      `Gastos Generales<br/>${formatCurrency(-77_847)} · acumulado ${formatCurrency(98_456)}`,
    );
  });

  it("declara un solo eje de valores", () => {
    const option = waterfallOption(STEPS);

    expect(option.yAxis?.type).toBe("value");
    expect(option.xAxis?.data).toEqual([
      "Ingresos",
      "Gastos Generales",
      "Gastos de Personal",
      "Utilidad",
    ]);
  });

  it("etiqueta cada escalón con su monto y su signo, una sola vez", () => {
    const option = waterfallOption(STEPS);
    const positivo = seriesById(option, "cascada-positivo");
    const negativo = seriesById(option, "cascada-negativo");
    const param = { value: 77_847, name: "Gastos Generales", dataIndex: 1 };

    // The bar measures 77,847 upwards from its base, but what it says is what it subtracted.
    expect(positivo?.label?.formatter?.(param)).toBe(formatCurrency(-77_847));
    expect(negativo?.label?.formatter?.(param)).toBe("");
  });

  it("abre con el color de SU bloque y pinta los pasos con el token de signo", () => {
    const fills = seriesById(waterfallOption(STEPS), "cascada-positivo")?.data as ChartBarDatum[];

    // The opening bar says «Ingresos»: the same hue as the Datos table, not slot 1.
    // The rest still encodes DIRECTION, which is another thing and is not touched.
    expect(fills[0].itemStyle?.color).toBe(CHART_SECTION.income);
    expect(fills[1].itemStyle?.color).toBe(CHART_SIGN.negative);
    expect(fills[3].itemStyle?.color).toBe(CHART_SIGN.positive);
  });

  it("conecta el cierre de un escalón con el arranque del siguiente", () => {
    const markLine = seriesById(waterfallOption(STEPS), "cascada-positivo")?.markLine;

    expect(markLine?.data).toHaveLength(STEPS.length - 1);
    expect(markLine?.data[0]).toEqual([{ coord: [0, 176_303] }, { coord: [1, 176_303] }]);
  });

  it("no recorta un resultado negativo", () => {
    const option = waterfallOption(PERDIDA);
    const positivo = seriesById(option, "cascada-positivo")?.data as ChartBarDatum[];
    const negativo = seriesById(option, "cascada-negativo")?.data as ChartBarDatum[];

    expect(Number(option.yAxis?.min)).toBeLessThanOrEqual(-15_000);
    expect(Number(option.yAxis?.max)).toBeGreaterThanOrEqual(10_000);
    // The step that crosses zero is drawn in two segments, one on each side of the axis.
    expect(positivo[1].value).toBe(10_000);
    expect(negativo[1].value).toBe(-15_000);
    expect(negativo[2].value).toBe(-15_000);
  });

  it("ofrece la gemela en tabla con el monto y el acumulado de cada escalón", () => {
    const table = waterfallTable(STEPS);

    expect(table.columns).toEqual(["Monto", "Acumulado"]);
    expect(table.rows[1]).toMatchObject({
      id: "5.1.5",
      label: "Gastos Generales",
      color: CHART_SIGN.negative,
      values: [formatCurrency(-77_847), formatCurrency(98_456)],
    });
  });
});

describe("el eje girado", () => {
  const columns = ["ISAMAR", "CARTAGO", "ISAMAR"];
  const series = [{ id: "ene", label: "Ene", values: [10, 5, 1] }];
  const groups = [
    { label: "Hospedaje", span: 2 },
    { label: "Bar", span: 1 },
  ];

  it("cuelga un SEGUNDO eje que nombra cada grupo en el centro de su tramo", () => {
    const option = categoryBarOption(columns, series, { colorOf: () => "#000" }, groups);
    const axes = option.xAxis;
    expect(Array.isArray(axes)).toBe(true);
    expect(Array.isArray(axes) && axes[0].data).toEqual(columns);
    // Hospedaje spans two columns and its name falls on the left one of the middle; Bar, on its own.
    expect(Array.isArray(axes) && axes[1].data).toEqual(["Hospedaje", "", "Bar"]);
  });

  it("dice hasta dónde llega cada grupo con una franja en los impares, no con una línea por grupo", () => {
    const option = categoryBarOption(columns, series, { colorOf: () => "#000" }, groups);
    expect(option.series[0].markArea?.data).toEqual([[{ xAxis: 2 }, { xAxis: 2 }]]);
  });

  it("sin grupos no hay ni segundo eje ni franjas", () => {
    const option = categoryBarOption(columns, series, { colorOf: () => "#000" });
    expect(Array.isArray(option.xAxis)).toBe(false);
    expect(option.series[0].markArea).toBeUndefined();
  });
});

describe("el código de cuenta, al pasar el ratón", () => {
  const series = [
    makeSeries([1000, null], { code: "4.1.1.2", label: "Ventas Restaurante" }),
    makeSeries([500, null], { code: "4.1.1.3", label: "Ventas Eventos" }),
  ];

  it("el tooltip se queda dentro de la TARJETA, que es lo único que puede cortarlo", () => {
    // The text is never clipped —the box grows to the longest line—, but the card is an
    // `overflow-hidden` and the renderer places the tooltip against the WINDOW, so on hovering the
    // last bars the box fell off the edge and was cut there, precisely with long account names, which
    // is when it needs reading whole.
    const entries: AmountEntry[] = [{ code: "5.1.5.1", label: "Sueldos", value: 100 }];

    expect(barOption(series, CONTEXT).tooltip?.confine).toBe(true);
    expect(horizontalBarOption(entries, ENTRY_CONTEXT).tooltip?.confine).toBe(true);
    expect(verticalBarOption(entries, ENTRY_CONTEXT).tooltip?.confine).toBe(true);
    expect(pieOption(toPieSlices(entries), ENTRY_CONTEXT).tooltip?.confine).toBe(true);
  });

  it("antepone el código al nombre de cada serie, en su fila", () => {
    const html = tooltipOf(barOption(series, CONTEXT), [{ value: 1000 }, { value: 500 }]);

    expect(html).toContain("4.1.1.2 · Ventas Restaurante: $1,000");
    expect(html).toContain("4.1.1.3 · Ventas Eventos: $500");
    // The first line is the PERIOD and not an account: there the code paints nothing.
    expect(html.startsWith("Ene")).toBe(true);
  });

  it("lo dice también en la línea, donde la lectura es la misma", () => {
    const html = tooltipOf(lineOption(series, CONTEXT), [{ value: 1000 }, { value: 500 }]);

    expect(html).toContain("4.1.1.2 · Ventas Restaurante");
  });

  it("lo dice en cada segmento de la pila y en la línea de su total", () => {
    const total = makeSeries([1500, null], { code: "4.1.1", label: "Ventas Alojamiento" });
    const option = stackedTotalOption(series, total, CONTEXT);
    const html = tooltipOf(option, [{ value: 1000 }, { value: 500 }, { value: 1500 }]);

    expect(html).toContain("4.1.1.2 · Ventas Restaurante");
    expect(html).toContain("4.1.1 · Ventas Alojamiento");
  });

  /**
   * In the horizontal bar ones the account is NOT the series —the series is «Monto»— but the axis'
   * category, which the tooltip writes as its first line. That is where it has to go.
   */
  it("en el ranking va en la primera línea, que es donde está el nombre de la cuenta", () => {
    const entries: AmountEntry[] = [
      { code: "5.1.5.1", label: "Sueldos y Salarios", value: 9000 },
      { code: "5.1.5.12", label: "Arrendamiento Operativo", value: 8000 },
    ];
    const option = horizontalBarOption(entries, ENTRY_CONTEXT);
    const html = tooltipOf(option, [{ value: 9000, name: "Sueldos y Salarios", dataIndex: 0 }]);

    expect(html.startsWith("5.1.5.1 · Sueldos y Salarios")).toBe(true);
    expect(html).toContain("$9,000");
    // And it follows the axis' order, not the file's: the second row is the second category.
    expect(
      tooltipOf(option, [{ value: 8000, name: "Arrendamiento Operativo", dataIndex: 1 }]),
    ).toContain("5.1.5.12 · Arrendamiento Operativo");
  });

  it("lo dice igual en la variación y en el pareto", () => {
    const entries: AmountEntry[] = [{ code: "5.1.5.1", label: "Sueldos", value: -400 }];
    expect(
      tooltipOf(variationBarOption(entries), [{ value: -400, name: "Sueldos", dataIndex: 0 }]),
    ).toContain("5.1.5.1 · Sueldos");

    const pareto = toPareto([{ code: "5.1.5.1", label: "Sueldos", value: 400 }]);
    expect(
      tooltipOf(paretoOption(pareto, ENTRY_CONTEXT), [
        { value: 400, name: "Sueldos", dataIndex: 0 },
      ]),
    ).toContain("5.1.5.1 · Sueldos");
  });

  it("lo dice en la tarta, y «Otros» NO lo dice porque no es una cuenta", () => {
    const result = toPieSlices(
      [
        { code: "4.1.1.2", label: "Restaurante", value: 750 },
        { code: "4.1.1.3", label: "Eventos", value: 250 },
        { code: "4.1.1.4", label: "Bar", value: 100 },
      ],
      { maxSlices: 2 },
    );
    const option = pieOption(result, ENTRY_CONTEXT);
    const slice = (dataIndex: number) =>
      option.tooltip?.formatter?.({
        name: result.slices[dataIndex].label,
        value: result.slices[dataIndex].value,
        percent: 50,
        dataIndex,
        marker: "•",
      }) ?? "";

    expect(slice(0)).toContain("4.1.1.2 · Restaurante");
    expect(result.slices[1].label).toBe("Otros");
    expect(slice(1)).toContain("Otros");
    expect(slice(1)).not.toContain("·  Otros");
    expect(slice(1).startsWith("Otros")).toBe(true);
  });

  /**
   * The two shapes that are NOT accounts. A business line groups several accounts from different
   * branches and a cascade step is a block of the statement: neither has ONE code, and writing that
   * of one of its parts would assert something false.
   */
  it("no lo inventa donde la serie no es una cuenta", () => {
    const category = categoryBarOption(
      ["Hospedaje", "Restaurante"],
      [{ id: "ene", label: "Ene", values: [10, 5] }],
      { colorOf: () => "#000" },
    );
    expect(tooltipOf(category, [{ value: 10, name: "Hospedaje" }])).not.toContain("·");

    const steps: WaterfallStep[] = [
      { kind: "total", code: "4", label: "Ingresos", value: 100, start: 0, end: 100 },
    ];
    expect(tooltipOf(waterfallOption(steps), [{ dataIndex: 0 }])).not.toContain("4 · Ingresos");
  });

  it("cuelga el código bajo el nombre en la tabla gemela, donde hay sitio para los dos", () => {
    const rows = seriesTable(series, CONTEXT).rows;
    expect(rows.map((row) => row.sublabel)).toEqual(["4.1.1.2", "4.1.1.3"]);

    const entries: AmountEntry[] = [{ code: "5.1.5.1", label: "Sueldos", value: 9000 }];
    expect(entryTable(entries, ENTRY_CONTEXT).rows[0].sublabel).toBe("5.1.5.1");
  });

  it("y la fila de «Otros» se queda sin él, como su porción", () => {
    const result = toPieSlices(
      [
        { code: "4.1.1.2", label: "Restaurante", value: 750 },
        { code: "4.1.1.3", label: "Eventos", value: 250 },
        { code: "4.1.1.4", label: "Bar", value: 100 },
      ],
      { maxSlices: 2 },
    );
    const rows = entryTable(result.slices, ENTRY_CONTEXT).rows;

    expect(rows.find((row) => row.label === "Otros")?.sublabel).toBeUndefined();
  });
});

describe("los importes se escriben como en Datos", () => {
  const series = [makeSeries([204_045.51, null], { code: "4.1.1.2", label: "Restaurante" })];

  /**
   * TWO decimals ALWAYS, with the same `formatCurrency({ cents: true })` as the Datos table: the
   * accountant checks the bar against their sheet, and `$204,045` against `204.045,51` forces them to
   * wonder whether the difference is cents or an upload error.
   */
  it("dice los centavos en la etiqueta, en el tooltip y en la tabla gemela", () => {
    const option = barOption(series, CONTEXT);

    expect(formatChartValue(204_045.51)).toBe("$204,045.51");
    expect(option.series[0].label?.formatter?.({ value: 204_045.51, dataIndex: 0 })).toContain(
      "$204,045.51",
    );
    expect(tooltipOf(option, [{ value: 204_045.51 }])).toContain("$204,045.51");
    expect(seriesTable(series, CONTEXT).rows[0].values[0]).toBe("$204,045.51");
  });

  /**
   * The AXIS does not: its ticks are a scale and not a figure anybody checks, and six labels of
   * «$204,045.51» eat the width the drawing has left. It is the same rule Ocupaciones already wrote
   * for `formatMetric` — «right for an axis, wrong for a figure someone compares against their own
   * spreadsheet» —, and that is why Datos, which has no axis, does not have this case.
   */
  it("pero no en las marcas del eje, que son una escala y no una cifra", () => {
    const option = barOption(series, CONTEXT);

    expect(formatAxisValue(204_045.51)).toBe("$204,046");
    expect(option.yAxis?.axisLabel?.formatter?.(204_045.51)).toBe("$204,046");
  });

  it("el porcentaje y el índice no cambian: sus decimales son los suyos", () => {
    expect(formatChartValue(28.4, "porcentaje")).toBe("28.4 %");
    expect(formatChartValue(112.35, "indice")).toBe("112.4");
    expect(formatAxisValue(28.4, "porcentaje")).toBe("28.4 %");
  });

  it("la tarta y las barras horizontales los dicen igual", () => {
    const entries: AmountEntry[] = [{ code: "5.1.5.1", label: "Sueldos", value: 9_357.33 }];
    expect(entryTable(entries, ENTRY_CONTEXT).rows[0].values[0]).toBe("$9,357.33");
    expect(
      tooltipOf(horizontalBarOption(entries, ENTRY_CONTEXT), [
        { value: 9_357.33, name: "Sueldos", dataIndex: 0 },
      ]),
    ).toContain("$9,357.33");

    const pie = toPieSlices([{ code: "5.1.5.1", label: "Sueldos", value: 9_357.33 }]);
    expect(
      pieOption(pie, ENTRY_CONTEXT).tooltip?.formatter?.({
        name: "Sueldos",
        value: 9_357.33,
        percent: 100,
        dataIndex: 0,
        marker: "•",
      }),
    ).toContain("$9,357.33");
  });
});

describe("shareOfTotalOption · una cuenta como parte de un todo", () => {
  const ROWS = [
    { id: "gastos", label: "Del total de costos y gastos", value: 307_005.37, total: 1_120_438.68 },
    { id: "ingresos", label: "Del total de ingresos", value: 307_005.37, total: 1_441_884.42 },
  ];
  const colorOf = (id: string) => (id === "ingresos" ? "#8fb03c" : "#3ba3c2");

  it("dibuja la parte y el RESTO, que es lo que pone el todo a la vista", () => {
    const option = shareOfTotalOption(ROWS, { colorOf });

    expect(option.series.map((series) => series.id)).toEqual(["parte", "resto"]);
    // Stacked: together they are 100 % of each row.
    expect(option.series[0].stack).toBe(option.series[1].stack);
  });

  it("el eje va FIJO a 100, o el mismo relleno diría cosas distintas en dos filas", () => {
    const option = shareOfTotalOption(ROWS, { colorOf });
    const xAxis = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis;

    expect(xAxis?.min).toBe(0);
    expect(xAxis?.max).toBe(100);
  });

  it("cada fila es su porcentaje contra SU propio total", () => {
    const option = shareOfTotalOption(ROWS, { colorOf });
    const parte = option.series[0].data.map((d) => (d as { value: number }).value);
    const resto = option.series[1].data.map((d) => (d as { value: number }).value);

    expect(parte[0]).toBeCloseTo(27.4, 1);
    expect(parte[1]).toBeCloseTo(21.3, 1);
    // The rest completes the 100 in both, which is what makes it read as a breakdown.
    expect(parte[0] + resto[0]).toBeCloseTo(100, 6);
    expect(parte[1] + resto[1]).toBeCloseTo(100, 6);
  });

  it("el color lo pone el BLOQUE contra el que se mide, no la cuenta", () => {
    const option = shareOfTotalOption(ROWS, { colorOf });
    const colors = option.series[0].data.map(
      (d) => (d as { itemStyle?: { color?: string } }).itemStyle?.color,
    );

    expect(colors).toEqual(["#3ba3c2", "#8fb03c"]);
  });

  it("el resto es SILENCIOSO: existe para verse el todo, no para compararse con la parte", () => {
    expect(shareOfTotalOption(ROWS, { colorOf }).series[1].silent).toBe(true);
  });

  it("una fila sin total se va: no hay contra qué medir, que no es lo mismo que 0 %", () => {
    const option = shareOfTotalOption([ROWS[0], { ...ROWS[1], total: null }], { colorOf });
    const yAxis = option.yAxis;

    expect(yAxis?.data).toEqual(["Del total de costos y gastos"]);
    expect(option.series[0].data).toHaveLength(1);
  });

  it("un total en cero tampoco divide", () => {
    const option = shareOfTotalOption([{ ...ROWS[0], total: 0 }], { colorOf });

    expect(option.series[0].data).toHaveLength(0);
  });

  it("la gemela en tabla dice el monto, la parte y el todo", () => {
    const table = shareOfTotalTable(ROWS, { colorOf });

    expect(table.columns).toEqual(["Monto", "% del total", "Total"]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].values[1]).toBe("27.4 %");
    expect(table.rows[1].values[1]).toBe("21.3 %");
  });
});

describe("el código de cuenta llega al tooltip de las barras verticales", () => {
  it("lo pasa por categoría y en el ORDEN dibujado, que es el ordenado", () => {
    // The axis truncates long names, so the tooltip is where the accountant identifies the row
    // against their plan. `byCategory` goes by index: reading it off the unordered list would put one
    // account's code under another's name.
    const option = verticalBarOption(
      [
        { code: "5.2.01.02", label: "Costo Alimentación", value: 7_881.11 },
        { code: "5.3.03.01", label: "Honorarios Médicos", value: 307_005.37 },
      ],
      { colorOf: () => "#3ba3c2" },
    );
    const xAxis = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis;

    expect(xAxis?.data).toEqual(["Honorarios Médicos", "Costo Alimentación"]);
    expect(option.tooltip?.formatter).toBeTypeOf("function");
    const head = option.tooltip?.formatter?.([
      { name: "Honorarios Médicos", value: 307_005.37, dataIndex: 0 },
    ] as never);
    expect(head).toContain("5.3.03.01 · Honorarios Médicos");
  });
});
