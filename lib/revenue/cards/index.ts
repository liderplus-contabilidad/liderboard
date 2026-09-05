/**
 * The screen's SIX readings, described as DATA (`option` + `table`) and not as markup: the year
 * comparison, the annual reading, the growth against previous years, and the three ratios.
 *
 * That they are data is what lets the printable report read EXACTLY the same construction as the
 * screen instead of rebuilding its figures. Two computations of the same question drift apart and
 * nothing downstream can say which of the two numbers is right — which is the very defect this module
 * exists to correct in the workbook it replaces.
 *
 * **Nothing here computes a percentage or a growth.** Those live in `../ratio.ts` and `../growth.ts`,
 * and the builders ask them. A builder that did its own division would be the second definition, and
 * the second definition is how the source workbook ended up with four different wrong numbers.
 *
 * **This directory is one file per reading, and `chrome.ts` is what they share.** It was a single
 * 1.244-line module, which is how the growth's axis and the growth's own note ended up naming two
 * different tramos with nobody noticing. `index.ts` is the only public door: `@/lib/revenue/cards`
 * resolves here, so no consumer knows the split happened.
 */
import type { ChartCardSpec, Chart3DOption, ChartOption } from "@/lib/charts/types";
import { monthSpanLabel } from "../filters";
import { readRevenueYears, referenceYearOf, type RevenueYearReading } from "../derive";
import type { GrowthAgainstYear } from "../growth";
import { RATIO_DESCRIPTORS } from "../series";
import type { RevenueCardsInput } from "../types";
import { buildAnnualCard, DEFAULT_ANNUAL_SHAPE, type AnnualShape } from "./annual";
import {
  buildComparisonCard,
  DEFAULT_COMPARISON_SHAPE,
  skylineAvailableFor,
  type ComparisonShape,
} from "./comparison";
import { buildGrowthCard, DEFAULT_GROWTH_UNIT, growthOf, type GrowthUnit } from "./growth";
import { buildRatioCard } from "./ratio";

export { ANNUAL_CARD_ID, buildAnnualCard, DEFAULT_ANNUAL_SHAPE, type AnnualShape } from "./annual";
export {
  buildComparisonCard,
  COMPARISON_CARD_ID,
  DEFAULT_COMPARISON_SHAPE,
  flatComparisonCard,
  skylineAvailableFor,
  type ComparisonShape,
} from "./comparison";
export { buildGrowthCard, DEFAULT_GROWTH_UNIT, GROWTH_CARD_ID, type GrowthUnit } from "./growth";
export { buildRatioCard } from "./ratio";
/** Re-exported from its home in `types.ts`, so `@/lib/revenue/cards` keeps being where a consumer
 *  finds it. It lives there and not here because all five builders need it and importing it back
 *  from this file —which imports them— would be a cycle. */
export type { RevenueCardsInput } from "../types";

export interface RevenueCardsOptions {
  /** The screen's «Ver en»; the paper prints both and passes neither. */
  growthUnit?: GrowthUnit;
  /** The comparison's «Ver como». Omitted, it is flat — see `DEFAULT_COMPARISON_SHAPE`. */
  comparisonShape?: ComparisonShape;
  /** The annual card's «Ver como». Omitted, it is the total. */
  annualShape?: AnnualShape;
}

export interface RevenueCards {
  comparison: ChartCardSpec<ChartOption | Chart3DOption>;
  /** Whether the skyline can be offered at all: it needs a depth axis, so two years at least. */
  skylineAvailable: boolean;
  annual: ChartCardSpec;
  growth: ChartCardSpec;
  /** Empty where the workspace cannot capture: the cards are NOT DRAWN, not drawn disabled. */
  ratios: ChartCardSpec[];
  /**
   * The workspace CAN capture and not one marked year has anything captured — so all three ratio
   * cards would draw nothing.
   *
   * It is computed here and not in the view because it is a statement about the readings, and the
   * house rule is that logic worth a test belongs in `lib/`. What the screen does with it is replace
   * three empty ~200px cards with ONE block that says what is missing: three empty boxes do not
   * inform three times, and the reader cannot tell an empty card from a broken one.
   *
   * It is deliberately NOT true when only SOME marked years are missing figures — that case is
   * already answered, on the card and by name, by `idleYearsNote`.
   */
  ratiosIdle: boolean;
}

export function buildRevenueCards(
  input: RevenueCardsInput,
  options: RevenueCardsOptions = {},
): RevenueCards {
  const ratios = input.canCapture
    ? RATIO_DESCRIPTORS.map((descriptor) => buildRatioCard(descriptor, input))
    : [];

  return {
    comparison: buildComparisonCard(input, options.comparisonShape ?? DEFAULT_COMPARISON_SHAPE),
    skylineAvailable: skylineAvailableFor(input),
    annual: buildAnnualCard(input, options.annualShape ?? DEFAULT_ANNUAL_SHAPE),
    growth: buildGrowthCard(input, options.growthUnit ?? DEFAULT_GROWTH_UNIT),
    ratios,
    // Every one of them has nothing to draw.
    ratiosIdle: ratios.length > 0 && ratios.every((card) => card.option === null),
  };
}

// ---------------------------------------------------------------------------
// The header's four figures
// ---------------------------------------------------------------------------

export interface RevenueSummary {
  /** The most recent marked year — the subject of every tile. */
  reference: RevenueYearReading | null;
  /** «Ene–Jul · 7 de 12 meses cargados». */
  coverage: string | null;
  /** Against the immediately previous MARKED year, over the span the two share. */
  previous: GrowthAgainstYear | null;
}

export function readRevenueSummary(input: RevenueCardsInput): RevenueSummary {
  const readings = readRevenueYears(input.years, input.months);
  const reference = referenceYearOf(readings);
  if (!reference) {
    return { reference: null, coverage: null, previous: null };
  }
  const bases = readings.slice(0, -1);
  // The tile compares against the year immediately before it, which is the question a reader asks
  // first; the card below compares against all of them.
  const previous = bases.length > 0 ? growthOf(reference, bases.slice(-1))[0] : null;
  const span = monthSpanLabel(reference.loadedMonths);
  return {
    reference,
    coverage: span ? `${span} · ${reference.loadedMonths.length} de 12 meses cargados` : null,
    previous: previous ?? null,
  };
}
