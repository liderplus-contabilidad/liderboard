/**
 * Synthetic fixtures for the analytics tests. They mirror the STRUCTURE of the real
 * accounting-system exports with invented data — tests must never depend on the git-ignored
 * `.context/` samples (same rule as `parse.fixtures.ts`).
 *
 * What is mirrored on purpose, because each one is a trap the engine has to survive:
 *
 * - Leaves at mixed depths: `4.1.8.4` is a leaf four segments deep while `4.1.1.1.1.1` is one
 *   six segments deep, reached through a redundant single-child chain.
 * - A negative income row (`4.1.4`, Rebajas y/o Descuentos sobre Ventas).
 * - A permanently-zero row (`4.1.1.6`, Ventas Teléfono) and a seasonal one that is zero only in
 *   February (`4.1.1.3`, Ventas Eventos) — the difference between "no movement" and a real 0.
 * - Two centers ~100× apart, like Cultura Manor against the Centro de Costo Principal.
 * - A year with movement only through July, like the real 2026 files.
 * - An annual-base source, like «Sin centro de costo».
 * - A statement already split by «Segmentar gastos», where root 6 exists beside root 5.
 *
 * Parent rows are left at zero: `computeRollups` recomputes them from the leaves, so writing
 * the sums here would duplicate the derivation instead of exercising it.
 */
import type { AccountRow, CellEdit, Frequency, PygDataset } from "../types";
import { periodsForYear } from "./period";
import { buildAnalyticsSource } from "./source";
import type { AnalyticsSource, Series, SeriesPoint } from "./types";

interface ChartRow {
  code: string;
  name: string;
  /** Monthly amount for a leaf; parents carry no amount (rollups produce theirs). */
  amount?: number;
}

/**
 * The chart of accounts, in file order (an ancestor always precedes its descendants, which is
 * what `buildAccountTree` needs). Monthly amounts roll up to: 4.1.1 = 24.465, 4 = 25.229,
 * 5.1.5 = 11.121, 5 = 20.121.
 */
const CHART: ChartRow[] = [
  { code: "4", name: "Ingresos" },
  { code: "4.1", name: "Ventas" },
  { code: "4.1.1", name: "Ventas Alojamiento y Servicios" },
  { code: "4.1.1.1", name: "Habitaciones" },
  { code: "4.1.1.1.1", name: "Habitaciones Estándar" },
  { code: "4.1.1.1.1.1", name: "Ventas Habitaciones", amount: 17338 },
  { code: "4.1.1.2", name: "Ventas Restaurante", amount: 6500 },
  { code: "4.1.1.3", name: "Ventas Eventos", amount: 300 },
  { code: "4.1.1.5", name: "Ventas Lavandería", amount: 327 },
  { code: "4.1.1.6", name: "Ventas Teléfono", amount: 0 },
  { code: "4.1.4", name: "Rebaja y/o Descuentos sobre Ventas", amount: -507 },
  { code: "4.1.8", name: "Otros Servicios" },
  { code: "4.1.8.4", name: "Servicio de Lavandería Externa", amount: 1271 },
  { code: "5", name: "Costos y Gastos" },
  { code: "5.1", name: "Gastos Operacionales" },
  { code: "5.1.1", name: "Gastos de Personal" },
  { code: "5.1.1.1", name: "Sueldos" },
  { code: "5.1.1.1.1", name: "Sueldo Básico", amount: 9000 },
  { code: "5.1.5", name: "Gastos Generales" },
  { code: "5.1.5.3", name: "Publicidad", amount: 2411 },
  { code: "5.1.5.7", name: "Mantenimiento", amount: 590 },
  { code: "5.1.5.9", name: "Consumo Suministros de Vajilla", amount: 120 },
  { code: "5.1.5.12", name: "Arrendamiento Operativo", amount: 8000 },
];

/**
 * The non-operating branch and the root 6 «Segmentar gastos» copies out of it, appended ONLY by
 * `segmented: true`. They stay out of the shared chart on purpose: adding them would move the
 * rollups of root 5 that every other test asserts against.
 *
 * The pair is shown ALREADY SPLIT, which is the state the app persists — `5.2.1.1` keeps 550 of
 * the 1.450 it was uploaded with and root 6 holds the 900 reclassified out of it, so the two
 * still add up to what the file brought. `5.2.1.2` was never reclassified, so its twin is zero.
 */
const SEGMENTED_CHART: ChartRow[] = [
  { code: "5.2", name: "Gastos No Operacionales" },
  { code: "5.2.1", name: "Gastos Financieros" },
  { code: "5.2.1.1", name: "Intereses Bancarios", amount: 550 },
  { code: "5.2.1.2", name: "Comisiones Bancarias", amount: 230 },
  { code: "6", name: "Gastos No Operacionales" },
  { code: "6.1", name: "Gastos Financieros" },
  { code: "6.1.1", name: "Intereses Bancarios", amount: 900 },
  { code: "6.1.2", name: "Comisiones Bancarias", amount: 0 },
];

/** The hotel books no events in February; every other covered month has them. */
const SEASONAL_CODE = "4.1.1.3";
const SEASONAL_GAP_MONTH = 1;

