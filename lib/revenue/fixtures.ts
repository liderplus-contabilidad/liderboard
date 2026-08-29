/**
 * The REAL figures of `REPORTE DE VENTAS COMPARATIVO 2026.xlsx` — Hospital General Privado Durán,
 * cliente MicroPlus — used by this module's tests.
 *
 * They are the actual workbook's, not invented ones, and that is the point: what these tests defend
 * is that the app's arithmetic differs from the workbook's exactly where it was meant to and nowhere
 * else. A fixture of round numbers would pass every one of them while hiding the four corrections the
 * module exists to make.
 *
 * 2025 is deliberately ABSENT rather than zero: in the workbook its whole column is `#REF!`, and the
 * distinction between «no llegó» and «llegó en cero» is what half this module rests on.
 */
import {
  emptyMonthSeries,
  MONTHS_IN_YEAR,
  type RevenueExternalSeries,
  type RevenueYearInput,
} from "./types";

/** A twelve-slot series from the months that exist; the rest read `null`. */
function months(values: readonly number[]): (number | null)[] {
  return Array.from({ length: MONTHS_IN_YEAR }, (_, index) => values[index] ?? null);
}

/** Hoja «COMPARATIVO VENTAS 2015-2026», columna de cada año. */
export const REVENUE_2022 = months([
  165445.19, 123147.26, 89735.46, 149787.49, 106202.61, 87512.66, 157486.35, 156668.91, 104108.62,
  213795.0, 108462.25, 115309.45,
]);

export const REVENUE_2023 = months([
  130156.71, 136638.4, 127834.95, 136265.55, 176496.77, 163282.99, 83735.94, 157821.81, 69445.49,
  154032.49, 88304.74, 184263.02,
]);

export const REVENUE_2024 = months([
  91973.4, 114336.33, 190310.95, 104025.2, 135123.52, 132542.34, 209219.41, 162860.23, 170315.19,
  247997.17, 157265.37, 199498.79,
]);

/** Only Ene–Jul arrived: agosto a diciembre no son ceros, no existen. */
export const REVENUE_2026 = months([
  247053.11, 214900.91, 230479.64, 337092.91, 191973.21, 220376.6, 241844.03,
]);

/**
 * Lo capturado de 2026 — hojas «T.C. VS VENTAS», «COMIS TC VS COB TC» y «FACEBOOK VS VENTAS».
 *
 * Llega hasta JUNIO, un mes menos que la venta. Ese desfase es el caso que la regla (d) existe para
 * resolver, y por eso la fixture lo conserva.
 */
export const EXTERNAL_2026: RevenueExternalSeries = {
  cardRevenue: months([31850.7, 33005.26, 49065.46, 46085.43, 49372.19, 49649.54]),
  cardFees: months([1273.23, 2093.89, 2645.34, 1943.63, 2208.1, 2763.86]),
  adSpend: months([4398.1, 4272.74, 7178.6, 9785.92, 8367.3, 8605.5]),
};

/** A year with nothing captured — every year but 2026 in the real file. */
export function noExternal(): RevenueExternalSeries {
  return {
    cardRevenue: emptyMonthSeries(),
    cardFees: emptyMonthSeries(),
    adSpend: emptyMonthSeries(),
  };
}

export function yearInput(year: number, monthlyRevenue: (number | null)[]): RevenueYearInput {
  return {
    year,
    monthlyRevenue,
    external: year === 2026 ? EXTERNAL_2026 : noExternal(),
  };
}

/** The four loaded years of the real client, ascending. 2025 is not among them. */
export function loadedYears(): RevenueYearInput[] {
  return [
    yearInput(2022, REVENUE_2022),
    yearInput(2023, REVENUE_2023),
    yearInput(2024, REVENUE_2024),
    yearInput(2026, REVENUE_2026),
  ];
}

/** Every month of the year — the span when no month is marked and every year is loaded. */
export const ALL_MONTHS = Array.from({ length: MONTHS_IN_YEAR }, (_, index) => index);
