"use client";

import { Printer, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency } from "@/lib/format";
import { loadedColumnPositions, visibleColumnPositions } from "@/lib/profit-loss/datos-columns";
import { toDatosGridMultiYear } from "@/lib/profit-loss/derive";
import { buildAnalisisCards, buildGraficosCards } from "@/lib/profit-loss/charts/cards";
import { expandSlots } from "@/lib/profit-loss/charts/selection";
import { REVENUE_ROOT } from "@/lib/profit-loss/analytics/structure";
import { CONSOLIDADO_ID } from "@/lib/profit-loss/filters";
import { accumulateStatement, findRow } from "@/lib/profit-loss/report/accumulate";
import { buildCentersAnnex } from "@/lib/profit-loss/report/centers-annex";
import {
  collapsedAtLevel,
  hiddenAccountCount,
  DEFAULT_REPORT_LEVEL,
  levelLabel,
  REPORT_LEVELS,
} from "@/lib/profit-loss/report/level";
import { pruneEmptyRows } from "@/lib/profit-loss/report/prune";
import { reportSections } from "@/lib/profit-loss/report/sections";
import { describePygReport } from "@/lib/profit-loss/report/summary";
import type { ReportSection as ReportSectionSpec } from "@/lib/profit-loss/report/types";
import { usePygAnalytics } from "../pyg-analytics-provider";
import { usePygData } from "../pyg-data-provider";
import { ReportCards } from "./report-cards";
import { ReportCentersAnnex } from "./report-centers-annex";
import { ReportCover } from "./report-cover";
import { ReportSection } from "./report-section";
import { ReportStatement } from "./report-statement";
import { ReportVertical } from "./report-vertical";

/**
 * The report, on screen at page width, with the control that prints it.
 *
 * The preview is the MECHANISM and not a convenience. ECharts measures its container to lay a
 * chart out: inside a `display: none` box the width is 0 and every chart comes out broken, and
 * rendered at window width they do not match the page. Mounting the report visible and at page
 * width fixes both — and because the charts have been painted for as long as the reader has been
 * looking at them, printing needs no timer waiting for a render, which is the kind of wait that
 * fails on someone else's slower machine.
 *
 * It mounts in a portal on `document.body` with the id the print rules key off, so `@media print`
 * can hide everything that is not this layer.
 */
