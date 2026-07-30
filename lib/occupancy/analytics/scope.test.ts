import { describe, expect, it } from "vitest";
import {
  compareDates,
  daysInPeriod,
  isWholeMonth,
  orderedRange,
  periodCells,
  sameDate,
  yearsInPeriod,
} from "./scope";
import type { OccupancyPeriod } from "./types";

const date = (year: number, monthIndex: number, day: number) => ({ year, monthIndex, day });
const rango = (from: ReturnType<typeof date>, to: ReturnType<typeof date>): OccupancyPeriod => ({
  mode: "rango",
  range: { from, to },
});
const dias = (...days: ReturnType<typeof date>[]): OccupancyPeriod => ({
  mode: "comparar",
  picks: days.map((d) => ({ kind: "dia" as const, ...d })),
});
const meses = (...months: { year: number; monthIndex: number }[]): OccupancyPeriod => ({
  mode: "comparar",
  picks: months.map((m) => ({ kind: "mes" as const, ...m })),
});

describe("orden de fechas", () => {
  it("compara por año, luego mes, luego día", () => {
    expect(compareDates(date(2025, 11, 30), date(2026, 0, 0))).toBeLessThan(0);
    expect(compareDates(date(2026, 2, 5), date(2026, 2, 4))).toBeGreaterThan(0);
    expect(compareDates(date(2026, 2, 4), date(2026, 2, 4))).toBe(0);
    expect(sameDate(date(2026, 2, 4), date(2026, 2, 4))).toBe(true);
  });

  it("los extremos al revés son el mismo tramo", () => {
    const range = { from: date(2026, 3, 9), to: date(2026, 2, 19) };
    expect(orderedRange(range).from).toEqual(date(2026, 2, 19));
    expect(orderedRange(range).to).toEqual(date(2026, 3, 9));
  });
});

describe("periodCells · rango", () => {
  it("recorta los meses de los extremos y deja enteros los de en medio", () => {
    // Del 20 de marzo al 10 de mayo de 2026.
    const cells = periodCells(rango(date(2026, 2, 19), date(2026, 4, 9)));
    expect(cells.map((cell) => cell.monthIndex)).toEqual([2, 3, 4]);
    expect(cells[0].days).toHaveLength(12); // 20..31 de marzo
    expect(cells[1].days).toHaveLength(30); // abril entero
    expect(cells[2].days).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(isWholeMonth(cells[0])).toBe(false);
    expect(isWholeMonth(cells[1])).toBe(true);
  });

  it("un tramo dentro de un mes es una sola celda", () => {
    const cells = periodCells(rango(date(2026, 0, 4), date(2026, 0, 6)));
    expect(cells).toHaveLength(1);
    expect(cells[0].days).toEqual([4, 5, 6]);
  });

  it("puede cruzar años, y entonces el periodo toca los dos", () => {
    const period = rango(date(2025, 10, 0), date(2026, 1, 27));
    const cells = periodCells(period);
    expect(cells.map((cell) => `${cell.year}-${cell.monthIndex}`)).toEqual([
      "2025-10",
      "2025-11",
      "2026-0",
      "2026-1",
    ]);
    expect(yearsInPeriod(period)).toEqual([2025, 2026]);
  });

  it("febrero dura lo que el año le da", () => {
    const bisiesto = periodCells(rango(date(2028, 1, 0), date(2028, 1, 30)));
    expect(bisiesto[0].days).toHaveLength(29);
    const comun = periodCells(rango(date(2026, 1, 0), date(2026, 1, 30)));
    expect(comun[0].days).toHaveLength(28);
  });

  it("cuenta los días del tramo", () => {
    expect(daysInPeriod(rango(date(2026, 0, 0), date(2026, 0, 9)))).toBe(10);
    expect(daysInPeriod(rango(date(2026, 0, 0), date(2026, 11, 30)))).toBe(365);
  });
});

describe("periodCells · comparación de periodos", () => {
  it("un MES entero es UNA celda de todos sus días, no treinta columnas", () => {
    const cells = periodCells(meses({ year: 2026, monthIndex: 2 }));
    expect(cells).toHaveLength(1);
    expect(cells[0].days).toHaveLength(31);
    expect(isWholeMonth(cells[0])).toBe(true);
  });

  it("días y meses se ordenan juntos en la misma línea de tiempo", () => {
    const mixed: OccupancyPeriod = {
      mode: "comparar",
      picks: [
        { kind: "mes", year: 2026, monthIndex: 6 },
        { kind: "dia", year: 2026, monthIndex: 0, day: 4 },
      ],
    };
    const cells = periodCells(mixed);
    expect(cells.map((cell) => cell.monthIndex)).toEqual([0, 6]);
    expect(cells[0].days).toEqual([4]);
    expect(cells[1].days).toHaveLength(31);
  });

  it("un día y su mes son dos celdas: son dos periodos distintos", () => {
    const both: OccupancyPeriod = {
      mode: "comparar",
      picks: [
        { kind: "mes", year: 2026, monthIndex: 0 },
        { kind: "dia", year: 2026, monthIndex: 0, day: 0 },
      ],
    };
    expect(periodCells(both)).toHaveLength(2);
  });

  it("una celda por fecha, en orden de calendario", () => {
    const cells = periodCells(dias(date(2026, 2, 11), date(2025, 0, 4)));
    expect(cells.map((cell) => [cell.year, cell.monthIndex, cell.days[0]])).toEqual([
      [2025, 0, 4],
      [2026, 2, 11],
    ]);
  });

  it("la misma fecha dos veces es una sola columna", () => {
    expect(periodCells(dias(date(2026, 0, 4), date(2026, 0, 4)))).toHaveLength(1);
  });

  it("una fecha que no existe se descarta en vez de acercarse a otra", () => {
    // 30 de febrero de 2026 no existe.
    expect(periodCells(dias(date(2026, 1, 29)))).toEqual([]);
    expect(periodCells(dias(date(2028, 1, 28)))).toHaveLength(1);
  });

  it("cuenta un día por fecha", () => {
    expect(daysInPeriod(dias(date(2026, 0, 4), date(2026, 2, 11)))).toBe(2);
  });
});
