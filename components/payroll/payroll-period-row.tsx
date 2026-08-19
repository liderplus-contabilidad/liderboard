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
import { downloadPayslips, payslipBatchFilename } from "@/lib/payroll/payslip/download";
import { buildPeriodPayslips } from "@/lib/payroll/payslip/period";
import type { PayrollPeriodFinancials } from "@/lib/payroll/period-detail";
import { periodKindLabel, periodLongLabel } from "@/lib/payroll/periods";
import type { PayrollPeriod, PayrollRosterSummary } from "@/lib/payroll/types";
import { DeletePeriodDialog } from "./delete-period-dialog";
import { NewPeriodForm } from "./new-period-popover";
import { usePayrollData } from "./payroll-data-provider";

/** Un período sin totales no tiene qué descargar: el control se apaga con un motivo visible en
 * vez de quedar ahí sin explicación. «Ver período» no comparte este apagado — la pantalla de
 * detalle rinde bien con y sin datos, así que un período recién creado también se puede abrir. */
const NO_DATA_REASON = "El período todavía no tiene datos cargados";

const ROW_ACTION_CLASS =
  "rounded-[7px] p-1.5 text-faint transition-colors hover:bg-canvas hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-faint";

/** Ancho del popover que cuelga del `⋯` de una fila — el menú y el formulario que lo sustituye
 *  comparten el mismo ancho, así que pasar de uno a otro no salta de sitio. */
const ROW_POPOVER_WIDTH = 300;

const ROW_MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-[12.5px] font-semibold text-ink transition-colors hover:bg-canvas";

interface PayrollPeriodRowProps {
  period: PayrollPeriod;
  /** Derivado de la nómina guardada del período — nunca un total que pudiera desactualizarse. */
  roster: PayrollRosterSummary;
  /** Los cuatro totales del período, derivados igual que `roster`; `undefined` mientras no
   *  reciba su archivo — no es cero, es «no hay». */
  financials: PayrollPeriodFinancials | undefined;
}

function PayrollPeriodRowComponent({ period, roster, financials }: PayrollPeriodRowProps) {
  const { activeClient, deletePeriod } = usePayrollData();
  const hasFinancials = financials !== undefined;
  const hasRoster = roster.employees > 0;
  const [downloading, setDownloading] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  // "menu": «Duplicar en otro período…» y «Eliminar período». "form": el mismo formulario del
  // popover del encabezado, con la fuente ya fijada en este período — mismo rect, dos
  // contenidos, así que pasar de uno a otro no cambia de sitio.
  const [stage, setStage] = useState<"closed" | "menu" | "form">("closed");
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  // El borrado NO es una tercera etapa del popover: es un diálogo modal que cuenta lo que
  // descarta, el mismo que usa la pantalla de detalle. El menú se cierra al abrirlo.
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
   * Los comprobantes del período, sin abrirlo. Es el MISMO PDF que baja su pantalla de detalle,
   * por el mismo constructor: desde el historial se bajan los roles de varios meses seguidos sin
   * entrar y salir de cada uno.
   *
   * La nómina se lee AQUÍ, al pulsar, y no con un `useLiveQuery` de la fila: el historial lista
   * todos los períodos del cliente, y sostener la nómina entera de cada uno en memoria por si
   * alguien descarga uno es pagar la lista completa para el caso de una fila.
   */
  const downloadRoles = useCallback(async () => {
    setDownloading(true);
    try {
      const lines = await listEmployees(period.id);
      if (lines.length === 0) {
        return;
      }
      await downloadPayslips(
        buildPeriodPayslips({
          period,
          lines,
          parameters: DEFAULT_PAYROLL_PARAMETERS,
          clientName: activeClient?.name ?? "",
          ...(activeClient?.logo ? { clientLogo: activeClient.logo } : {}),
          ...(activeClient?.company ? { clientCompany: activeClient.company } : {}),
          ...(activeClient?.costCenter ? { clientCostCenter: activeClient.costCenter } : {}),
        }),
        payslipBatchFilename(period.year, period.monthIndex),
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

  // Escape cierra desde cualquier etapa; un clic fuera lo hace el backdrop transparente de abajo.
  // `anchor` se captura UNA vez al abrir y no se vuelve a medir, así que un scroll (el `<main>`
  // del layout, no la ventana) lo cierra en vez de dejarlo flotando lejos del botón que lo abrió.
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
              title={hasFinancials ? "Descargar roles (PDF)" : NO_DATA_REASON}
              aria-label={hasFinancials ? "Descargar roles (PDF)" : NO_DATA_REASON}
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
                  {/* Duplicar solo aparece con nómina que duplicar: un período vacío ya se crea
                      vacío desde «+ Nuevo período», así que el ítem no diría nada. Eliminar, en
                      cambio, aplica siempre — un período creado por error es justo el que hay
                      que poder quitar, y es el que menos nómina tiene. */}
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

      {/* Al `body`, como el menú de arriba y por la misma razón que allí no se ve: esto se rinde
          desde una FILA, así que sin portal el `<div>` del diálogo queda de hermano del `<tr>`
          dentro del `<tbody>` — HTML inválido, y React lo delata como error de hidratación. */}
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
