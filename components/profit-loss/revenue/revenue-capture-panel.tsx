"use client";

import { AlertTriangle } from "lucide-react";
import { useCallback, useMemo } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SidePanel } from "@/components/ui/side-panel";
import { formatPercent } from "@/lib/format";
import { monthSpanLabel } from "@/lib/revenue/filters";
import { scopeToMonths } from "@/lib/revenue/derive";
import { readRatio } from "@/lib/revenue/ratio";
import { RATIO_DESCRIPTORS, seriesOf } from "@/lib/revenue/series";
import {
  MONTHS_IN_YEAR,
  type RevenueExternalAmounts,
  type RevenueYearInput,
} from "@/lib/revenue/types";
import { RevenueCaptureGrid } from "./revenue-capture-grid";
import { useRevenueData } from "./revenue-data-provider";

const ALL_MONTHS = Array.from({ length: MONTHS_IN_YEAR }, (_, index) => index);

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
 */
export function RevenueCapturePanel({ onClose }: { onClose: () => void }) {
  const {
    clientName,
    universe,
    captureYear,
    setCaptureYear,
    captureSeries,
    captureRevenue,
    saveCapture,
  } = useRevenueData();

  const commit = useCallback(
    (monthIndex: number, key: keyof RevenueExternalAmounts, value: number | null) => {
      // The row is written WHOLE: `db.ts` stores a month, not a cell, so the other two columns travel
      // with it unchanged. Sending only the edited field would blank the two beside it.
      void saveCapture(monthIndex, {
        cardRevenue: captureSeries.cardRevenue[monthIndex],
        cardFees: captureSeries.cardFees[monthIndex],
        adSpend: captureSeries.adSpend[monthIndex],
        [key]: value,
      });
    },
    [saveCapture, captureSeries],
  );

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
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-faint">
            Año
          </span>
          {captureYear !== null && (
            <SegmentedControl
              value={String(captureYear)}
              options={universe.years.map((year) => ({ value: String(year), label: String(year) }))}
              onChange={(value) => setCaptureYear(Number(value))}
              ariaLabel="Año que se registra"
            />
          )}
          <span className="ml-auto text-[11.5px] text-muted">{captured} de 12 meses</span>
        </div>

        <div className="rounded-[13px] border border-border">
          <RevenueCaptureGrid series={captureSeries} revenue={captureRevenue} onCommit={commit} />
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

        <p className="text-[11.5px] text-faint">Se guarda al salir de la celda.</p>
      </div>
    </SidePanel>
  );
}
