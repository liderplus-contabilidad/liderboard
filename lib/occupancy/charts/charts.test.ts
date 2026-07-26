import { describe, expect, it } from "vitest";
import { CHART_HEAT_EMPTY, heatStep } from "@/lib/charts/palette";
import { buildOccupancySeries } from "../analytics/series";
import { emptyFilters } from "../filters";
import { emptyDataset } from "../derive";
import type { OccupancyDataset } from "../types";
import { buildHeatmaps } from "./heatmap";
import { channelOption, formatMetric, seriesOption, seriesTable } from "./option";
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
  const colorOf = colorResolver(colorUniverse([MANOR, NORTE]));

  it("dibuja barras cuando hay una sola serie leída por mes", () => {
    const bundle = buildOccupancySeries([MANOR], {
      metric: "occupancy",
      centerIds: ["manor"],
      years: [2026],
      scope: "mes",
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
      scope: "mes",
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
      scope: "mes",
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
      scope: "mes",
      months: [0],
      days: [],
    });
    const table = seriesTable(bundle, { colorOf });
    expect(table.columns).toEqual(["Ene"]);
    expect(table.rows[0].values[0]).toMatch(/%/);
  });
});

describe("channelOption", () => {
  it("una barra por canal, con su propio color", () => {
    const option = channelOption(
      [
        { id: "booking", name: "Booking", nights: 7 },
        { id: "web", name: "Página web", nights: 3 },
      ],
      ["booking", "web"],
    );
    expect(option.series[0].data).toHaveLength(2);
    expect(option.yAxis?.inverse).toBe(true);
  });
});

describe("buildHeatmaps", () => {
  const query = {
    metric: "occupancy" as const,
    centerIds: ["manor", "norte"],
    years: [2026],
    scope: "mes" as const,
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
    expect(formatMetric(0.2984, "percent")).toBe("29,8 %");
  });

  it("el dinero conserva los centavos mientras quepan", () => {
    expect(formatMetric(82.89, "currency")).toBe("$82,89");
    expect(formatMetric(115302.4, "currency")).toBe("$115.302");
  });

  it("un conteo no arrastra decimales espurios", () => {
    expect(formatMetric(1480, "count")).toBe("1.480");
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
