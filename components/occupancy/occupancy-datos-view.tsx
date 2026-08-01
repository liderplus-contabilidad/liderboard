"use client";

import { useCallback, useMemo, useState } from "react";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MONTHS_FULL_ES } from "@/lib/date";
import { monthHasData } from "@/lib/occupancy/derive";
import type { Frequency } from "@/lib/period";
import { CenterTabs } from "./center-tabs";
import { NoHotelsEmptyState, NoOccupancyDataEmptyState } from "./occupancy-empty-state";
import { MonthTabs } from "./month-tabs";
import { useOccupancyData } from "./occupancy-data-provider";
import { OccupancyGrid } from "./occupancy-grid";
import { YearTabs } from "./year-tabs";

/** What the annual grid's caption adds to the year. Months are the default; they say nothing. */
const ANNUAL_SUFFIX: Record<Frequency, string> = {
  mensual: "",
  trimestral: "por trimestre",
  semestral: "por semestre",
  anual: "",
};

/** Column names come off the grid's own labels, which is what makes this work at every scope. */
function mismatchDetails(
  channelColumns: number[],
  roomColumns: number[],
  scope: "month" | "year",
  columnLabels: readonly string[],
): string[] {
  const details: string[] = [];
  const noun = scope === "year" ? "periodos" : "días";
  const list = (columns: number[]) => columns.map((c) => columnLabels[c] ?? c + 1).join(", ");
  if (channelColumns.length > 0) {
    details.push(`Suma de canales ≠ vendidas + complementarias: ${noun} ${list(channelColumns)}`);
  }
  if (roomColumns.length > 0) {
    details.push(
      `Suma de tipos de habitación ≠ vendidas + complementarias: ${noun} ${list(roomColumns)}`,
    );
  }
  return details;
}

/**
 * Indicators are never stored — they are recomputed from the raw inputs on each render, so
 * editing a cell updates them immediately.
 */
