/**
 * The printable report of «Ventas por servicio»: which sections it carries, in what order and what its
 * header writes. Pure —it computes no figure of its own— and therefore testable without mounting a
 * chart.
 *
 * **They are the SAME cards as the screen's**, `buildSalesCards` with the user's same marks, and that
 * is the only thing that guarantees the paper cannot say a figure the screen does not say: a second
 * derivation of the breakdown by service could drift from the first with nothing giving it away, and
 * whoever receives the PDF no longer has the screen beside them to check against.
 *
 * What the header writes is what the BAR says on screen, which is no longer there on paper: the
 * client, the period the report covers and the date it was generated.
 */
import {
  is3DOption,
  type Chart3DOption,
  type ChartCardSpec,
  type ChartOption,
} from "@/lib/charts/types";
import { formatTimestampEs } from "@/lib/date";
import type { EntityLogo } from "@/lib/workspaces";
import {
  buildSalesCards,
  PAYER_TABLE_PRINT_LIMIT,
  scopedPeriod,
  type SalesCardsInput,
} from "./cards";

export interface SalesReportHeader {
  /** The label the user gave the client — never the razón social of any file. */
  clientName: string;
  /** The razón social the files DECLARE, when there is one: it is what identifies which company this
   *  billing belongs to, and on paper the selector that would say it is not there. */
  companyName?: string;
  /** The LEFT-hand one, the client's — `letterheadLogos`' same layout. */
  logo?: EntityLogo;
  /** The RIGHT-hand one, of the cost center the client may have declared. */
  rightLogo?: EntityLogo;
  /** «Abril 2026», «Ene–Abr 2026», «Ene, Mar, Abr 2026». */
  periodLabel: string;
  generatedAt: string;
}

export interface SalesReportSection {
  /** Stable and independent of the text: it is React's key and what a test names. */
  id: string;
  card: ChartCardSpec;
}

export interface SalesReport {
  header: SalesReportHeader;
  sections: SalesReportSection[];
}

export interface BuildSalesReportInput extends SalesCardsInput {
  clientName: string;
  companyName?: string;
  logo?: EntityLogo;
  rightLogo?: EntityLogo;
  generatedAt: Date;
}

/**
 * The THREE readings, in the order they are read on screen. None is omitted for being empty: a report
 * that lost the evolution would not say the year is half-loaded, it would say there is no evolution —
 * and the card already knows how to explain itself when it has nothing to draw.
 */
export function buildSalesReport(input: BuildSalesReportInput): SalesReport {
  // The ONLY place the paper parts ways with the screen, and it is decided by the report and not by
  // the card: the payer tail is folded into one row with its sum. See `PAYER_TABLE_PRINT_LIMIT`.
  const cards = buildSalesCards({ ...input, payerTableLimit: PAYER_TABLE_PRINT_LIMIT });
  return {
    header: {
      clientName: input.clientName,
      ...(input.companyName ? { companyName: input.companyName } : {}),
      ...(input.logo ? { logo: input.logo } : {}),
      ...(input.rightLogo ? { rightLogo: input.rightLogo } : {}),
      // With services marked the paper HAS to say so: the bar that says it on screen is not here.
      periodLabel: scopedPeriod(input),
      generatedAt: formatTimestampEs(input.generatedAt),
    },
    sections: [
      { id: "services", card: cards.services },
      { id: "payers", card: cards.payers },
      { id: "evolution", card: printable(cards.evolution) },
    ],
  };
}

/**
 * The evolution as PAPER can carry it.
 *
 * It never throws today: the call above passes no `evolutionView`, and the flat shape is what
 * `buildSalesCards` returns by omission. Writing the check down rather than casting is the whole
 * point — a 3D box is a WebGL canvas no printed sheet renders and a camera nobody can press, so if
 * that default is ever flipped this has to fail HERE and loudly, instead of printing an empty
 * rectangle where the year's evolution was.
 */
function printable(card: ChartCardSpec<ChartOption | Chart3DOption>): ChartCardSpec {
  const option = card.option;
  if (option !== null && is3DOption(option)) {
    throw new Error("El informe no imprime la forma 3D de la evolución: se esperaba la apilada.");
  }
  return { ...card, option };
}
