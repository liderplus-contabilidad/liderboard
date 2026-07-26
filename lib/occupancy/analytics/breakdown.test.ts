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
  scope: "mes",
  months: [0],
  days: [],
  ...over,
});

const A = dataset("a", 2026);
const B = dataset("b", 2026);

describe("occupancyKpis", () => {
  it("son ratios de las sumas de todo lo marcado", () => {
    const kpis = occupancyKpis([A, B], query());
    expect(kpis.map((k) => k.id)).toEqual(["occupancy", "adr", "revpar", "revenue"]);
    // 10 vendidas sobre 20 disponibles entre las dos sucursales.
    expect(kpis[0].value).toBeCloseTo(0.5, 10);
    expect(kpis[1].value).toBeCloseTo(100, 10); // 1000 / 10
    expect(kpis[2].value).toBeCloseTo(50, 10); // 1000 / 20
    expect(kpis[3].value).toBe(1000);
  });

  it("sin nada en el alcance no inventa ceros", () => {
    expect(occupancyKpis([A], query({ centerIds: ["a"], months: [7] }))[0].value).toBeNull();
  });
});

describe("channelTotals", () => {
  it("une los canales por id y suma lo que aportan las sucursales marcadas", () => {
    const { entries, total } = channelTotals([A, B], query());
    expect(entries).toEqual([{ id: "booking", name: "Booking", nights: 8 }]);
    expect(total).toBe(8);
  });

  it("deja fuera un canal sin noches", () => {
    const sinVentas = dataset("c", 2026);
    sinVentas.months[0].inputs.channels.booking = new Array(31).fill(0);
    expect(channelTotals([sinVentas], query({ centerIds: ["c"] })).entries).toEqual([]);
  });
});

describe("weekdayRhythm", () => {
  it("reparte los días en su día de la semana empezando en lunes", () => {
    const { labels, values } = weekdayRhythm([A], query({ centerIds: ["a"] }));
    expect(labels[0]).toBe("Lun");
    // El 1 de enero de 2026 es jueves: ahí cae el único día con datos.
    expect(values[3]).toBeCloseTo(0.5, 10);
  });

  it("un día de la semana sin datos queda vacío", () => {
    const { values } = weekdayRhythm([A], query({ centerIds: ["a"], months: [7] }));
    expect(values.every((value) => value === null)).toBe(true);
  });
});

describe("alcance de días", () => {
  it("los indicadores describen solo los días marcados", () => {
    const soloDia1 = occupancyKpis([A], query({ centerIds: ["a"], days: [0] }));
    const soloDia2 = occupancyKpis([A], query({ centerIds: ["a"], days: [1] }));
    expect(soloDia1[0].value).toBeCloseTo(0.5, 10); // el día 1 vendió 5 de 10
    expect(soloDia2[0].value).toBeNull(); // el día 2 no tiene nada cargado
  });

  it("los canales también se acotan al día marcado", () => {
    expect(channelTotals([A, B], query({ days: [0] })).total).toBe(8);
    expect(channelTotals([A, B], query({ days: [1] })).total).toBe(0);
  });
});
