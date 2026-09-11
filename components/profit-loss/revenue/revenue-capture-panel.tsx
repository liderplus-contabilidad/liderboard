"use client";

import { AlertTriangle, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ExcelActions } from "@/components/ui/excel-actions";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { SidePanel } from "@/components/ui/side-panel";
import { cn } from "@/lib/cn";
import { downloadBlob } from "@/lib/download";
import { formatPercent } from "@/lib/format";
import { maxCaptureYear, parseYearInput } from "@/lib/year-input";
import type { CaptureYearRows } from "@/lib/revenue/capture-workbook";
import { monthSpanLabel } from "@/lib/revenue/filters";
import { scopeToMonths } from "@/lib/revenue/derive";
import { readRatio } from "@/lib/revenue/ratio";
import { RATIO_DESCRIPTORS, SERIES_LABELS, seriesOf } from "@/lib/revenue/series";
import {
  hasAnyAmount,
  MONTHS_IN_YEAR,
  type RevenueExternalAmounts,
  type RevenueYearInput,
} from "@/lib/revenue/types";
import { RevenueCaptureGrid } from "./revenue-capture-grid";
import { useRevenueData } from "./revenue-data-provider";

const ALL_MONTHS = Array.from({ length: MONTHS_IN_YEAR }, (_, index) => index);

/** «2022, 2023 y 2024» — how the confirmation names the years a file brings. */
function joinYears(years: readonly number[]): string {
  if (years.length <= 1) {
    return years.join("");
  }
  return `${years.slice(0, -1).join(", ")} y ${years[years.length - 1]}`;
}

/**
 * Where the three external figures are written.
 *
 * **A drawer and not a modal**, which is the rule `side-panel.tsx` vs `modal.tsx` states: the modal
 * interrupts and dims what is behind for something read ALONE, and this is read ALONGSIDE what opened
 * it — June's figure is typed and the card's percentage is seen moving behind. That is not a nicety;
 * it is the feedback that tells the user the number landed where they meant it to.
 *
 * The year has its OWN selector, independent of the bar's marks: what is being written is a year's
 * ledger, and having to unmark a comparison in order to fill in a month would make the two gestures
 * fight each other.
 *
 * It also carries the capture's OWN Excel («Descargar Excel» / «Cargar Excel»): every year of the
 * drawer out as one flat sheet, and that same sheet back in replacing each year it names whole —
 * never a «Ventas» the estado de resultados answers. The rule lives in the provider
 * (`replaceCaptureYears`) and the file in `lib/revenue/capture-workbook.ts`; this panel only wires
 * the pick, the error and the confirmation.
 */
