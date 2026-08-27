"use client";

import { Copy, Download, Eye, MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GridRow } from "@/components/data-table/data-grid";
import { Cell } from "@/components/data-table/grid-cells";
import { cn } from "@/lib/cn";
import { formatCurrency, formatNumber, pluralize } from "@/lib/format";
import { listEmployees } from "@/lib/payroll/db";
import { DEFAULT_PAYROLL_PARAMETERS } from "@/lib/payroll/engine/parameters";
import { downloadPayslipZip, PAYSLIP_ZIP_LABEL } from "@/lib/payroll/payslip/download";
import { buildPeriodPayslips } from "@/lib/payroll/payslip/period";
import type { PayrollPeriodFinancials } from "@/lib/payroll/period-detail";
import { periodKindLabel, periodLongLabel } from "@/lib/payroll/periods";
import type { PayrollPeriod, PayrollRosterSummary } from "@/lib/payroll/types";
import { DeletePeriodDialog } from "./delete-period-dialog";
import { NewPeriodForm } from "./new-period-popover";
import { usePayrollData } from "./payroll-data-provider";

/** A período with no totals has nothing to download: the control switches off with a visible reason
 * instead of sitting there unexplained. «Ver período» does not share this: the detail screen renders
 * fine with and without data, so a freshly created período can be opened too. */
const NO_DATA_REASON = "El período todavía no tiene datos cargados";

const ROW_ACTION_CLASS =
  "rounded-[7px] p-1.5 text-faint transition-colors hover:bg-canvas hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-faint";

/** Width of the popover hanging off a row's `⋯` — the menu and the form that replaces it share the
 *  same width, so going from one to the other does not jump around. */
const ROW_POPOVER_WIDTH = 300;

const ROW_MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-[12.5px] font-semibold text-ink transition-colors hover:bg-canvas";

interface PayrollPeriodRowProps {
  period: PayrollPeriod;
  /** Derived from the período's stored nómina — never a total that could go stale. */
  roster: PayrollRosterSummary;
  /** The período's four totals, derived like `roster`; `undefined` while it has not received its
   *  file — it is not zero, it is «there is none». */
  financials: PayrollPeriodFinancials | undefined;
}

