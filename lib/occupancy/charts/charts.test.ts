import { describe, expect, it } from "vitest";
import { CHART_HEAT_EMPTY, heatStep } from "@/lib/charts/palette";
import { buildOccupancySeries } from "../analytics/series";
import { emptyFilters } from "../filters";
import { emptyDataset } from "../derive";
import type { OccupancyDataset } from "../types";
import { buildHeatmaps } from "./heatmap";
import { channelOption, formatMetric, seriesOption, seriesTable, weekdayOption } from "./option";
import { colorResolver, colorUniverse, selectionUniverse, toOccupancyQuery } from "./selection";

function dataset(centerId: string, year: number, sold: number[] = [9, 5, 0]): OccupancyDataset {
  const built = emptyDataset(year, "HOTEL A", { id: centerId, name: centerId.toUpperCase() });
  const enero = built.months[0];
  enero.fromFile = true;
  sold.forEach((value, day) => {
    enero.inputs.sold[day] = value;
    enero.inputs.available[day] = 10;
    enero.inputs.revenue[day] = value * 100;
  });
  enero.inputs.channels.booking = new Array(31).fill(0);
  enero.inputs.channels.booking[0] = 7;
  built.channels = [{ id: "booking", name: "Booking" }];
  return built;
}

const MANOR = dataset("manor", 2026);
const NORTE = dataset("norte", 2026, [2, 1, 0]);
const colorOf = colorResolver(colorUniverse([MANOR, NORTE]));

describe("toOccupancyQuery", () => {
  it("sin nada marcado cae en la sucursal-año que el módulo ya muestra", () => {
    const universe = selectionUniverse([MANOR, NORTE], { centerId: "norte", year: 2026 });
    const query = toOccupancyQuery(emptyFilters(), universe);
    expect(query.centerIds).toEqual(["norte"]);
    expect(query.years).toEqual([2026]);
  });

  it("marcar acota; lo no marcado se abre a todo el universo", () => {
    const universe = selectionUniverse([MANOR, NORTE], { centerId: "manor", year: 2026 });
    const query = toOccupancyQuery({ ...emptyFilters(), centerIds: ["norte"] }, universe);
    expect(query.centerIds).toEqual(["norte"]);
    expect(query.years).toEqual([2026]);
  });

  it("los meses marcados viajan tal cual: acotan el eje", () => {
    const universe = selectionUniverse([MANOR]);
    const query = toOccupancyQuery({ ...emptyFilters(), months: [2, 5] }, universe);
    expect(query.months).toEqual([2, 5]);
  });
});

describe("colorResolver", () => {
  it("da el color por la posición estable en el espacio, no por el orden del resultado", () => {
    const order = colorUniverse([MANOR, NORTE]);
    const colorOf = colorResolver(order);
    const manorColor = colorOf({ centerId: "manor", year: 2026 });
    // Norte sigue pintado igual aunque Manor no esté en el resultado.
    expect(colorOf({ centerId: "norte", year: 2026 })).not.toBe(manorColor);
    expect(colorResolver(order)({ centerId: "manor", year: 2026 })).toBe(manorColor);
  });
});

