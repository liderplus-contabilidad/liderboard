"use client";

import { BedDouble } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { MONTHS_FULL_ES } from "@/lib/date";
import { CenterTabs } from "./center-tabs";
import { MonthTabs } from "./month-tabs";
import { useOccupancyData } from "./occupancy-data-provider";
import { OccupancyGrid } from "./occupancy-grid";
import { YearTabs } from "./year-tabs";

/**
 * Wording for the cuadre banner's expandable detail. The columns are days in the monthly view
 * and months in the annual one, so both the noun and how they are named change.
 */
function mismatchDetails(
  channelColumns: number[],
  roomColumns: number[],
  scope: "month" | "year",
): string[] {
  const details: string[] = [];
  const noun = scope === "year" ? "meses" : "días";
  const list = (columns: number[]) =>
    columns.map((c) => (scope === "year" ? MONTHS_FULL_ES[c] : String(c + 1))).join(", ");
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
 * The Ocupaciones › Datos body: sucursal, year and month selectors over the grid.
 *
 * Indicators are never stored — they are recomputed from the raw inputs on each render, so
 * editing a cell updates them immediately.
 */
export function OccupancyDatosView() {
  const {
    datasets,
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

  // Removing a channel drops its nights for THIS month only. An all-zero row has nothing to
  // lose, so it goes straight away — a confirmation there is just a click to dismiss.
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

  if (datasets.length === 0) {
    return (
      <div className="px-7 py-5">
        {banner}
        <div className="rounded-[13px] border border-border bg-surface">
          <EmptyState icon={<BedDouble size={22} />} className="py-14">
            Sin datos de ocupación. Carga uno o varios Excel a la vez (uno por sucursal y año) con
            «Cargar Excel de ocupación», o empieza un año en blanco y escríbelo a mano.
          </EmptyState>
          <div className="flex justify-center pb-8">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void addYear(new Date().getFullYear())}
            >
              Empezar {new Date().getFullYear()} en blanco
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const warnings = dataset?.warnings ?? [];
  const details = grid ? mismatchDetails(grid.channelMismatch, grid.roomMismatch, gridScope) : [];
  const isAnnual = gridScope === "year";
  // In the annual view the title already says "Detalle anual", so the year stands alone.
  const monthLabel = isAnnual
    ? String(activeYear ?? "")
    : `${MONTHS_FULL_ES[monthIndex]} ${activeYear ?? ""}`.trim();
  // Named above the grid even when its strip is hidden, so the table always says which one.
  const centerLabel = isConsolidated || centers.length > 1 ? activeCenterName : undefined;
  const activeHasData = Boolean(
    dataset?.months.some((month) => month.fromFile || month.inputs.sold.some((v) => v !== 0)),
  );

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
          onSelect={(index) => {
            // Picking a month is itself the way back from the annual view.
            setGridScope("month");
            setMonthIndex(index);
          }}
          onSelectScope={setGridScope}
          onSaveNights={canEdit ? (nights) => void saveNights(nights) : undefined}
        />
      )}

      {grid && details.length > 0 && (
        <NoticeBanner details={details} className="mb-3.5">
          {grid.mismatch.length}{" "}
          {isAnnual
            ? grid.mismatch.length === 1
              ? "mes no cuadra"
              : "meses no cuadran"
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
