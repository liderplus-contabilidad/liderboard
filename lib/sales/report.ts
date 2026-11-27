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
import { flatOnly, type ChartCardSpec } from "@/lib/charts/types";
import { formatTimestampEs } from "@/lib/date";
import type { EntityLogo } from "@/lib/workspaces";
import {
  buildSalesCards,
  RANKING_TABLE_PRINT_LIMIT,
  scopedPeriod,
  type SalesCardsInput,
} from "./cards";

export interface SalesReportHeader {
  /** The label the user gave the client — never the razón social of any file. */
  clientName: string;
  /** The `COD. EMPRESA` the files DECLARE, when there is one: it is what identifies which company
   *  this billing belongs to, and on paper the selector that would say it is not there. */
  companyCode?: string;
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
  companyCode?: string;
  logo?: EntityLogo;
  rightLogo?: EntityLogo;
  generatedAt: Date;
}

/**
 * The five readings, in the order of the screen. None is omitted for being empty —the card
 * explains itself— except «Venta por vendedor», which is not built when nothing declares one. The
 * composition's second level is not printed per type: the article ranking already answers it.
 */
export function buildSalesReport(input: BuildSalesReportInput): SalesReport {
  // The ONLY place the paper parts ways with the screen, and it is decided by the report and not by
  // the card: a ranking's tail is folded into one row with its sum. See `RANKING_TABLE_PRINT_LIMIT`.
  const cards = buildSalesCards({ ...input, rankingTableLimit: RANKING_TABLE_PRINT_LIMIT });
  return {
    header: {
      clientName: input.clientName,
      ...(input.companyCode ? { companyCode: input.companyCode } : {}),
      ...(input.logo ? { logo: input.logo } : {}),
      ...(input.rightLogo ? { rightLogo: input.rightLogo } : {}),
      // With marks set the paper HAS to say so: the bar that says it on screen is not here.
      periodLabel: scopedPeriod(input),
      generatedAt: formatTimestampEs(input.generatedAt),
    },
    sections: [
      // All of them go through the SAME check, and it is not ceremony: every one can come out as a
      // solid or as a 3D box, and paper carries neither. The call above asks for no shape, so this
      // never throws today — writing it down rather than casting is what keeps it that way.
      { id: "types", card: flatOnly(cards.types) },
      { id: "insurers", card: flatOnly(cards.insurers) },
      { id: "articles", card: flatOnly(cards.articles) },
      ...(cards.vendors ? [{ id: "vendors", card: flatOnly(cards.vendors) }] : []),
      { id: "evolution", card: flatOnly(cards.evolution) },
    ],
  };
}
