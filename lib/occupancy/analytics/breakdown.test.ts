import { describe, expect, it } from "vitest";
import { emptyDataset } from "../derive";
import type { OccupancyDataset } from "../types";
import { channelTotals, occupancyKpis, weekdayRhythm } from "./breakdown";
import type { OccupancyQuery } from "./types";

function dataset(centerId: string, year: number): OccupancyDataset {
  const built = emptyDataset(year, "HOTEL A", { id: centerId, name: centerId.toUpperCase() });
  const enero = built.months[0];
  enero.fromFile = true;
  enero.inputs.available[0] = 10;
  enero.inputs.sold[0] = 5;
  enero.inputs.revenue[0] = 500;
  enero.inputs.channels.booking = new Array(31).fill(0);
  enero.inputs.channels.booking[0] = 4;
  built.channels = [{ id: "booking", name: "Booking" }];
  return built;
}

const query = (over: Partial<OccupancyQuery> = {}): OccupancyQuery => ({
  metric: "occupancy",
  centerIds: ["a", "b"],
  years: [2026],
  scope: "mensual",
  months: [0],
  days: [],
  ...over,
});

const A = dataset("a", 2026);
const B = dataset("b", 2026);

describe("occupancyKpis", () => {
  it("da un grupo por sucursal-año en vez de mezclarlas en una cifra", () => {
    const groups = occupancyKpis([A, B], query());
    expect(groups.map((group) => group.label)).toEqual(["A", "B"]);
    expect(groups[0].key).toEqual({ centerId: "a", year: 2026 });
  });

  it("dentro de un grupo son ratios de las sumas de ese sucursal-año", () => {
    const [group] = occupancyKpis([A], query({ centerIds: ["a"] }));
    expect(group.kpis.map((k) => k.id)).toEqual(["occupancy", "adr", "revpar", "revenue"]);
    expect(group.kpis[0].value).toBeCloseTo(0.5, 10); // 5 de 10
    expect(group.kpis[1].value).toBeCloseTo(100, 10); // 500 / 5
    expect(group.kpis[2].value).toBeCloseTo(50, 10); // 500 / 10
    expect(group.kpis[3].value).toBe(500);
  });

  it("sin nada en el alcance no inventa ceros", () => {
    const [group] = occupancyKpis([A], query({ centerIds: ["a"], months: [7] }));
    expect(group.kpis[0].value).toBeNull();
  });

  it("nombra el año sólo cuando hay más de uno en pantalla", () => {
    const otroAño = dataset("a", 2025);
    const groups = occupancyKpis([A, otroAño], query({ centerIds: ["a"], years: [2025, 2026] }));
    // El orden es el de la consulta: sucursal fuera, año dentro y en orden de calendario.
    expect(groups.map((group) => group.label)).toEqual(["A · 2025", "A · 2026"]);
  });
});

describe("channelTotals", () => {
  it("une los canales por id pero guarda las noches de cada sucursal aparte", () => {
    const breakdown = channelTotals([A, B], query());
    // Una sola fila Booking, ordenada por el total combinado…
    expect(breakdown.channels).toEqual([{ id: "booking", name: "Booking", total: 8 }]);
    // …y dentro, cada sucursal con lo suyo.
    expect(breakdown.series.map((entry) => entry.label)).toEqual(["A", "B"]);
    expect(breakdown.series.map((entry) => entry.nights)).toEqual([[4], [4]]);
    expect(breakdown.total).toBe(8);
  });

  it("alinea las noches con las filas aunque una sucursal no use un canal", () => {
    const otro = dataset("b", 2026);
    otro.channels = [{ id: "directo", name: "Directo" }];
    otro.months[0].inputs.channels = { directo: new Array(31).fill(0) };
    otro.months[0].inputs.channels.directo[0] = 9;

    const breakdown = channelTotals([A, otro], query());
    expect(breakdown.channels.map((c) => c.id)).toEqual(["directo", "booking"]);
    // A no vende por Directo y B no vende por Booking: cada fila lo dice con un 0.
    expect(breakdown.series[0].nights).toEqual([0, 4]);
    expect(breakdown.series[1].nights).toEqual([9, 0]);
  });

  it("deja fuera un canal sin noches", () => {
    const sinVentas = dataset("c", 2026);
    sinVentas.months[0].inputs.channels.booking = new Array(31).fill(0);
    expect(channelTotals([sinVentas], query({ centerIds: ["c"] })).channels).toEqual([]);
  });
});

describe("weekdayRhythm", () => {
  it("reparte los días en su día de la semana empezando en lunes", () => {
    const { labels, series } = weekdayRhythm([A], query({ centerIds: ["a"] }));
    expect(labels[0]).toBe("Lun");
    // El 1 de enero de 2026 es jueves: ahí cae el único día con datos.
    expect(series[0].values[3]).toBeCloseTo(0.5, 10);
  });

  it("da una fila por sucursal-año en vez de fundirlas en un promedio", () => {
    const { series } = weekdayRhythm([A, B], query());
    expect(series.map((entry) => entry.label)).toEqual(["A", "B"]);
    expect(series[1].values[3]).toBeCloseTo(0.5, 10);
  });

  it("un día de la semana sin datos queda vacío", () => {
    const { series } = weekdayRhythm([A], query({ centerIds: ["a"], months: [7] }));
    expect(series[0].values.every((value) => value === null)).toBe(true);
  });
});

describe("alcance de días", () => {
  it("los indicadores describen solo los días marcados", () => {
    const soloDia1 = occupancyKpis([A], query({ centerIds: ["a"], days: [0] }));
    const soloDia2 = occupancyKpis([A], query({ centerIds: ["a"], days: [1] }));
    expect(soloDia1[0].kpis[0].value).toBeCloseTo(0.5, 10); // el día 1 vendió 5 de 10
    expect(soloDia2[0].kpis[0].value).toBeNull(); // el día 2 no tiene nada cargado
  });

  it("los canales también se acotan al día marcado", () => {
    expect(channelTotals([A, B], query({ days: [0] })).total).toBe(8);
    expect(channelTotals([A, B], query({ days: [1] })).total).toBe(0);
  });
});
