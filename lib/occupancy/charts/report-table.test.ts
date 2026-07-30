import { describe, expect, it } from "vitest";
import { reportTotals } from "../analytics/breakdown";
import { buildOccupancyEvolution } from "../analytics/series";
import { emptyDataset } from "../derive";
import type { DateRef, OccupancyPeriod, OccupancyQuery } from "../analytics/types";
import type { OccupancyDataset } from "../types";
import { MONTHLY_COLUMNS } from "./option";
import { buildReportTable } from "./report-table";

function dataset(centerId: string, months: readonly number[]): OccupancyDataset {
  const built = emptyDataset(2026, "HOTEL A", { id: centerId, name: centerId.toUpperCase() });
  for (const index of months) {
    const month = built.months[index];
    month.fromFile = true;
    month.inputs.available = month.inputs.available.map(() => 10);
    month.inputs.sold = month.inputs.sold.map(() => 5);
    month.inputs.revenue = month.inputs.revenue.map(() => 500);
  }
  return built;
}

const date = (monthIndex: number, day: number, year = 2026): DateRef => ({ year, monthIndex, day });
const wholeYear: OccupancyPeriod = { mode: "rango", range: { from: date(0, 0), to: date(11, 30) } };
const FIGURES = MONTHLY_COLUMNS.map((column) => column.id);

const query = (over: Partial<OccupancyQuery> = {}): OccupancyQuery => ({
  metric: "occupancy",
  centerIds: ["manor"],
  period: wholeYear,
  scope: "mensual",
  ...over,
});

const MANOR = dataset("manor", [0, 1]);
const NORTE = dataset("norte", [0]);

function table(datasets: OccupancyDataset[], q: OccupancyQuery) {
  return buildReportTable(
    buildOccupancyEvolution(datasets, q, FIGURES),
    reportTotals(datasets, q),
    MONTHLY_COLUMNS,
  );
}

describe("buildReportTable", () => {
  it("una fila por columna del eje, con su misma etiqueta", () => {
    const [built] = table([MANOR], query());
    expect(built.rows).toHaveLength(12);
    expect(built.rows.map((row) => row.label).slice(0, 3)).toEqual(["Ene", "Feb", "Mar"]);
  });

  it("las cuatro cifras de cada fila, en el orden declarado", () => {
    const [built] = table([MANOR], query());
    const enero = built.rows[0];
    expect(enero.covered).toBe(true);
    expect(enero.figures.revenue).toBe(31 * 500);
    expect(enero.figures.occupancy).toBeCloseTo(0.5, 10);
    expect(enero.figures.adr).toBeCloseTo(100, 10);
    expect(enero.figures.revpar).toBeCloseTo(50, 10);
  });

  it("una columna sin datos queda vacía en las cuatro, no en cero", () => {
    const [built] = table([MANOR], query());
    const marzo = built.rows[2];
    expect(marzo.covered).toBe(false);
    expect([
      marzo.figures.revenue,
      marzo.figures.occupancy,
      marzo.figures.adr,
      marzo.figures.revpar,
    ]).toEqual([null, null, null, null]);
  });

  it("el cierre es el del periodo, no el promedio de las filas", () => {
    const [built] = table([MANOR], query());
    const revenue = (31 + 28) * 500;
    expect(built.total.revenue).toBe(revenue);
    expect(built.total.adr).toBeCloseTo(100, 10);
    // Y la identidad del módulo sobrevive.
    expect((built.total.adr ?? 0) * (built.total.occupancy ?? 0)).toBeCloseTo(
      built.total.revpar ?? 0,
      10,
    );
  });

  it("una tabla por sucursal, con su nombre y su clave", () => {
    const tables = table([MANOR, NORTE], query({ centerIds: ["manor", "norte"] }));
    expect(tables.map((entry) => entry.label)).toEqual(["MANOR", "NORTE"]);
    expect(tables[1].key).toEqual({ centerId: "norte" });
    // Norte solo tiene enero: febrero queda vacío en su tabla y no en la de Manor.
    expect(tables[1].rows[1].covered).toBe(false);
    expect(tables[0].rows[1].covered).toBe(true);
  });

  it("las filas siguen el eje que manda «Ver por»", () => {
    const [porTrimestre] = table([MANOR], query({ scope: "trimestral" }));
    expect(porTrimestre.rows.map((row) => row.label)).toEqual(["T1", "T2", "T3", "T4"]);
    const [porDia] = table(
      [MANOR],
      query({
        scope: "dia",
        period: { mode: "rango", range: { from: date(0, 0), to: date(0, 2) } },
      }),
    );
    expect(porDia.rows.map((row) => row.label)).toEqual(["1 ene", "2 ene", "3 ene"]);
  });

  it("sobre días específicos, una fila por fecha", () => {
    const [built] = table(
      [MANOR],
      query({
        period: {
          mode: "comparar",
          picks: [
            { kind: "dia", ...date(0, 4) },
            { kind: "dia", ...date(1, 9) },
          ],
        },
      }),
    );
    expect(built.rows.map((row) => row.label)).toEqual(["5 ene", "10 feb"]);
  });

  it("sin series no inventa tablas", () => {
    expect(table([MANOR], query({ centerIds: [] }))).toEqual([]);
  });
});