export function RevenueCapturePanel({ onClose }: { onClose: () => void }) {
  const {
    clientName,
    captureYear,
    setCaptureYear,
    captureYears,
    addCaptureYear,
    canRemoveCaptureYear,
    storedMonthsIn,
    removeCaptureYear,
    captureSeries,
    captureRevenue,
    captureCoverage,
    saveCapture,
    saveCaptureMonths,
    captureRowsForExport,
    replaceCaptureYears,
  } = useRevenueData();

  const commit = useCallback(
    (monthIndex: number, key: keyof RevenueExternalAmounts, value: number | null) => {
      // The row is written WHOLE: `db.ts` stores a month, not a cell, so the other two columns travel
      // with it unchanged. Sending only the edited field would blank the two beside it.
      void saveCapture(monthIndex, {
        manualRevenue: captureSeries.manualRevenue[monthIndex],
        cardRevenue: captureSeries.cardRevenue[monthIndex],
        cardFees: captureSeries.cardFees[monthIndex],
        adSpend: captureSeries.adSpend[monthIndex],
        [key]: value,
      });
    },
    [saveCapture, captureSeries],
  );

  const pasteMonths = useCallback(
    (months: readonly { monthIndex: number; amounts: RevenueExternalAmounts }[]) => {
      void saveCaptureMonths(months);
    },
    [saveCaptureMonths],
  );

  const [yearDraft, setYearDraft] = useState("");
  const [yearError, setYearError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);

  // Read once per mount: the ceiling must not shift under the user mid-session, and a value read on
  // every render would make the field's rule depend on when it happened to be typed.
  const maxYear = useMemo(() => maxCaptureYear(new Date()), []);

  /**
   * The year is TYPED and not picked off a strip. A firm with a decade of history needs to reach 2016
   * without a control that grows a button per year — which is exactly what stopped fitting the panel.
   *
   * The check is `parseYearInput`'s and not this component's: it is the rule, it is in the pure layer
   * and it is covered by Vitest. Here only the draft and the message live.
   */
  const submitYear = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const result = parseYearInput(yearDraft, maxYear);
      if (!result.ok) {
        setYearError(result.message);
        return;
      }
      setYearError(null);
      setYearDraft("");
      addCaptureYear(result.year);
    },
    [yearDraft, maxYear, addCaptureYear],
  );

  /**
   * A year with nothing written is taken off without asking — there is nothing to lose, and a
   * confirmation over an empty year trains the user to dismiss the one that does matter. A year that
   * HOLDS figures always asks, and the question counts them.
   */
  const askRemove = useCallback(
    (year: number) => {
      if (storedMonthsIn(year) === 0) {
        void removeCaptureYear(year);
        return;
      }
      setPendingRemoval(year);
    },
    [storedMonthsIn, removeCaptureYear],
  );

  const confirmRemoval = useCallback(async () => {
    if (pendingRemoval === null) {
      return;
    }
    setRemoving(true);
    await removeCaptureYear(pendingRemoval);
    setRemoving(false);
    setPendingRemoval(null);
  }, [pendingRemoval, removeCaptureYear]);

  const removalMonths = pendingRemoval === null ? 0 : storedMonthsIn(pendingRemoval);

  /**
   * The Excel of the capture: what is on this drawer, out as a file, and back in as the same rows.
   *
   * No staging modal as in Ventas —one file, one format, one yes/no— so the file input is hidden and
   * the parse runs straight off the pick. What it read WAITS in `pendingImport` behind a
   * `ConfirmDialog`, the same one «Quitar año» uses, because replacing a year that holds figures is
   * as destructive as removing it. A rejected file shows its message here and opens nothing.
   */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<CaptureYearRows[] | null>(null);
  const [importing, setImporting] = useState(false);

  const downloadCapture = useCallback(async () => {
    // Dynamic import: ExcelJS does not go into the drawer's bundle for a button most sessions never
    // press.
    const { buildCaptureWorkbook, captureWorkbookFilename } =
      await import("@/lib/revenue/capture-workbook");
    const header = { clientName: clientName ?? "Cliente" };
    const buffer = await buildCaptureWorkbook(captureRowsForExport(), header).xlsx.writeBuffer();
    downloadBlob(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      captureWorkbookFilename(header),
    );
  }, [captureRowsForExport, clientName]);

  const pickFile = useCallback(async (list: FileList | null) => {
    // Materialized BEFORE the first `await`: the input's value is cleared right afterwards, and that
    // empties the live `FileList`.
    const file = list?.[0];
    if (!file) {
      return;
    }
    setImportError(null);
    try {
      const { parseCaptureWorkbook } = await import("@/lib/revenue/capture-workbook");
      const result = parseCaptureWorkbook(await file.arrayBuffer());
      if (!result.ok) {
        setImportError(result.message);
        return;
      }
      if (result.years.length === 0) {
        setImportError("El archivo tiene la cabecera pero ninguna fila de datos.");
        return;
      }
      setPendingImport(result.years);
    } catch {
      setImportError("El archivo no es un Excel que se pueda leer.");
    }
  }, []);

  const confirmImport = useCallback(async () => {
    if (pendingImport === null) {
      return;
    }
    setImporting(true);
    try {
      await replaceCaptureYears(pendingImport);
    } finally {
      setImporting(false);
      setPendingImport(null);
    }
  }, [pendingImport, replaceCaptureYears]);

  const importYears = pendingImport?.map((entry) => entry.year) ?? [];
  const importMonths =
    pendingImport?.reduce(
      (count, entry) => count + entry.months.filter((amounts) => hasAnyAmount(amounts)).length,
      0,
    ) ?? 0;

  /**
   * The three figures the capture produces, recomputed live from the SAME `ratio.ts` the cards read.
   * Nothing is stored: a percentage written down would go stale at the next adjustment in Datos.
   */
  const shares = useMemo(() => {
    // The same input shape the cards are built from, so the drawer's figures come out of `seriesOf`
    // and `readRatio` exactly as the card behind it does. A second way of picking a series here is how
    // the drawer would start showing a percentage the card does not.
    const input: RevenueYearInput = {
      year: captureYear ?? 0,
      monthlyRevenue: scopeToMonths(captureRevenue, ALL_MONTHS),
      external: captureSeries,
    };
    return RATIO_DESCRIPTORS.map((descriptor) => {
      const reading = readRatio(
        seriesOf(input, descriptor.numerator),
        seriesOf(input, descriptor.denominator),
      );
      return { id: descriptor.id, label: descriptor.shareLabel, percent: reading.percent };
    });
  }, [captureSeries, captureRevenue, captureYear]);

  /** Months with sales loaded and nothing written: what is keeping the percentages back. */
  const pending = useMemo(
    () =>
      ALL_MONTHS.filter(
        (month) =>
          captureRevenue[month] !== null &&
          captureSeries.cardRevenue[month] === null &&
          captureSeries.cardFees[month] === null &&
          captureSeries.adSpend[month] === null,
      ),
    [captureRevenue, captureSeries],
  );

  const captured = ALL_MONTHS.filter(
    (month) =>
      captureSeries.manualRevenue[month] !== null ||
      captureSeries.cardRevenue[month] !== null ||
      captureSeries.cardFees[month] !== null ||
      captureSeries.adSpend[month] !== null,
  ).length;

  return (
    <SidePanel
      width={560}
      title="Registrar datos externos"
      eyebrow={<span className="text-[11.5px] text-faint">{clientName}</span>}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {/* The drawer's own Excel: the capture out as a file and back in as the same rows. It is the
            app's ONE Excel control and not a pair of buttons of its own — and it lives HERE and not in
            the bar, because what it moves is what this drawer owns. FIRST, above the years: it acts on
            every year at once, and a control that sits under the strip of years reads as belonging to
            the one that is marked. */}
        <div className="flex items-center justify-between gap-3">
          <ExcelActions
            upload={{ label: "Cargar Excel", onClick: () => fileInputRef.current?.click() }}
            downloads={[
              {
                id: "capture",
                title: "Datos registrados",
                description: "Todos los años del panel, tal cual, listos para volver a cargar.",
                disabled: captureYears.length === 0,
                disabledReason: "Agrega un año primero.",
                run: downloadCapture,
              },
            ]}
            downloadLabel="Descargar Excel"
            info={{
              title: "¿Qué archivo acepta?",
              children: (
                <div className="flex flex-col gap-2">
                  <p>
                    El Excel que descarga este mismo panel: una hoja con la cabecera{" "}
                    <strong>Año · Mes · Ventas · Cobros TC · Comis. TC · Publicidad</strong> y una
                    fila por mes. Se puede editar en Excel antes de volver a subirlo; la cabecera se
                    busca donde esté y el nombre del archivo no participa.
                  </p>
                  <p>
                    <strong>Cada año que trae el archivo se reemplaza completo.</strong> Una celda
                    vacía es «no se registró»; los años que el archivo no trae no se tocan.
                  </p>
                  <p>
                    Los meses de «{SERIES_LABELS.ventas}» que ya vienen del estado de resultados
                    nunca se escriben desde el archivo: esa cifra la manda Datos.
                  </p>
                </div>
              ),
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            aria-label="Cargar el Excel de datos registrados"
            onChange={(event) => {
              void pickFile(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        {importError && (
          <NoticeBanner onDismiss={() => setImportError(null)}>{importError}</NoticeBanner>
        )}

        {/* Two ROWS and not one. The list of years grows with the client's history, so anything sharing
            its line —a button, a counter— gets pushed out of the panel the moment a fifth year
            appears, which is exactly what a strip of five years did. Here the field and the counter
            keep a line of their own and the years wrap underneath, however many there are. */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-faint">
              Año
            </span>
            <form onSubmit={submitYear} className="flex items-center gap-2">
              <input
                value={yearDraft}
                onChange={(event) => {
                  setYearDraft(event.target.value);
                  // The message goes as soon as the field is touched: an error still sitting under a
                  // field the user has already corrected reads as a second, new complaint.
                  setYearError(null);
                }}
                inputMode="numeric"
                maxLength={4}
                placeholder="2024"
                aria-label="Agregar un año"
                aria-invalid={yearError !== null}
                className={cn(
                  "h-[34px] w-[76px] rounded-[9px] border bg-surface px-2.5 text-center font-mono text-[12.5px] tabular-nums text-ink outline-none transition-colors placeholder:text-faintest",
                  yearError ? "border-negative" : "border-border focus:border-brand",
                )}
              />
              <Button type="submit" variant="secondary" size="toolbar">
                Agregar
              </Button>
            </form>
            <span className="ml-auto shrink-0 text-[11.5px] text-muted">
              {captured} de 12 meses
            </span>
          </div>

          {yearError && <p className="text-[11.5px] text-negative">{yearError}</p>}

          {captureYears.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {captureYears.map((year) => {
                const active = year === captureYear;
                const removable = canRemoveCaptureYear(year);
                return (
                  <span
                    key={year}
                    className={cn(
                      "inline-flex items-center rounded-full border py-1 pl-3 text-[12px] font-semibold tabular-nums transition-colors",
                      removable ? "pr-1" : "pr-3",
                      active
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-border bg-surface text-ink-soft",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setCaptureYear(year)}
                      aria-pressed={active}
                      aria-label={`Registrar ${year}`}
                      className="font-mono"
                    >
                      {year}
                    </button>
                    {/* Only a year the drawer OWNS carries an ×. One the estado de resultados declares
                        is the workspace's, and an × over it would promise a removal this screen cannot
                        perform — the months would still be in Datos. */}
                    {removable && (
                      <button
                        type="button"
                        onClick={() => askRemove(year)}
                        aria-label={`Quitar ${year}`}
                        className="ml-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-sunken hover:text-negative"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-[13px] border border-border">
          <RevenueCaptureGrid
            series={captureSeries}
            revenue={captureRevenue}
            coverage={captureCoverage}
            onCommit={commit}
            onPasteMonths={pasteMonths}
          />
        </div>

        <div className="rounded-[13px] border border-border bg-surface-sunken px-4 py-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-faint">
            Lo que sale de estas cifras
          </p>
          <div className="mt-2 flex items-start gap-6">
            {shares.map((share) => (
              <div key={share.id} className="flex flex-col gap-0.5">
                <span className="text-[11.5px] text-muted">{share.label}</span>
                <span className="font-mono text-[17px] font-semibold tabular-nums text-ink">
                  {share.percent === null ? "—" : formatPercent(share.percent)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {pending.length > 0 && (
          <p className="flex items-start gap-2 text-[11.5px] leading-snug text-muted">
            <AlertTriangle size={14} className="mt-px shrink-0 text-warning" aria-hidden />
            <span>
              {/* The tramo, never the list: the cards say «Ene–Jul» and a drawer enumerating seven
                  month names beside them reads as a different span. `monthSpanLabel` still spells out
                  a set with gaps, which is the case where a range would lie. */}
              <b className="text-ink">{monthSpanLabel(pending)}</b> ya{" "}
              {pending.length === 1 ? "tiene ventas cargadas" : "tienen ventas cargadas"} y ninguna
              cifra registrada. {pending.length === 1 ? "Ese mes queda" : "Esos meses quedan"} fuera
              de los tres porcentajes hasta que se escriba.
            </span>
          </p>
        )}

        <ConfirmDialog
          open={pendingRemoval !== null}
          title={`¿Quitar ${pendingRemoval ?? ""}?`}
          description={`Se borrarán las cifras de ${removalMonths} ${
            removalMonths === 1 ? "mes registradas" : "meses registradas"
          } en ${pendingRemoval ?? ""}. No se puede deshacer.`}
          confirmLabel="Quitar año"
          variant="destructive"
          busy={removing}
          onConfirm={() => void confirmRemoval()}
          onCancel={() => setPendingRemoval(null)}
        />

        <ConfirmDialog
          open={pendingImport !== null}
          title={
            importYears.length === 1
              ? `¿Reemplazar ${importYears[0]} con el archivo?`
              : `¿Reemplazar ${importYears.length} años con el archivo?`
          }
          description={`Se ${importYears.length === 1 ? "reemplazará" : "reemplazarán"} ${
            importYears.length === 1 ? importYears[0] : joinYears(importYears)
          } por completo con los ${importMonths} ${
            importMonths === 1 ? "mes registrado" : "meses registrados"
          } que trae el archivo. Los meses de «${SERIES_LABELS.ventas}» que vienen del estado de resultados no cambian. No se puede deshacer.`}
          confirmLabel="Cargar"
          variant="destructive"
          busy={importing}
          onConfirm={() => void confirmImport()}
          onCancel={() => setPendingImport(null)}
        />

        <p className="text-[11.5px] leading-snug text-faint">
          Se guarda al salir de la celda. Para cargar un año entero, copia la columna en Excel, haz
          clic en el mes donde empieza y pega con Ctrl+V; para llevarte todos los años o traerlos de
          vuelta, usa «Descargar Excel» y «Cargar Excel». Los meses de «{SERIES_LABELS.ventas}» que
          ya vienen del estado de resultados se muestran en gris y no se escriben.
        </p>
      </div>
    </SidePanel>
  );
}