describe("seriesOption", () => {
  it("dibuja barras cuando hay una sola serie leída por mes", () => {
    const bundle = buildOccupancySeries([MANOR], {
      metric: "occupancy",
      centerIds: ["manor"],
      years: [2026],
      scope: "mensual",
      months: [],
      days: [],
    });
    expect(seriesOption(bundle, { colorOf }).series[0].type).toBe("bar");
  });

  it("pasa a líneas cuando hay comparación", () => {
    const bundle = buildOccupancySeries([MANOR, NORTE], {
      metric: "occupancy",
      centerIds: ["manor", "norte"],
      years: [2026],
      scope: "mensual",
      months: [],
      days: [],
    });
    const option = seriesOption(bundle, { colorOf });
    expect(option.series.map((s) => s.type)).toEqual(["line", "line"]);
    expect(option.legend?.show).toBe(true);
  });

  it("pasa a líneas en el eje diario aunque haya una sola serie", () => {
    const bundle = buildOccupancySeries([MANOR], {
      metric: "occupancy",
      centerIds: ["manor"],
      years: [2026],
      scope: "dia",
      months: [0],
      days: [],
    });
    expect(seriesOption(bundle, { colorOf }).series[0].type).toBe("line");
  });

  it("nunca declara un segundo eje y conserva los huecos", () => {
    const bundle = buildOccupancySeries([MANOR], {
      metric: "revenue",
      centerIds: ["manor"],
      years: [2026],
      scope: "mensual",
      months: [],
      days: [],
    });
    const option = seriesOption(bundle, { colorOf });
    expect(Array.isArray(option.yAxis)).toBe(false);
    expect(option.series[0].data).toContain(null);
  });

  it("la tabla gemela trae las mismas columnas y formatea la unidad", () => {
    const bundle = buildOccupancySeries([MANOR], {
      metric: "occupancy",
      centerIds: ["manor"],
      years: [2026],
      scope: "mensual",
      months: [0],
      days: [],
    });
    const table = seriesTable(bundle, { colorOf });
    expect(table.columns).toEqual(["Ene"]);
    expect(table.rows[0].values[0]).toMatch(/%/);
  });
});

describe("tooltip de la gráfica principal", () => {
  const enero = (centers: string[]) => ({
    metric: "occupancy" as const,
    centerIds: centers,
    years: [2026],
    scope: "mensual" as const,
    months: [0],
    days: [],
  });

  /** What ECharts hands the formatter for one hovered column. */
  const param = (seriesId: string, seriesName: string, value: number | null) => ({
    seriesId,
    seriesName,
    name: "Ene",
    value,
    dataIndex: 0,
    marker: "●",
  });

  it("con una sola serie abre las cifras crudas y los tres indicadores", () => {
    const bundle = buildOccupancySeries([MANOR], enero(["manor"]));
    const html =
      seriesOption(bundle, { colorOf }).tooltip?.formatter?.([
        param("manor|2026", "MANOR", bundle.series[0].values[0]),
      ]) ?? "";

    for (const label of [
      "Ocupación",
      "Vendidas",
      "Disponibles",
      "Ingresos",
      "ADR",
      "RevPAR",
      "PAX",
    ]) {
      expect(html).toContain(label);
    }
    // 14 vendidas sobre 30 disponibles, y los $1,400 que produjeron.
    expect(html).toContain("14");
    expect(html).toContain("30");
    expect(html).toContain("46.7 %");
  });

  // Con dos series y UNA columna manda `entityOption`, así que la comparación sobre el eje se
  // lee con el año entero delante: la columna 0 sigue siendo enero.
  it("comparando da el valor de cada serie más la línea de dónde sale", () => {
    const bundle = buildOccupancySeries([MANOR, NORTE], {
      ...enero(["manor", "norte"]),
      months: [],
    });
    const html =
      seriesOption(bundle, { colorOf }).tooltip?.formatter?.([
        param("manor|2026", "MANOR", bundle.series[0].values[0]),
        param("norte|2026", "NORTE", bundle.series[1].values[0]),
      ]) ?? "";

    expect(html).toContain("MANOR");
    expect(html).toContain("NORTE");
    expect(html).toContain("14 de 30 habitaciones");
    expect(html).toContain("3 de 30 habitaciones");
    // El bloque completo es sólo para una serie: aquí no aparece.
    expect(html).not.toContain("RevPAR");
  });

  it("una métrica de total no dice nunca «de 1»", () => {
    const bundle = buildOccupancySeries([MANOR, NORTE], {
      ...enero(["manor", "norte"]),
      months: [],
      metric: "revenue",
    });
    const html =
      seriesOption(bundle, { colorOf }).tooltip?.formatter?.([
        param("manor|2026", "MANOR", bundle.series[0].values[0]),
        param("norte|2026", "NORTE", bundle.series[1].values[0]),
      ]) ?? "";

    expect(html).not.toContain("de 1 ");
    expect(html).toContain("14 vendidas · ADR");
  });

  it("un punto sin datos no inventa un desglose", () => {
    const bundle = buildOccupancySeries([MANOR], { ...enero(["manor"]), months: [7] });
    const html =
      seriesOption(bundle, { colorOf }).tooltip?.formatter?.([
        param("manor|2026", "MANOR", null),
      ]) ?? "";
    expect(html).not.toContain("RevPAR");
    expect(html).toContain("—");
  });
});