export function PygReportPreview({ onClose }: { onClose: () => void }) {
  const {
    activeClient,
    dataset,
    frequency,
    allowed,
    filters,
    mode,
    views,
    activeCenterId,
    activeSlices,
    visibleYears,
    loadedMonthsByYear,
    sourceSystemId,
    accountOptions,
  } = usePygData();
  const { context, verticalBaseCode } = usePygAnalytics();

  const graficos = useMemo(() => buildGraficosCards(context, filters), [context, filters]);
  const analisis = useMemo(() => buildAnalisisCards(context, filters), [context, filters]);

  // Same fallback the Datos tab applies: a freshly loaded coarser file floors the options one
  // render before the provider resets the frequency, and `toDatosGrid` throws on disaggregation.
  const effectiveFrequency = allowed.includes(frequency)
    ? frequency
    : (dataset?.baseFrequency ?? frequency);

  /**
   * The one table both the statement and the vertical analysis print from: the months collapsed
   * into one accumulated column per year, then the tree minus what never moved.
   *
   * Accumulating BEFORE pruning is what makes the prune answer the printed question — an account
   * that only moved in a month this report does not cover has nothing to say on this page.
   */
  const statement = useMemo(() => {
    if (activeSlices.length === 0) {
      return null;
    }
    const grid = toDatosGridMultiYear(activeSlices, effectiveFrequency);
    const accumulated = accumulateStatement({
      grid,
      visibleColumns: visibleColumnPositions(grid.columns, filters.periods),
      loadedColumns:
        mode === "multi" && dataset
          ? loadedColumnPositions({
              columns: grid.columns,
              loadedMonthsByYear,
              baseFrequency: dataset.baseFrequency,
              frequency: effectiveFrequency,
            })
          : null,
      frequency: effectiveFrequency,
    });
    const pruned = pruneEmptyRows(accumulated.grid);
    return {
      ...accumulated,
      grid: pruned,
      revenue: findRow(pruned.rows, REVENUE_ROOT),
      base: findRow(pruned.rows, verticalBaseCode),
    };
  }, [
    activeSlices,
    effectiveFrequency,
    filters.periods,
    mode,
    dataset,
    loadedMonthsByYear,
    verticalBaseCode,
  ]);

  const periodRefs = useMemo(
    () => expandSlots(filters.periods, [context.year]),
    [filters.periods, context.year],
  );

  // El corte de nivel del INFORME. Es estado local a propósito: el `collapsed` del proveedor
  // gobierna la tabla de Datos y el filtro «Nivel» de la barra, y elegir aquí una profundidad
  // para imprimir no puede replegarle el árbol a nadie en pantalla.
  const [level, setLevel] = useState<number>(DEFAULT_REPORT_LEVEL);
  const reportCollapsed = useMemo(
    () => collapsedAtLevel(accountOptions, level),
    [accountOptions, level],
  );
  const hiddenAccounts = useMemo(
    () => hiddenAccountCount(accountOptions, reportCollapsed),
    [accountOptions, reportCollapsed],
  );

  /**
   * Whether the vertical analysis earns its page. Over Ingresos and with no second year to
   * compare against it is the statement's own «% Ing.» column, printed again — see
   * `reportSections`.
   */
  const showVertical =
    statement !== null &&
    statement.periods.length > 0 &&
    (verticalBaseCode !== REVENUE_ROOT || statement.periods.length >= 2);

  const annex = useMemo(() => {
    if (mode !== "multi") {
      return null;
    }
    return buildCentersAnnex({
      centers: views.filter((view) => view.id !== CONSOLIDADO_ID),
      sources: context.sources,
      years: visibleYears,
      frequency: context.frequency,
      periods: periodRefs,
    });
  }, [mode, views, context.sources, context.frequency, visibleYears, periodRefs]);

  const cover = useMemo(
    () =>
      describePygReport({
        clientName: activeClient?.name ?? "Sin cliente",
        companyName: dataset?.companyName ?? "—",
        sourceSystemId,
        mode,
        filters,
        accounts: accountOptions,
        views,
        activeCenterId,
        visibleYears,
        frequency: effectiveFrequency,
        loadedMonthsByYear,
        // The one impure input, taken at mount so the cover is stamped once and does not tick
        // while the reader looks at it.
        generatedAt: new Date(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stamped once, on purpose.
    [],
  );

  const sections = useMemo(
    () => reportSections({ mode, vertical: showVertical }),
    [mode, showVertical],
  );
  const sectionOf = (id: ReportSectionSpec["id"]) =>
    sections.find((section) => section.id === id) as ReportSectionSpec;

  useEscapeToClose(onClose);
  usePrintTitle(`PyG-${activeClient?.name ?? "informe"}-${visibleYears.join("-")}`);

  return createPortal(
    // Una región, no un `role="dialog"` ni un `<dialog>` modal: no atrapa el foco ni vuelve
    // inerte lo de atrás, y anunciarse como modal sin hacerlo es peor que no anunciarlo. El
    // `<dialog>` nativo, además, dibuja en la top layer, que es justo lo que esta capa no
    // quiere estando de por medio la impresión.
    <section
      id="pyg-report"
      aria-label="Vista previa del informe"
      className="fixed inset-0 z-50 overflow-auto bg-canvas"
    >
      <header className="print-hide sticky top-0 z-10 flex items-center justify-between gap-6 border-b border-border bg-surface px-7 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Vista previa del informe</p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            En el diálogo de impresión, elige <strong className="font-semibold">Destino</strong> →{" "}
            <strong className="font-semibold">Guardar como PDF</strong>.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <label className="flex items-center gap-2 text-[12px] text-muted">
            Detalle
            <select
              value={level}
              onChange={(event) => setLevel(Number(event.target.value))}
              className="h-[34px] rounded-[9px] border border-border bg-surface px-2.5 text-[12.5px] font-medium text-ink"
            >
              {REPORT_LEVELS.map((option) => (
                <option key={option} value={option}>
                  {levelLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <Button size="toolbar" icon={<Printer size={14} />} onClick={() => window.print()}>
            Guardar PDF
          </Button>
          <Button size="toolbar" variant="secondary" icon={<X size={14} />} onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </header>

      {/* 794px es A4 vertical a 96 dpi, y el padding son sus márgenes: así el contenido mide
          exactamente lo que medirá impreso, y los gráficos —que se dibujan contra el ancho de su
          contenedor— salen del mismo tamaño en pantalla y en el papel, sin reescalados. */}
      <div className="report-sheet mx-auto my-6 w-[794px] max-w-full">
        <article className="report-page flex flex-col gap-9 rounded-[13px] bg-surface px-[53px] py-[53px] shadow-[0_10px_30px_rgba(15,23,42,0.08)] print:rounded-none print:shadow-none">
          <ReportCover cover={cover} />

          <ReportSection section={sectionOf("resumen")}>
            <div className="print-keep flex gap-4">
              {graficos.tiles.map((tile) => (
                <StatTile
                  key={tile.id}
                  label={tile.label}
                  value={tile.value === null ? null : formatCurrency(tile.value)}
                  hint={graficos.periodName}
                  sign={tile.sign}
                />
              ))}
            </div>
          </ReportSection>

          <ReportSection section={sectionOf("graficos")}>
            <ReportCards cards={graficos.cards} />
          </ReportSection>

          <ReportSection section={sectionOf("analisis")}>
            <ReportCards cards={analisis.cards} />
          </ReportSection>

          {showVertical && statement && (
            <ReportSection section={sectionOf("vertical")}>
              <ReportVertical
                grid={statement.grid}
                periods={statement.periods}
                baseRow={statement.base}
                centerName={centerName(views, activeCenterId)}
                collapsed={reportCollapsed}
              />
            </ReportSection>
          )}

          <ReportSection section={sectionOf("estado")}>
            {statement && (
              <ReportStatement
                grid={statement.grid}
                periods={statement.periods}
                baseRow={statement.revenue}
                notes={statement.notes}
                collapsed={reportCollapsed}
                hiddenAccounts={hiddenAccounts}
              />
            )}
          </ReportSection>

          {annex && (
            <ReportSection section={sectionOf("centros")}>
              <ReportCentersAnnex annex={annex} />
            </ReportSection>
          )}
        </article>
      </div>
    </section>,
    document.body,
  );
}

function centerName(
  views: readonly { id: string; name: string }[],
  activeCenterId: string,
): string {
  return views.find((view) => view.id === activeCenterId)?.name ?? "Consolidado";
}

/** Escape closes, like every other layer in the app. */
function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/**
 * The browser takes the suggested filename from `document.title`, so the title becomes the
 * report's name while the preview is open and goes back to the app's on the way out — restored
 * in the cleanup rather than on `afterprint`, so closing without printing restores it too.
 */
function usePrintTitle(title: string) {
  const original = useRef<string>("");
  useEffect(() => {
    original.current = document.title;
    document.title = title;
    return () => {
      document.title = original.current;
    };
  }, [title]);
}
