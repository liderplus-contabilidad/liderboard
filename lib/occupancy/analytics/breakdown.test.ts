import { describe, expect, it } from "vitest";
import { emptyDataset, toAnnualGrid } from "../derive";
import type { OccupancyDataset } from "../types";
import { channelTotals, dayDetail, reportTotals, weekdayRhythm } from "./breakdown";
import type { DateRef, OccupancyPeriod, OccupancyQuery } from "./types";

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

const date = (year: number, monthIndex: number, day: number): DateRef => ({
  year,
  monthIndex,
  day,
});
const rango = (from: DateRef, to: DateRef): OccupancyPeriod => ({
  mode: "rango",
  range: { from, to },
});
const dias = (...days: DateRef[]): OccupancyPeriod => ({
  mode: "comparar",
  picks: days.map((d) => ({ kind: "dia" as const, ...d })),
});

const query = (over: Partial<OccupancyQuery> = {}): OccupancyQuery => ({
  metric: "occupancy",
  centerIds: ["a", "b"],
  period: rango(date(2026, 0, 0), date(2026, 0, 30)),
  scope: "mensual",
  ...over,
});

const A = dataset("a", 2026);
const B = dataset("b", 2026);

describe("reportTotals", () => {
  /** Un mes entero a cifra plana por día. */
  function withMonth(
    built: OccupancyDataset,
    monthIndex: number,
    perDay: { available: number; sold: number; revenue: number },
  ): OccupancyDataset {
    const month = built.months[monthIndex];
    month.fromFile = true;
    month.inputs.available = month.inputs.available.map(() => perDay.available);
    month.inputs.sold = month.inputs.sold.map(() => perDay.sold);
    month.inputs.revenue = month.inputs.revenue.map(() => perDay.revenue);
    return built;
  }

  function twoMonths(): OccupancyDataset {
    const built = emptyDataset(2026, "HOTEL AMBATO", { id: "centro", name: "Centro" });
    withMonth(built, 0, { available: 22, sold: 11, revenue: 627 });
    withMonth(built, 1, { available: 22, sold: 13, revenue: 728 });
    return built;
  }

  const wholeYear = (over: Partial<OccupancyQuery> = {}) =>
    query({
      centerIds: ["centro"],
      period: rango(date(2026, 0, 0), date(2026, 11, 30)),
      ...over,
    });

  it("da una fila por sucursal, con su nombre", () => {
    const totals = reportTotals([A, B], query());
    expect(totals.map((total) => total.label)).toEqual(["A", "B"]);
    expect(totals[0].key).toEqual({ centerId: "a" });
  });

  it("cierra el periodo como ratio de sumas, no como el promedio de los meses", () => {
    const [total] = reportTotals([twoMonths()], wholeYear());
    const revenue = 31 * 627 + 28 * 728;
    const sold = 31 * 11 + 28 * 13;
    const available = (31 + 28) * 22;

    expect(total.figures.revenue).toBe(revenue);
    expect(total.figures.adr).toBeCloseTo(revenue / sold, 10);
    expect(total.figures.occupancy).toBeCloseTo(sold / available, 10);
    expect(total.figures.revpar).toBeCloseTo(revenue / available, 10);
    // El promedio de los dos ADR mensuales es 57,5; el ratio de sumas no.
    expect(total.figures.adr).not.toBeCloseTo(57.5, 3);
    // Y la identidad del módulo sobrevive al agregado.
    expect((total.figures.adr ?? 0) * (total.figures.occupancy ?? 0)).toBeCloseTo(
      total.figures.revpar ?? 0,
      10,
    );
  });

  it("coincide con la vista anual cuando el tramo ES el año", () => {
    const built = twoMonths();
    const grid = toAnnualGrid(built, "mensual");
    const agg = (id: string) => grid.rows.find((row) => row.id === id)?.agg ?? null;
    const [total] = reportTotals([built], wholeYear());
    expect(total.figures.revenue).toBe(agg("revenue"));
    expect(total.figures.occupancy).toBe(agg("occupancy"));
    expect(total.figures.adr).toBe(agg("adr"));
    expect(total.figures.revpar).toBe(agg("revpar"));
  });

  it("la capacidad de un mes sin ventas no entra en el denominador", () => {
    const built = emptyDataset(2026, "HOTEL AMBATO", { id: "centro", name: "Centro" });
    withMonth(built, 0, { available: 22, sold: 11, revenue: 627 });
    // Agosto: la plantilla del año, con disponibles y habitaciones pero sin ventas.
    built.months[7].fromFile = true;
    built.months[7].inputs.available = built.months[7].inputs.available.map(() => 22);
    built.months[7].inputs.rooms.simples = built.months[7].inputs.rooms.simples.map(() => 3);

    const [total] = reportTotals([built], wholeYear());
    expect(total.figures.occupancy).toBeCloseTo(0.5, 10);
  });

  it("acota al tramo, meses parciales incluidos", () => {
    const [total] = reportTotals(
      [twoMonths()],
      wholeYear({ period: rango(date(2026, 0, 0), date(2026, 0, 1)) }),
    );
    expect(total.figures.revenue).toBe(2 * 627);
  });

  it("un periodo sin datos cierra vacío, no en cero", () => {
    const [total] = reportTotals(
      [twoMonths()],
      wholeYear({ period: rango(date(2026, 7, 0), date(2026, 7, 30)) }),
    );
    expect(total.figures).toEqual({ revenue: null, occupancy: null, adr: null, revpar: null });
  });

  it("sobre días específicos cierra sobre esos días", () => {
    const [total] = reportTotals(
      [twoMonths()],
      wholeYear({ period: dias(date(2026, 0, 0), date(2026, 1, 0)) }),
    );
    expect(total.figures.revenue).toBe(627 + 728);
  });
});

