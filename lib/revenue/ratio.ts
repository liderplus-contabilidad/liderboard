/**
 * **THE definition of a ratio series** — a numerator over a denominator, month by month and over the
 * period — and the only one in the app. The three «vs» cards read it from here, and so do their table
 * twins, the capture drawer's live figures, the Excel and the printed report.
 *
 * **Rule (d): a percentage is only computed over the months where BOTH of its terms exist.** A month
 * with a denominator and no numerator belongs to NEITHER total; it is not a zero.
 *
 * This is the second correction the module makes over the source workbook, and the real file shows
 * exactly why it matters. July 2026 has sales ($241,844.03) and no card collection registered, so the
 * period's participation is Ene–Jun: $259,028.58 of $1,441,876.38, **18.0 %**. The workbook divides six
 * months of card against seven of sales and writes 15.4 %. The same defect gives it 2.53 % of
 * advertising instead of 3.0 %.
 *
 * The case that proves the diagnosis is the commission: it comes out at **5.0 %** in the workbook and
 * here alike, and it is precisely the one whose two terms cover the same six months. The defect was
 * never the arithmetic — it was the span.
 */
import { MONTHS_IN_YEAR } from "./types";

/** One month of the ratio. `percent` is in POINTS (`18.0`), never a 0–1 fraction. */
export interface RatioPoint {
  monthIndex: number;
  /** As captured or derived; `null` where the month has no figure. */
  numerator: number | null;
  denominator: number | null;
  /** `null` unless BOTH terms exist and the denominator is not zero. */
  percent: number | null;
}

export interface RatioReading {
  points: RatioPoint[];
  /** The months where both terms exist — the span the totals and the percentage were measured over. */
  sharedMonths: number[];
  /** The months the DENOMINATOR has but the numerator does not: what is missing to capture. It is
   *  what lets a card say «julio queda fuera» instead of silently shrinking its own period. */
  missingMonths: number[];
  numeratorTotal: number;
  denominatorTotal: number;
  /** The period's participation, in points. `null` when nothing is shared. */
  percent: number | null;
}

/**
 * Numerator over denominator, in points. One definition, so «qué porcentaje es esto» cannot be
 * answered two ways: `null` over a zero or absent denominator, because a share of nothing is not
 * zero and it is not infinite — it is undefined, and a bar drawn for it would invent a height.
 */
export function shareOf(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }
  return (numerator / denominator) * 100;
}

/**
 * The whole ratio reading. Both series arrive already narrowed to the marked months
 * (`scopeToMonths`), so the only thing decided here is which months carry BOTH terms.
 */
export function readRatio(
  numerator: readonly (number | null)[],
  denominator: readonly (number | null)[],
): RatioReading {
  const points: RatioPoint[] = [];
  const sharedMonths: number[] = [];
  const missingMonths: number[] = [];
  let numeratorTotal = 0;
  let denominatorTotal = 0;

  for (let month = 0; month < MONTHS_IN_YEAR; month++) {
    const num = numerator[month] ?? null;
    const den = denominator[month] ?? null;

    if (num !== null && den !== null) {
      sharedMonths.push(month);
      numeratorTotal += num;
      denominatorTotal += den;
    } else if (den !== null) {
      // The denominator is there and the numerator is not: the month is nameable as «falta
      // registrarlo», which is different from a month that is outside the period altogether.
      missingMonths.push(month);
    }

    points.push({
      monthIndex: month,
      numerator: num,
      denominator: den,
      // The per-month percentage follows the same rule as the period's: both terms, or nothing.
      percent: num !== null && den !== null ? shareOf(num, den) : null,
    });
  }

  return {
    points,
    sharedMonths,
    missingMonths,
    numeratorTotal,
    denominatorTotal,
    // Rule (d) in one line: the totals only ever accumulated over the shared months.
    percent: sharedMonths.length > 0 ? shareOf(numeratorTotal, denominatorTotal) : null,
  };
}