export interface DatasetOptions {
  centerId?: string;
  centerName?: string;
  year?: number;
  /** Months with movement, from January. 7 mirrors the real 2026 files (Ene–Jul); 0 = empty file. */
  months?: number;
  /** Scales every leaf. 0.01 mirrors the ~100× gap between the real centers. */
  scale?: number;
  /** Codes the center does not report at all. */
  omit?: string[];
  /** "anual" collapses the year into a single Total column, like «Sin centro de costo». */
  baseFrequency?: Frequency;
  /** Appends the 5.2 branch and the root 6 already split out of it. */
  segmented?: boolean;
}

/** A synthetic `PygDataset` over the shared chart — the input `buildAnalyticsSource` consumes. */
export function makeDataset(options: DatasetOptions = {}): PygDataset {
  const {
    centerId = "cultura-manor",
    centerName = "Cultura Manor",
    year = 2026,
    months = 7,
    scale = 1,
    omit = [],
    baseFrequency = "mensual",
    segmented = false,
  } = options;

  const chart = segmented ? [...CHART, ...SEGMENTED_CHART] : CHART;
  const accounts: AccountRow[] = chart
    .filter((row) => !omit.includes(row.code))
    .map((row) => {
      const monthly = monthlyValues(row, months, scale);
      return {
        code: row.code,
        name: row.name,
        values: baseFrequency === "anual" ? [sum(monthly)] : monthly,
      };
    });

  return {
    id: `${centerId}-${year}`,
    clientId: "cliente-de-prueba",
    fileName: `${centerId}-${year}.xlsx`,
    uploadedAt: 0,
    companyName: "NOMIK HOTELES S.A.S.",
    periodLabel: `Ene–Dic ${year}`,
    year,
    baseFrequency,
    role: "center",
    centerId,
    costCenterName: centerName,
    accounts,
    resultFromFile: [],
    warnings: [],
  };
}

function monthlyValues(row: ChartRow, months: number, scale: number): number[] {
  return Array.from({ length: 12 }, (_, month) => {
    if (row.amount === undefined || month >= months) {
      return 0;
    }
    if (row.code === SEASONAL_CODE && month === SEASONAL_GAP_MONTH) {
      return 0;
    }
    return row.amount * scale;
  });
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Shorthand for `buildAnalyticsSource(makeDataset(...))`, the shape most tests want. */
export function makeSource(options: DatasetOptions = {}, edits: CellEdit[] = []): AnalyticsSource {
  return buildAnalyticsSource(makeDataset(options), edits);
}

/** Movement Ene–Jul 2026, like the real files. */
export const CULTURA_MANOR = makeDataset();

/** The same center a year earlier, with the full twelve months — for the year axis. */
export const CULTURA_MANOR_2025 = makeDataset({ year: 2025, months: 12 });

/** ~100× smaller and missing Ventas Lavandería, so normalization and absences have a case. */
export const CENTRO_PRINCIPAL = makeDataset({
  centerId: "centro-de-costo-principal",
  centerName: "Centro de Costo Principal",
  scale: 0.01,
  omit: ["4.1.1.5"],
});

/** Annual base: it cannot be broken down into months, only read as a Total. */
export const SIN_CENTRO = makeDataset({
  centerId: "sin-centro",
  centerName: "Sin centro de costo",
  baseFrequency: "anual",
});

/** Every value at zero — the "wrong file loaded" case; its coverage must come out empty. */
export const CENTRO_VACIO = makeDataset({
  centerId: "centro-vacio",
  centerName: "Centro Vacío",
  months: 0,
});

/** Already split: root 6 exists, so the expense side has TWO roots instead of one. */
export const CULTURA_MANOR_SEGMENTADO = makeDataset({ segmented: true });

export const CULTURA_MANOR_SOURCE = buildAnalyticsSource(CULTURA_MANOR);
export const CULTURA_MANOR_2025_SOURCE = buildAnalyticsSource(CULTURA_MANOR_2025);
export const CENTRO_PRINCIPAL_SOURCE = buildAnalyticsSource(CENTRO_PRINCIPAL);
export const SIN_CENTRO_SOURCE = buildAnalyticsSource(SIN_CENTRO);
export const CENTRO_VACIO_SOURCE = buildAnalyticsSource(CENTRO_VACIO);
export const CULTURA_MANOR_SEGMENTADO_SOURCE = buildAnalyticsSource(CULTURA_MANOR_SEGMENTADO);

export interface SeriesOptions {
  code?: string;
  centerId?: string;
  year?: number;
  frequency?: Frequency;
  label?: string;
  /** Container values, index-aligned with `values`; omit for a root account. */
  container?: (number | null)[];
  containerCode?: string;
}

/**
 * A `Series` straight from literal values — the transformations are tested against these
 * rather than against a whole workspace, which is the point of materialized sources.
 */
export function makeSeries(values: (number | null)[], options: SeriesOptions = {}): Series {
  const {
    code = "4.1.1.1",
    centerId = "cultura-manor",
    year = 2026,
    frequency = "mensual",
    label = "Habitaciones",
    container,
    containerCode = "4.1.1",
  } = options;

  const periods = periodsForYear(year, frequency);
  const pointsFrom = (source: (number | null)[]): SeriesPoint[] =>
    source.map((value, index) => ({
      period: periods[index] ?? { year, frequency, index },
      value,
    }));

  return {
    key: { code, centerId, year },
    label,
    points: pointsFrom(values),
    container: container
      ? {
          code: containerCode,
          label: "Ventas Alojamiento y Servicios",
          points: pointsFrom(container),
        }
      : null,
  };
}