describe("channelTotals", () => {
  it("une los canales por id pero guarda las noches de cada sucursal aparte", () => {
    const breakdown = channelTotals([A, B], query());
    expect(breakdown.channels).toEqual([{ id: "booking", name: "Booking", total: 8 }]);
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
    expect(breakdown.series[0].nights).toEqual([0, 4]);
    expect(breakdown.series[1].nights).toEqual([9, 0]);
  });

  it("se acota al periodo", () => {
    expect(channelTotals([A, B], query({ period: dias(date(2026, 0, 0)) })).total).toBe(8);
    expect(channelTotals([A, B], query({ period: dias(date(2026, 0, 1)) })).total).toBe(0);
  });
});

describe("weekdayRhythm", () => {
  it("reparte los días en su día de la semana empezando en lunes", () => {
    const { labels, series } = weekdayRhythm([A], query({ centerIds: ["a"] }));
    expect(labels[0]).toBe("Lun");
    // El 1 de enero de 2026 es jueves: ahí cae el único día con datos.
    expect(series[0].values[3]).toBeCloseTo(0.5, 10);
  });

  it("da una fila por sucursal en vez de fundirlas en un promedio", () => {
    const { series } = weekdayRhythm([A, B], query());
    expect(series.map((entry) => entry.label)).toEqual(["A", "B"]);
    expect(series[1].values[3]).toBeCloseTo(0.5, 10);
  });

  it("un día de la semana sin datos queda vacío", () => {
    const { series } = weekdayRhythm(
      [A],
      query({ centerIds: ["a"], period: rango(date(2026, 7, 0), date(2026, 7, 30)) }),
    );
    expect(series[0].values.every((value) => value === null)).toBe(true);
  });
});

describe("dayDetail", () => {
  it("dice todo lo que un día sabe de sí mismo", () => {
    const detail = dayDetail(A, 0, 0);
    expect(detail?.label).toBe("1 ene 2026");
    expect(detail?.indicators.find((i) => i.id === "occupancy")?.value).toBeCloseTo(0.5, 10);
    expect(detail?.channels).toEqual([{ id: "booking", name: "Booking", nights: 4 }]);
  });

  it("un día que el mes no tiene no existe", () => {
    expect(dayDetail(A, 1, 30)).toBeNull();
  });
});