describe("channelOption", () => {
  const channels = [
    { id: "booking", name: "Booking", total: 10 },
    { id: "web", name: "Página web", total: 3 },
  ];
  const order = ["booking", "web"];

  it("con una sola sucursal: una serie, un color por canal y sin leyenda", () => {
    const option = channelOption(
      {
        channels,
        series: [{ key: { centerId: "manor", year: 2026 }, label: "Manor", nights: [7, 3] }],
        total: 10,
      },
      order,
      { colorOf },
    );
    expect(option.series).toHaveLength(1);
    expect(option.series[0].data).toHaveLength(2);
    expect(option.legend?.show).toBe(false);
    expect(option.yAxis?.inverse).toBe(true);
  });

  it("comparando: una serie por sucursal-año, con leyenda y color de entidad", () => {
    const option = channelOption(
      {
        channels,
        series: [
          { key: { centerId: "manor", year: 2026 }, label: "Manor", nights: [7, 3] },
          { key: { centerId: "norte", year: 2026 }, label: "Norte", nights: [3, 0] },
        ],
        total: 13,
      },
      order,
      { colorOf },
    );
    expect(option.series).toHaveLength(2);
    expect(option.series.map((s) => s.name)).toEqual(["Manor", "Norte"]);
    expect(option.legend?.show).toBe(true);
    // El color pasa a decir QUÉ sucursal es, porque el canal ya es la fila.
    expect(option.series[0].itemStyle?.color).toBe(colorOf({ centerId: "manor", year: 2026 }));
  });
});

describe("weekdayOption", () => {
  const labels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const row = (centerId: string, value: number) => ({
    key: { centerId, year: 2026 },
    label: centerId,
    values: [value, null, null, null, null, null, null],
  });

  it("con una sola serie imprime el número sobre cada barra", () => {
    const option = weekdayOption(
      { labels, series: [row("manor", 0.5)] },
      "percent",
      { colorOf },
      "#000",
    );
    expect(option.series).toHaveLength(1);
    expect(option.series[0].label?.show).toBe(true);
  });

  it("comparando agrupa las barras y deja los números al tooltip", () => {
    const option = weekdayOption(
      { labels, series: [row("manor", 0.5), row("norte", 0.7)] },
      "percent",
      { colorOf },
      "#000",
    );
    expect(option.series).toHaveLength(2);
    expect(option.series[0].label?.show).toBe(false);
    expect(option.legend?.show).toBe(true);
  });
});