function PayrollPeriodRowComponent({ period, roster, financials }: PayrollPeriodRowProps) {
  const { activeClient, deletePeriod } = usePayrollData();
  const hasFinancials = financials !== undefined;
  const hasRoster = roster.employees > 0;
  const [downloading, setDownloading] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  // "menu": «Duplicar en otro período…» and «Eliminar período». "form": the same form as the
  // header's popover, with the source already fixed to this período — same rect, two contents, so
  // going from one to the other does not move.
  const [stage, setStage] = useState<"closed" | "menu" | "form">("closed");
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  // Deleting is NOT a third stage of the popover: it is a modal dialog that counts what it discards,
  // the same one the detail screen uses. The menu closes on opening it.
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const openMenu = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setAnchor({ top: rect.bottom + 6, right: rect.right });
    setStage("menu");
  }, []);
  const close = useCallback(() => {
    setStage("closed");
    setAnchor(null);
  }, []);

  /**
   * The período's payslips, without opening it. It is the SAME .zip its detail screen downloads, by
   * the same builder: from the history the roles of several months in a row are downloaded without
   * entering and leaving each one.
   *
   * The nómina is read HERE, on the click, and not with a `useLiveQuery` on the row: the history
   * lists every período of the client, and holding each one's whole nómina in memory in case someone
   * downloads one is paying for the whole list for the sake of a single row.
   */
  const downloadRoles = useCallback(async () => {
    setDownloading(true);
    try {
      const lines = await listEmployees(period.id);
      if (lines.length === 0) {
        return;
      }
      await downloadPayslipZip(
        buildPeriodPayslips({
          period,
          lines,
          parameters: DEFAULT_PAYROLL_PARAMETERS,
          clientName: activeClient?.name ?? "",
          ...(activeClient?.logo ? { clientLogo: activeClient.logo } : {}),
          ...(activeClient?.company ? { clientCompany: activeClient.company } : {}),
          ...(activeClient?.costCenter ? { clientCostCenter: activeClient.costCenter } : {}),
        }),
        period,
      );
    } finally {
      setDownloading(false);
    }
  }, [
    activeClient?.name,
    activeClient?.logo,
    activeClient?.company,
    activeClient?.costCenter,
    period,
  ]);

  const confirmDelete = useCallback(async () => {
    setBusy(true);
    try {
      await deletePeriod(period.id);
    } finally {
      setBusy(false);
      setDeleting(false);
    }
  }, [deletePeriod, period.id]);

  // Escape closes from any stage; a click outside is handled by the transparent backdrop below.
  // `anchor` is captured ONCE on opening and never measured again, so a scroll (the layout's
  // `<main>`, not the window) closes it instead of leaving it floating far from the button that
  // opened it.
  useEffect(() => {
    if (stage === "closed") {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
    };
  }, [stage, close]);

  return (
    <>
      <GridRow>
        <Cell>
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold uppercase tracking-[0.2px] text-ink">
              {periodLongLabel(period.year, period.monthIndex)}
            </span>
            <span className="text-[11.5px] text-faint">
              {hasRoster ? `Nómina mensual · ${pluralize(roster.areas, "área")}` : "Sin empleados"}
            </span>
          </span>
        </Cell>
        <Cell>{periodKindLabel(period.kind)}</Cell>
        <Cell numeric className="font-mono">
          {formatNumber(roster.employees)}
        </Cell>
        <Cell numeric tone={hasFinancials ? "default" : "muted"} className="font-mono">
          {financials ? formatCurrency(financials.net, { cents: true }) : "–"}
        </Cell>
        <Cell numeric tone={hasFinancials ? "default" : "muted"} className="font-mono">
          {financials ? formatCurrency(financials.cost, { cents: true }) : "–"}
        </Cell>
        <Cell align="right">
          <span className="flex items-center justify-end gap-1">
            <Link
              href={`/payroll/${period.id}`}
              title="Ver período"
              aria-label="Ver período"
              className={ROW_ACTION_CLASS}
            >
              <Eye size={15} />
            </Link>
            <button
              type="button"
              disabled={!hasFinancials || downloading}
              title={hasFinancials ? PAYSLIP_ZIP_LABEL : NO_DATA_REASON}
              aria-label={hasFinancials ? PAYSLIP_ZIP_LABEL : NO_DATA_REASON}
              aria-busy={downloading}
              onClick={() => void downloadRoles()}
              className={ROW_ACTION_CLASS}
            >
              <Download size={15} className={cn(downloading && "animate-pulse")} />
            </button>
            <button
              ref={triggerRef}
              type="button"
              aria-label={`Más opciones de ${periodLongLabel(period.year, period.monthIndex)}`}
              aria-haspopup="menu"
              aria-expanded={stage !== "closed"}
              onClick={() => (stage === "closed" ? openMenu() : close())}
              className={ROW_ACTION_CLASS}
            >
              <MoreHorizontal size={15} />
            </button>
          </span>
        </Cell>
      </GridRow>

      {stage !== "closed" &&
        anchor &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={close}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div
              style={{
                top: anchor.top,
                left: anchor.right - ROW_POPOVER_WIDTH,
                width: ROW_POPOVER_WIDTH,
              }}
              className="fixed z-50 rounded-[13px] border border-border bg-surface shadow-[0_18px_44px_rgba(15,23,42,0.18)]"
            >
              {stage === "menu" ? (
                <div role="menu" className="p-1">
                  {/* Duplicar only appears with a nómina to duplicate: an empty período is already
                      created empty from «+ Nuevo período», so the item would say nothing. Eliminar,
                      on the other hand, always applies — a período created by mistake is exactly the
                      one that has to be removable, and it is the one with the least nómina. */}
                  {hasRoster && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => setStage("form")}
                      className={ROW_MENU_ITEM_CLASS}
                    >
                      <Copy size={14} className="text-muted" />
                      Duplicar en otro período…
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      setDeleting(true);
                    }}
                    className={cn(ROW_MENU_ITEM_CLASS, "text-negative hover:bg-negative/5")}
                  >
                    <Trash2 size={14} />
                    Eliminar período
                  </button>
                </div>
              ) : (
                <div className="p-3.5">
                  <NewPeriodForm fixedSource={period} onDone={close} />
                </div>
              )}
            </div>
          </>,
          document.body,
        )}

      {/* To the `body`, like the menu above and for the same reason it is not visible there: this is
          rendered from a ROW, so without a portal the dialog's `<div>` ends up a sibling of the
          `<tr>` inside the `<tbody>` — invalid HTML, and React reports it as a hydration error. */}
      {deleting &&
        createPortal(
          <DeletePeriodDialog
            period={period}
            employeeCount={roster.employees}
            busy={busy}
            onConfirm={() => void confirmDelete()}
            onCancel={() => setDeleting(false)}
          />,
          document.body,
        )}
    </>
  );
}

export const PayrollPeriodRow = memo(PayrollPeriodRowComponent);
