/**
 * The printable report: which sections it carries, in what order and what its header writes. Pure —it
 * computes no figure of its own— and therefore testable without mounting a chart.
 *
 * **They are the SAME cards as the screen's**, built from the same `RevenueCardsInput` with the
 * user's same marks. That is the only thing guaranteeing the paper cannot state a figure the screen
 * does not: a second derivation of the growth could drift from the first with nothing giving it away,
 * and whoever receives the PDF no longer has the screen beside them to check against.
 *
 * **On paper there are no controls.** A printed toggle is a button nobody can press, so the report
 * ignores «Ver en», «Cifra» and «Ver como» and prints BOTH figures of the annual reading and BOTH
 * units of the growth, always in the only body paper has. What on screen is a choice is on paper simply two sections.
 */
import { flatOnly, type ChartCardSpec } from "@/lib/charts/types";
import { formatTimestampEs } from "@/lib/date";
import type { EntityLogo } from "@/lib/workspaces";
import {
  buildAnnualCard,
  flatComparisonCard,
  buildGrowthCard,
  buildRatioCard,
  type RevenueCardsInput,
} from "./cards";
import { RATIO_DESCRIPTORS } from "./series";

export interface RevenueReportHeader {
  /** The label the user gave the client — never the razón social of any file. */
  clientName: string;
  /** The LEFT-hand logo, the client's. */
  logo?: EntityLogo;
  /** The RIGHT-hand one, of the cost center the client may have declared. */
  rightLogo?: EntityLogo;
  /** «Ene–Jul 2026», «Ene, Mar, Abr · 2024, 2026». */
  periodLabel: string;
  generatedAt: string;
}

export interface RevenueReportSection {
  /** Stable and independent of the text: it is React's key and what a test names. */
  id: string;
  card: ChartCardSpec;
}

export interface RevenueReport {
  header: RevenueReportHeader;
  sections: RevenueReportSection[];
}

export interface BuildRevenueReportInput extends RevenueCardsInput {
  clientName: string;
  logo?: EntityLogo;
  rightLogo?: EntityLogo;
  generatedAt: Date;
}

export function buildRevenueReport(input: BuildRevenueReportInput): RevenueReport {
  const sections: RevenueReportSection[] = [
    { id: "comparativo", card: flatComparisonCard(input) },
    // BOTH shapes of the annual reading, for the same reason as the growth's two units: on paper
    // «Ver como» is a button nobody can press.
    // `flatOnly` on the annual: on paper a 3D box is a WebGL canvas no sheet renders and a camera
    // nobody can press, so the guard is written down instead of cast — the builder returns the flat
    // body by omission and this never throws.
    { id: "anual-total", card: flatOnly(buildAnnualCard(input, "total")) },
    { id: "anual-promedio", card: flatOnly(buildAnnualCard(input, "promedio")) },
    // BOTH units, because the screen's switch does not exist here.
    // No `flatOnly` on these two: the growth has one body and it is the flat one.
    { id: "crecimiento-dolares", card: buildGrowthCard(input, "dolares") },
    { id: "crecimiento-porcentaje", card: buildGrowthCard(input, "porcentaje") },
  ];

  if (input.canCapture) {
    for (const descriptor of RATIO_DESCRIPTORS) {
      // ONE section and no longer two: the card draws the two amounts and writes the participation
      // over the numerator's bar, so there is no second shape left for the paper to print.
      sections.push({ id: descriptor.id, card: flatOnly(buildRatioCard(descriptor, input)) });
    }
  }

  return {
    header: {
      clientName: input.clientName,
      ...(input.logo ? { logo: input.logo } : {}),
      ...(input.rightLogo ? { rightLogo: input.rightLogo } : {}),
      periodLabel: input.period,
      generatedAt: formatTimestampEs(input.generatedAt),
    },
    sections,
  };
}
