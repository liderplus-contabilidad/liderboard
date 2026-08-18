import { describe, expect, it } from "vitest";
import { CHART_HEAT_EMPTY, heatStep } from "@/lib/charts/palette";
import { buildOccupancyEvolution } from "../analytics/series";
import type { DateRef, OccupancyPeriod, OccupancyQuery } from "../analytics/types";
import { emptyFilters } from "../filters";
import { emptyDataset } from "../derive";
import type { OccupancyDataset } from "../types";
import { buildHeatmaps } from "./heatmap";
import {
  channelOption,
  formatAxisMetric,
  formatMetric,
  formatMonthlyFigure,
  MONTHLY_COLUMNS,
  weekdayOption,
} from "./option";
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

const date = (monthIndex: number, day: number, year = 2026): DateRef => ({
  year,
  monthIndex,
  day,
});
/** Un mes entero de 2026, que es el tramo de casi todos los casos. */
const month = (monthIndex: number): OccupancyPeriod => ({
  mode: "rango",
  range: { from: date(monthIndex, 0), to: date(monthIndex, 30) },
});
const wholeYear: OccupancyPeriod = {
  mode: "rango",
  range: { from: date(0, 0), to: date(11, 30) },
};

describe("toOccupancyQuery", () => {
  it("sin nada marcado cae en la sucursal que el módulo ya muestra", () => {
    const universe = selectionUniverse([MANOR, NORTE], { centerId: "norte" });
    expect(toOccupancyQuery(emptyFilters(), universe).centerIds).toEqual(["norte"]);
  });

  it("marcar acota; lo no marcado se abre a todo el universo", () => {
    const universe = selectionUniverse([MANOR, NORTE], { centerId: "manor" });
    const query = toOccupancyQuery({ ...emptyFilters(), centerIds: ["norte"] }, universe);
    expect(query.centerIds).toEqual(["norte"]);
    expect(toOccupancyQuery(emptyFilters(), selectionUniverse([MANOR, NORTE])).centerIds).toEqual([
      "manor",
      "norte",
    ]);
  });

  it("el periodo viaja en una sola forma, la de su modalidad", () => {
    const universe = selectionUniverse([MANOR]);
    expect(toOccupancyQuery(emptyFilters(), universe).period.mode).toBe("rango");
    const comparando = {
      ...emptyFilters(),
      periodMode: "comparar" as const,
      picks: [{ kind: "dia" as const, ...date(0, 4) }],
    };
    expect(toOccupancyQuery(comparando, universe).period).toEqual({
      mode: "comparar",
      picks: [{ kind: "dia", ...date(0, 4) }],
    });
  });

  it("el tramo viaja tal cual, normalizado", () => {
    const universe = selectionUniverse([MANOR]);
    const filters = {
      ...emptyFilters(),
      range: { from: date(3, 9), to: date(2, 19) },
    };
    const query = toOccupancyQuery(filters, universe);
    expect(query.period).toEqual({
      mode: "rango",
      range: { from: date(2, 19), to: date(3, 9) },
    });
  });
});