export function OccupancyDatosView() {
  const {
    datasets,
    activeHotelId,
    centers,
    activeCenterId,
    activeCenterName,
    isConsolidated,
    hasConsolidated,
    setActiveCenter,
    years,
    activeYear,
    setActiveYear,
    monthIndex,
    setMonthIndex,
    gridScope,
    setGridScope,
    gridFrequency,
    setGridFrequency,
    dataset,
    grid,
    canEdit,
    ready,
    saveCell,
    saveNights,
    addChannel,
    removeChannel,
    addYear,
    deleteYear,
    deleteCenter,
    importError,
    importErrorDetails,
    dismissImportError,
  } = useOccupancyData();

  const [pendingChannel, setPendingChannel] = useState<{ id: string; name: string } | null>(null);
  const [warningsDismissed, setWarningsDismissed] = useState(false);

  const yearsByCenter = useMemo(() => {
    const byCenter: Record<string, number[]> = {};
    for (const stored of datasets) {
      (byCenter[stored.centerId] ??= []).push(stored.year);
    }
    return byCenter;
  }, [datasets]);

  const onSaveCell = useCallback(
    (rowId: string, dayIndex: number, value: number) => {
      void saveCell(rowId, dayIndex, value);
    },
    [saveCell],
  );

  const onAddChannel = useCallback(
    (name: string) => {
      void addChannel(name);
    },
    [addChannel],
  );

  // An all-zero row has nothing to lose, so it goes without asking: a confirmation there would
  // be just a click to dismiss.
  const onRemoveChannel = useCallback(
    (id: string) => {
      const channel = dataset?.channels.find((candidate) => candidate.id === id);
      if (!channel) {
        return;
      }
      const cells = grid?.rows.find((r) => r.id === `channel:${id}`)?.cells ?? [];
      if (cells.some((value) => value !== null && value !== 0)) {
        setPendingChannel(channel);
      } else {
        void removeChannel(id);
      }
    },
    [dataset, grid, removeChannel],
  );

  const banner = importError ? (
    <NoticeBanner
      onDismiss={dismissImportError}
      details={importErrorDetails.length > 1 ? importErrorDetails : undefined}
      className="mb-3.5"
    >
      {importError}
    </NoticeBanner>
  ) : null;

  if (!ready) {
    return null;
  }

  // Dos huecos distintos: sin hotel no falta un Excel, falta crear el hotel — y hasta que exista,
  // no hay dónde cargar nada.
  if (activeHotelId === null) {
    return (
      <div className="px-7 py-5">
        {banner}
        <NoHotelsEmptyState />
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="px-7 py-5">
        {banner}
        <NoOccupancyDataEmptyState
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void addYear(new Date().getFullYear())}
            >
              Empezar {new Date().getFullYear()} en blanco
            </Button>
          }
        >
          Sin datos de ocupación. Carga uno o varios Excel a la vez (uno por sucursal y año) con
          «Cargar Excel», o empieza un año en blanco y escríbelo a mano.
        </NoOccupancyDataEmptyState>
      </div>
    );
  }

  const warnings = dataset?.warnings ?? [];
  const details = grid
    ? mismatchDetails(grid.channelMismatch, grid.roomMismatch, gridScope, grid.columnLabels)
    : [];
  const isAnnual = gridScope === "year";
  const monthLabel = isAnnual
    ? [String(activeYear ?? ""), ANNUAL_SUFFIX[gridFrequency]].filter(Boolean).join(" · ")
    : `${MONTHS_FULL_ES[monthIndex]} ${activeYear ?? ""}`.trim();
  // Named above the grid even when its strip is hidden, so the table always says which one.
  const centerLabel = isConsolidated || centers.length > 1 ? activeCenterName : undefined;
  const activeHasData = Boolean(dataset?.months.some((month) => monthHasData(month)));

  return (
    <div className="px-7 py-5">
      {banner}

      <CenterTabs
        centers={centers}
        activeCenterId={activeCenterId}
        hasConsolidated={hasConsolidated}
        yearsByCenter={yearsByCenter}
        onSelect={setActiveCenter}
        onDelete={(centerId) => void deleteCenter(centerId)}
      />

      <YearTabs
        years={years}
        activeYear={activeYear}
        activeHasData={activeHasData}
        onSelect={setActiveYear}
        onAdd={(next) => void addYear(next)}
        onDelete={isConsolidated ? undefined : (next) => void deleteYear(next)}
      />

      {warnings.length > 0 && !warningsDismissed && (
        <NoticeBanner
          onDismiss={() => setWarningsDismissed(true)}
          details={warnings}
          className="mb-3.5"
        >
          El archivo cargado tiene {warnings.length} {warnings.length === 1 ? "aviso" : "avisos"} de
          lectura; se muestran los valores tal cual.
        </NoticeBanner>
      )}

      {dataset && (
        <MonthTabs
          dataset={dataset}
          activeIndex={monthIndex}
          scope={gridScope}
          frequency={gridFrequency}
          onSelect={(index) => {
            // Picking a month is itself the way back from the annual view.
            setGridScope("month");
            setMonthIndex(index);
          }}
          onSelectScope={setGridScope}
          onSelectFrequency={setGridFrequency}
          onSaveNights={canEdit ? (nights) => void saveNights(nights) : undefined}
        />
      )}

      {grid && details.length > 0 && (
        <NoticeBanner details={details} className="mb-3.5">
          {grid.mismatch.length}{" "}
          {isAnnual
            ? grid.mismatch.length === 1
              ? "periodo no cuadra"
              : "periodos no cuadran"
            : grid.mismatch.length === 1
              ? "día no cuadra"
              : "días no cuadran"}{" "}
          en {isAnnual ? activeYear : MONTHS_FULL_ES[monthIndex]}. Se muestran los valores tal cual.
        </NoticeBanner>
      )}

      {grid && grid.paxOverrides.length > 0 && (
        <NoticeBanner className="mb-3.5">
          PAX declarado a mano en{" "}
          {grid.paxOverrides.length === 1
            ? `el día ${grid.paxOverrides[0] + 1}`
            : `los días ${grid.paxOverrides.map((d) => d + 1).join(", ")}`}
          : no coincide con simples·1 + dobles·2 + triples·3. Suele ser una cama extra; se respeta
          el valor declarado.
        </NoticeBanner>
      )}

      {grid && (
        <OccupancyGrid
          grid={grid}
          monthLabel={monthLabel}
          centerLabel={centerLabel}
          readOnly={!canEdit}
          onSaveCell={onSaveCell}
          onAddChannel={onAddChannel}
          onRemoveChannel={onRemoveChannel}
        />
      )}

      <ConfirmDialog
        open={pendingChannel !== null}
        variant="destructive"
        title={`¿Quitar el canal «${pendingChannel?.name}»?`}
        description={`Se eliminará la fila y sus noches de ${monthLabel}. Los demás meses no se tocan.`}
        confirmLabel="Quitar"
        onConfirm={() => {
          if (pendingChannel) {
            void removeChannel(pendingChannel.id);
          }
          setPendingChannel(null);
        }}
        onCancel={() => setPendingChannel(null)}
      />
    </div>
  );
}
