/**
 * The four series this module speaks of, and the DESCRIPTORS the three ratio cards are built from.
 *
 * **`REVENUE_SERIES_ORDER` is the identity of a colour, not a display order.** It is the stable list
 * `colorForEntity` resolves a slot against, so «cobros con tarjeta» is the same orange being the
 * NUMERATOR of card 3 and the DENOMINATOR of card 4. Without one fixed order the same entity would
 * change colour between two cards sitting one above the other, and the reader would have to re-learn
 * the legend on every scroll. Never re-sort it.
 *
 * **The three ratio cards come from ONE constructor** (`buildRatioCard`) walking this list. Adding a
 * fourth external series —efectivo, transferencias— is an entry here plus its three fields in
 * `RevenueExternalMonth`, and no change at all in the builder. It is the figure `upload/registry.ts`
 * and `preset-views.ts` already use, and it is what stops a second definition of «qué porcentaje es
 * esto» appearing the day somebody adds a card by hand.
 */
import type { ChartGuide } from "@/lib/charts/types";
import { ratioGuide } from "./guides";
import type { RevenueYearInput } from "./types";

export const REVENUE_SERIES_ORDER = ["ventas", "cobros-tc", "comision-tc", "facebook"] as const;

export type RevenueSeriesId = (typeof REVENUE_SERIES_ORDER)[number];

/** The three that are CAPTURED. «ventas» is derived from the PyG and is never one of these. */
export type ExternalSeriesId = Exclude<RevenueSeriesId, "ventas">;

/** How a series is NAMED on screen — one place, so the legend, the table, the drawer and the report
 *  cannot call the same figure two things. */
export const SERIES_LABELS: Record<RevenueSeriesId, string> = {
  ventas: "Ventas",
  "cobros-tc": "Cobros con tarjeta",
  "comision-tc": "Comisiones TC",
  facebook: "Publicidad Facebook",
};

/**
 * The same series as it reads INSIDE A SENTENCE — «los cobros con tarjeta», «las comisiones TC».
 *
 * It exists because the notes used to lower-case `SERIES_LABELS` to fit them into a phrase, and
 * `.toLowerCase()` does not know what a sigla is: «Comisiones TC» came out «comisiones tc» and
 * «Publicidad Facebook» came out «publicidad facebook». A label is written, never derived by casing.
 *
 * It carries the ARTICLE too, so the sentence around it does not have to guess the gender of a
 * series the day a fourth one is added.
 */
export const SERIES_LABELS_INLINE: Record<RevenueSeriesId, string> = {
  ventas: "las ventas",
  "cobros-tc": "los cobros con tarjeta",
  "comision-tc": "las comisiones TC",
  facebook: "la pauta de Facebook",
};

/** Where a series' twelve monthly values come from, given a year's input. */
type SeriesSelector = (input: RevenueYearInput) => (number | null)[];

const SELECTORS: Record<RevenueSeriesId, SeriesSelector> = {
  ventas: (input) => input.monthlyRevenue,
  "cobros-tc": (input) => input.external.cardRevenue,
  "comision-tc": (input) => input.external.cardFees,
  facebook: (input) => input.external.adSpend,
};

/** A series' values for one year — the ONE way in, so no card reaches into `external` by hand. */
export function seriesOf(input: RevenueYearInput, id: RevenueSeriesId): (number | null)[] {
  return SELECTORS[id](input);
}

/**
 * One ratio card, described as data.
 *
 * `colorSlot` is deliberately not a hex and not an index: it is the SERIES the colour belongs to, and
 * `colorForEntity` resolves it against `REVENUE_SERIES_ORDER`. That is what keeps the entity's colour
 * stable across the screen, and what stops a descriptor from writing a colour of its own — no builder
 * in this app writes a hex.
 */
export interface RatioDescriptor {
  /** The card's stable id: its React key, and what a test names. */
  id: string;
  title: string;
  /** What the card answers, in the subtitle's voice — the period is appended by the builder. */
  question: string;
  numerator: RevenueSeriesId;
  denominator: RevenueSeriesId;
  /** Whose colour the participation bars take. Always the numerator: it is the figure being sized. */
  colorSlot: RevenueSeriesId;
  /** How the drawer names this card's live figure. */
  shareLabel: string;
  guide: ChartGuide;
}

/**
 * The three readings the workbook keeps as three sheets, which are the same question three times: one
 * series against another, and the percentage between them.
 */
export const RATIO_DESCRIPTORS: readonly RatioDescriptor[] = [
  {
    id: "cobros-tc-vs-ventas",
    title: "Cobros con tarjeta vs ventas",
    question: "qué parte de la venta se cobró con tarjeta",
    numerator: "cobros-tc",
    denominator: "ventas",
    colorSlot: "cobros-tc",
    shareLabel: "% sobre ventas",
    guide: ratioGuide(SERIES_LABELS_INLINE["cobros-tc"], SERIES_LABELS_INLINE.ventas),
  },
  {
    id: "comision-tc-vs-cobros-tc",
    title: "Comisiones TC vs cobros con tarjeta",
    question: "cuánto se lleva el emisor de cada dólar cobrado",
    numerator: "comision-tc",
    // The denominator is another CAPTURED series, not the sales: what the issuer charges is a
    // percentage of what was collected by card, and measuring it over total sales would answer a
    // different question and give a number four times smaller.
    denominator: "cobros-tc",
    colorSlot: "comision-tc",
    shareLabel: "% comisión",
    guide: ratioGuide(SERIES_LABELS_INLINE["comision-tc"], SERIES_LABELS_INLINE["cobros-tc"]),
  },
  {
    id: "facebook-vs-ventas",
    title: "Publicidad Facebook vs ventas",
    question: "cuánto de la venta se reinvierte en pauta",
    numerator: "facebook",
    denominator: "ventas",
    colorSlot: "facebook",
    shareLabel: "% pauta",
    guide: ratioGuide(SERIES_LABELS_INLINE.facebook, SERIES_LABELS_INLINE.ventas),
  },
];
