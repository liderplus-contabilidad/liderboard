/**
 * Determines the section of a row in the financial statement and its tone.
 * The tone indicates whether the row belongs to income, costs/expenses, or non-operational blocks.
 * Only applies up to LEVEL 2; deeper levels remain uncolored.
 * Colors are defined in `@theme` in `app/globals.css` (`--color-section-*`).
 */
import { rootSign } from "./derive";
import { isNonOperationalCode } from "./segment";

/** Maximum level for tone application. Levels 3+ are uncolored. */
export const SECTION_TONE_DEPTH = 2;

/**
 * Tailwind classes for row tones. Classes are literal to ensure Tailwind includes them in the CSS.
 * Includes hover states for rows and sticky cells, and static tones for printed reports.
 */
const TONES = {
  income: [
    {
      row: "bg-section-income hover:bg-section-income-hover",
      sticky: "bg-section-income group-hover:bg-section-income-hover",
      print: "bg-section-income",
    },
    {
      row: "bg-section-income-sub hover:bg-section-income-sub-hover",
      sticky: "bg-section-income-sub group-hover:bg-section-income-sub-hover",
      print: "bg-section-income-sub",
    },
  ],
  cost: [
    {
      row: "bg-section-cost hover:bg-section-cost-hover",
      sticky: "bg-section-cost group-hover:bg-section-cost-hover",
      print: "bg-section-cost",
    },
    {
      row: "bg-section-cost-sub hover:bg-section-cost-sub-hover",
      sticky: "bg-section-cost-sub group-hover:bg-section-cost-sub-hover",
      print: "bg-section-cost-sub",
    },
  ],
  other: [
    {
      row: "bg-section-other hover:bg-section-other-hover",
      sticky: "bg-section-other group-hover:bg-section-other-hover",
      print: "bg-section-other",
    },
    {
      row: "bg-section-other-sub hover:bg-section-other-sub-hover",
      sticky: "bg-section-other-sub group-hover:bg-section-other-sub-hover",
      print: "bg-section-other-sub",
    },
  ],
} as const satisfies Record<string, readonly SectionTone[]>;

export type SectionId = keyof typeof TONES;

export interface SectionTone {
  /** Row background class. */
  row: string;
  /** Sticky cell background class. */
  sticky: string;
  /** Static background for printed reports. */
  print: string;
}

/**
 * Determines the section of a code based on its root.
 * Relies on `rootSign` and `isNonOperationalCode` for classification.
 * Returns `null` for codes outside defined sections.
 */
export function sectionOf(code: string): SectionId | null {
  if (isNonOperationalCode(code)) {
    return "other";
  }
  const sign = rootSign(code);
  return sign === 1 ? "income" : sign === -1 ? "cost" : null;
}

/**
 * Returns the tone for a row or `null` if no tone applies.
 * No tone is applied to result rows, levels deeper than `SECTION_TONE_DEPTH`, or undefined sections.
 */
export function sectionTone(code: string, level: number, isResult = false): SectionTone | null {
  if (isResult || level > SECTION_TONE_DEPTH || level < 1) {
    return null;
  }
  const section = sectionOf(code);
  return section ? TONES[section][Math.trunc(level) - 1] : null;
}