describe("colorResolver", () => {
  it("da el color por la posición estable en el espacio, no por el orden del resultado", () => {
    const order = colorUniverse([MANOR, NORTE]);
    const colorOf = colorResolver(order);
    const manorColor = colorOf({ centerId: "manor" });
    // Norte sigue pintado igual aunque Manor no esté en el resultado.
    expect(colorOf({ centerId: "norte" })).not.toBe(manorColor);
    expect(colorResolver(order)({ centerId: "manor" })).toBe(manorColor);
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
        series: [{ key: { centerId: "manor" }, label: "Manor", nights: [7, 3] }],
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
          { key: { centerId: "manor" }, label: "Manor", nights: [7, 3] },
          { key: { centerId: "norte" }, label: "Norte", nights: [3, 0] },
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
    expect(option.series[0].itemStyle?.color).toBe(colorOf({ centerId: "manor" }));
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
    scope: "mensual" as const,
    period: wholeYear,
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
    const result = buildHeatmaps([MANOR], { ...query, centerIds: ["manor"], period: month(1) });
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

  it("el dinero conserva SIEMPRE sus centavos, como la tabla contra la que se coteja", () => {
    expect(formatMetric(82.89, "currency")).toBe("$82.89");
    expect(formatMetric(115302.4, "currency")).toBe("$115,302.40");
  });

  it("y los suelta solo en el eje, donde la cifra no se coteja sino que se estima", () => {
    expect(formatAxisMetric(82.89, "currency")).toBe("$82.89");
    expect(formatAxisMetric(115302.4, "currency")).toBe("$115,302");
    // El porcentaje y el conteo no tienen dos formas: el eje los escribe como todo lo demás.
    expect(formatAxisMetric(0.2984, "percent")).toBe("29.8 %");
    expect(formatAxisMetric(null, "currency")).toBeNull();
  });

  it("un conteo no arrastra decimales espurios", () => {
    expect(formatMetric(1480, "count")).toBe("1,480");
  });

  it("sin valor no inventa un cero", () => {
    expect(formatMetric(null, "currency")).toBeNull();
  });
});

describe("buildOccupancyEvolution · las cuatro cifras del reporte", () => {
  const FIGURES = MONTHLY_COLUMNS.map((column) => column.id);
  const query = (over: Partial<OccupancyQuery> = {}): OccupancyQuery => ({
    metric: "occupancy",
    centerIds: ["manor"],
    scope: "mensual",
    period: wholeYear,
    ...over,
  });

  it("declara las cuatro cifras del reporte, en su orden y con su unidad", () => {
    expect(FIGURES).toEqual(["revenue", "occupancy", "adr", "revpar"]);
    expect(MONTHLY_COLUMNS.map((c) => c.unit)).toEqual([
      "currency",
      "percent",
      "currency",
      "currency",
    ]);
  });

  it("da un panel por cifra, todos sobre el MISMO eje", () => {
    const evolution = buildOccupancyEvolution([MANOR], query(), FIGURES);
    expect(evolution.panels.map((panel) => panel.metric.id)).toEqual(FIGURES);
    for (const panel of evolution.panels) {
      expect(panel.axis).toEqual(evolution.axis);
    }
  });

  it("el eje lo manda «Ver por», igual para los cuatro", () => {
    expect(buildOccupancyEvolution([MANOR], query(), FIGURES).axis).toHaveLength(12);
    expect(
      buildOccupancyEvolution([MANOR], query({ scope: "trimestral" }), FIGURES).axis,
    ).toHaveLength(4);
    const dias = buildOccupancyEvolution(
      [MANOR],
      query({ scope: "dia", period: month(0) }),
      FIGURES,
    );
    expect(dias.axis).toHaveLength(31);
    expect(dias.panels[0].axis).toEqual(dias.axis);
  });

  it("cada panel conserva su propia unidad", () => {
    const evolution = buildOccupancyEvolution([MANOR], query(), FIGURES);
    expect(evolution.panels.map((panel) => panel.metric.unit)).toEqual([
      "currency",
      "percent",
      "currency",
      "currency",
    ]);
  });

  it("un aviso del tope de series se dice una vez, no cuatro", () => {
    const many = Array.from({ length: 3 }, (_, i) => dataset(`c${i}`, 2026));
    const evolution = buildOccupancyEvolution(
      many,
      query({ centerIds: many.map((d) => d.centerId), limit: 2 }),
      FIGURES,
    );
    expect(evolution.warnings).toHaveLength(1);
  });

  it("un mes sin ventas no dibuja punto en ninguno de los cuatro", () => {
    const evolution = buildOccupancyEvolution([MANOR], query(), FIGURES);
    for (const panel of evolution.panels) {
      expect(panel.series[0].values[1]).toBeNull();
    }
  });
});

describe("formatMonthlyFigure", () => {
  it("dos decimales fijos, sin el umbral del millar que usa el eje", () => {
    expect(formatMonthlyFigure(47609, "currency")).toBe("47,609.00");
    expect(formatMonthlyFigure(0.51, "percent")).toBe("51.00 %");
    expect(formatMonthlyFigure(null, "currency")).toBe("—");
  });
});
