"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { MICROPLUS_SYSTEM } from "@/lib/profit-loss/upload/systems";
import { usePygData } from "../pyg-data-provider";

/**
 * The cross-link from «Composición de los ingresos» to «Ventas por servicio»: the accounting
 * breakdown of revenue and the breakdown of what was BILLED are the two readings of the same
 * question, and the second does not fit in the chart of accounts —the statement splits revenue into
 * two accounts and the billing report splits it into five services with their payers—.
 *
 * **It goes in the card's HEADER and with the shape of its neighbours** —the «Ver como tabla» pill—,
 * not in the footer. It lived below, with the warning that what was billed does not square with these
 * accounts written under the link, and there the two lines sat glued to the «Fuera del reparto» note
 * in the same ink and the same size: three grey lines at the bottom of the card that read as a single
 * footnote, where the link did not look clickable and the warning did not look like its own. Up top
 * it is a control, which is what it is.
 *
 * That move takes the warning with it, because a pill cannot hold a sentence: it is declared by the
 * DESTINATION screen, in the line of its own footer, which is where the reader finally has both
 * figures in front of them and where the notice is needed. Here it is left as a `title`, as support
 * and never as the only warning —the label already says where it leads—. No sales figure crosses to
 * this screen: the only thing that crosses is the link.
 *
 * **And it is not `brand`**: `--color-crosslink`'s fuchsia is there to say this control LEAVES the
 * card, whereas `brand` is the primary action within the screen. The label repeats the sidebar's
 * verbatim so the reader recognises where they land.
 *
 * **Only with MicroPlus**, which is the system that issues that report: `sourceSystemId` is the id of
 * the strategy that loaded the OPEN workspace, and it is `null` in the cross-client Consolidado, so
 * there this renders nothing on its own, without a case of its own. It does NOT look at whether there
 * are months loaded already — without them the destination screen says what is missing and brings its
 * own upload button, which is more than this link could explain.
 *
 * It lives in `components/profit-loss/sales/` and not in `charts/` because what it knows belongs to
 * the sales subitem; `GraficosView` only places it. It is mounted through the card's `headerSlot` and
 * does not travel in its `ChartCardSpec`: the printable report reads that same list, and a link on
 * paper is a button nobody can press.
 */
export function SalesCrossLink() {
  const { sourceSystemId } = usePygData();

  if (sourceSystemId !== MICROPLUS_SYSTEM) {
    return null;
  }

  return (
    <Link
      href="/profit-loss/sales"
      title="Lo facturado, repartido por servicio y por pagador. Es otro reporte y no cuadra con estas cuentas."
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-crosslink/25 bg-crosslink-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-crosslink transition-colors hover:border-crosslink/50 hover:text-crosslink-hover"
    >
      <ShoppingBag size={13} />
      Ventas por servicio
    </Link>
  );
}
