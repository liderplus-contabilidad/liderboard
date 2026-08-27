import { describe, expect, it } from "vitest";
import { emptyDataset } from "../derive";
import type { OccupancyDataset } from "../types";
import { buildOccupancyEvolution, buildOccupancySeries } from "./series";
import type { DateRef, OccupancyPeriod, OccupancyQuery } from "./types";

/** A sucursal-year with the given months filled at a flat figure per day. */
function dataset(
  centerId: string,
  year: number,
  months: readonly number[],
  perDay = { available: 10, sold: 5, revenue: 500 },
): OccupancyDataset {
  const built = emptyDataset(year, "HOTEL A", { id: centerId, name: centerId.toUpperCase() });
  for (const index of months) {
    const month = built.months[index];
    month.fromFile = true;
    month.inputs.available = month.inputs.available.map(() => perDay.available);
    month.inputs.sold = month.inputs.sold.map(() => perDay.sold);
    month.inputs.revenue = month.inputs.revenue.map(() => perDay.revenue);
  }
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
  metric: "revenue",
  centerIds: ["manor"],
  period: rango(date(2026, 0, 0), date(2026, 11, 30)),
  scope: "mensual",
  ...over,
});

const MANOR = dataset("manor", 2026, [0, 1, 2]);
const MANOR_2025 = dataset("manor", 2025, [0, 1, 2]);
const NORTE = dataset("norte", 2026, [0, 1, 2]);

describe("buildOccupancySeries · una serie por sucursal", () => {
  it("la serie es la sucursal: el año viaja en el periodo", () => {
    const bundle = buildOccupancySeries([MANOR, NORTE], query({ centerIds: ["manor", "norte"] }));
    expect(bundle.series.map((entry) => entry.label)).toEqual(["MANOR", "NORTE"]);
    expect(bundle.series[0].key).toEqual({ centerId: "manor" });
  });

  it("respeta el tope de series y dice cuántas omitió", () => {
    const many = Array.from({ length: 3 }, (_, i) => dataset(`c${i}`, 2026, [0]));
    const bundle = buildOccupancySeries(
      many,
      query({ centerIds: many.map((d) => d.centerId), limit: 2 }),
    );
    expect(bundle.series).toHaveLength(2);
    expect(bundle.truncated).toBe(1);
    expect(bundle.warnings).toHaveLength(1);
  });
});

describe("buildOccupancySeries · rango", () => {
  it("el eje son los meses que el tramo toca", () => {
    const bundle = buildOccupancySeries(
      [MANOR],
      query({ period: rango(date(2026, 0, 0), date(2026, 2, 4)) }),
    );
    expect(bundle.axis.map((point) => point.label)).toEqual(["Ene", "Feb", "Mar"]);
  });

  it("los meses de los extremos son PARCIALES", () => {
    // From 21 January to 5 March: 11 days of January, 28 of February, 5 of March.
    const bundle = buildOccupancySeries(
      [MANOR],
      query({ period: rango(date(2026, 0, 20), date(2026, 2, 4)) }),
    );
    expect(bundle.series[0].values).toEqual([11 * 500, 28 * 500, 5 * 500]);
  });

  it("cruza años y el eje lo dice en la etiqueta", () => {
    const bundle = buildOccupancySeries(
      [MANOR, MANOR_2025],
      query({ period: rango(date(2025, 11, 0), date(2026, 1, 27)) }),
    );
    expect(bundle.axis.map((point) => point.label)).toEqual(["Dic 25", "Ene 26", "Feb 26"]);
    // December 2025 has no data; January and February 2026 do.
    expect(bundle.series[0].values[0]).toBeNull();
    expect(bundle.series[0].values[1]).toBe(31 * 500);
  });

  it("por días, el eje son los días del tramo y nada más", () => {
    const bundle = buildOccupancySeries(
      [MANOR],
      query({ period: rango(date(2026, 0, 28), date(2026, 1, 1)), scope: "dia" }),
    );
    expect(bundle.axis.map((point) => point.label)).toEqual([
      "29 ene",
      "30 ene",
      "31 ene",
      "1 feb",
      "2 feb",
    ]);
  });

  it("por trimestre, un T1 de cada año es su propia columna", () => {
    const bundle = buildOccupancySeries(
      [MANOR, MANOR_2025],
      query({ period: rango(date(2025, 0, 0), date(2026, 2, 30)), scope: "trimestral" }),
    );
    expect(bundle.axis.map((point) => point.label)).toEqual([
      "T1 25",
      "T2 25",
      "T3 25",
      "T4 25",
      "T1 26",
    ]);
  });

  it("por año, la etiqueta ES el año", () => {
    const bundle = buildOccupancySeries(
      [MANOR, MANOR_2025],
      query({ period: rango(date(2025, 0, 0), date(2026, 11, 30)), scope: "anual" }),
    );
    expect(bundle.axis.map((point) => point.label)).toEqual(["2025", "2026"]);
  });

  it("los indicadores son ratio de las sumas del tramo", () => {
    const bundle = buildOccupancySeries(
      [MANOR],
      query({ period: rango(date(2026, 0, 0), date(2026, 0, 1)), metric: "adr" }),
    );
    expect(bundle.series[0].values[0]).toBeCloseTo(100, 10);
  });

  it("un mes sin ventas no dibuja punto", () => {
    const bundle = buildOccupancySeries([MANOR], query());
    expect(bundle.series[0].values[0]).toBe(31 * 500);
    expect(bundle.series[0].values[5]).toBeNull();
  });
});

describe("buildOccupancySeries · días específicos", () => {
  it("una columna por fecha, aunque sean de años distintos", () => {
    const bundle = buildOccupancySeries(
      [MANOR, MANOR_2025],
      query({ period: dias(date(2025, 0, 4), date(2026, 2, 11)) }),
    );
    expect(bundle.axis.map((point) => point.label)).toEqual(["5 ene 25", "12 mar 26"]);
    expect(bundle.series[0].values).toEqual([500, 500]);
  });

  it("el eje es diario aunque «Ver por» diga otra cosa: una fecha es un día", () => {
    const bundle = buildOccupancySeries(
      [MANOR],
      query({ period: dias(date(2026, 0, 4)), scope: "anual" }),
    );
    expect(bundle.axis).toHaveLength(1);
    expect(bundle.axis[0].label).toBe("5 ene");
  });

  it("una fecha sin datos queda vacía, no en cero", () => {
    const bundle = buildOccupancySeries([MANOR], query({ period: dias(date(2026, 7, 4)) }));
    expect(bundle.series[0].values).toEqual([null]);
  });
});

describe("buildOccupancyEvolution", () => {
  const FIGURES = ["revenue", "occupancy", "adr", "revpar"] as const;

  it("da un panel por cifra, todos sobre el MISMO eje", () => {
    const evolution = buildOccupancyEvolution([MANOR], query(), FIGURES);
    expect(evolution.panels.map((panel) => panel.metric.id)).toEqual([...FIGURES]);
    for (const panel of evolution.panels) {
      expect(panel.axis).toEqual(evolution.axis);
    }
  });

  it("el aviso del tope se dice una vez, no cuatro", () => {
    const many = Array.from({ length: 3 }, (_, i) => dataset(`c${i}`, 2026, [0]));
    const evolution = buildOccupancyEvolution(
      many,
      query({ centerIds: many.map((d) => d.centerId), limit: 2 }),
      FIGURES,
    );
    expect(evolution.warnings).toHaveLength(1);
  });
});