describe("buildHeatmaps", () => {
  const query = {
    metric: "occupancy" as const,
    centerIds: ["manor", "norte"],
    years: [2026],
    scope: "mensual" as const,
    months: [],
    days: [],
  };

  it("dibuja una cuadrícula por sucursal-año marcada", () => {
    const result = buildHeatmaps([MANOR, NORTE], query);
    expect(result.grids.map((g) => g.id)).toEqual(["manor|2026", "norte|2026"]);
    expect(result.grids[0].rows).toHaveLength(12);
    expect(result.grids[0].rows[0].cells).toHaveLength(31);
  });

  it("la escala es común a todas las cuadrículas", () => {
    const result = buildHeatmaps([MANOR, NORTE], query);
    // El máximo sale del mejor día de cualquiera de las dos (Manor, 9/10).
    expect(result.scale).toEqual({ min: 0, max: 0.9 });
  });

  it("una razón siempre escala desde cero", () => {
    expect(buildHeatmaps([MANOR], { ...query, centerIds: ["manor"] }).scale?.min).toBe(0);
  });

  it("un día que el mes no tiene queda vacío, no en cero", () => {
    const result = buildHeatmaps([MANOR], { ...query, centerIds: ["manor"], months: [1] });
    const febrero = result.grids[0].rows[0];
    expect(febrero.cells[28].value).toBeNull();
    expect(heatStep(febrero.cells[28].value, 0, 1)).toBe(CHART_HEAT_EMPTY);
  });

  it("corta en el tope de cuadrículas y dice cuántas dejó fuera", () => {
    const many = Array.from({ length: 6 }, (_, i) => dataset(`c${i}`, 2026));
    const result = buildHeatmaps(many, {
      ...query,
      centerIds: many.map((_, i) => `c${i}`),
    });
    expect(result.grids).toHaveLength(4);
    expect(result.truncated).toBe(2);
  });
});

describe("formatMetric", () => {
  it("una razón se lee en puntos porcentuales, no como fracción", () => {
    expect(formatMetric(0.2984, "percent")).toBe("29.8 %");
  });

  it("el dinero conserva los centavos mientras quepan", () => {
    expect(formatMetric(82.89, "currency")).toBe("$82.89");
    expect(formatMetric(115302.4, "currency")).toBe("$115,302");
  });

  it("un conteo no arrastra decimales espurios", () => {
    expect(formatMetric(1480, "count")).toBe("1,480");
  });

  it("sin valor no inventa un cero", () => {
    expect(formatMetric(null, "currency")).toBeNull();
  });
});

describe("seriesOption · pocas columnas", () => {
  const colorOf = colorResolver(colorUniverse([MANOR, NORTE]));

  it("una comparación de un solo día se dibuja en barras, no en líneas de un punto", () => {
    const bundle = buildOccupancySeries([MANOR, NORTE], {
      metric: "occupancy",
      centerIds: ["manor", "norte"],
      years: [2026],
      scope: "dia",
      months: [0],
      days: [0],
    });
    const option = seriesOption(bundle, { colorOf });
    expect(bundle.axis).toHaveLength(1);
    // Una barra por entidad dentro de una sola serie: el eje pasa a ser la entidad.
    expect(option.series[0].type).toBe("bar");
    expect(option.series[0].data).toHaveLength(2);
  });

  it("un mes entero comparado sigue siendo líneas", () => {
    const bundle = buildOccupancySeries([MANOR, NORTE], {
      metric: "occupancy",
      centerIds: ["manor", "norte"],
      years: [2026],
      scope: "dia",
      months: [0],
      days: [],
    });
    expect(seriesOption(bundle, { colorOf }).series[0].type).toBe("line");
  });
});

describe("seriesOption · una sola columna", () => {
  const colorOf = colorResolver(colorUniverse([MANOR, NORTE]));
  const oneDay = () =>
    buildOccupancySeries([MANOR, NORTE], {
      metric: "occupancy",
      centerIds: ["manor", "norte"],
      years: [2026],
      scope: "dia",
      months: [0],
      days: [0],
    });

  it("pone las series en el eje: lo que varía es la entidad, no la fecha", () => {
    const option = seriesOption(oneDay(), { colorOf });
    expect(option.xAxis?.data).toEqual(["MANOR", "NORTE"]);
    expect(option.series).toHaveLength(1);
    expect(option.series[0].data).toHaveLength(2);
  });

  it("con una sola serie sigue siendo la fecha la que manda", () => {
    const bundle = buildOccupancySeries([MANOR], {
      metric: "occupancy",
      centerIds: ["manor"],
      years: [2026],
      scope: "dia",
      months: [0],
      days: [0],
    });
    expect(seriesOption(bundle, { colorOf }).xAxis?.data).toEqual(["1 ene"]);
  });
});
