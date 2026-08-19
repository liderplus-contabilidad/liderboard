"use client";

import { FilePlus2, FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ExcelActions, type ExcelDownloadOption } from "@/components/ui/excel-actions";
import { pluralize } from "@/lib/format";
import type { CenterLogos, EntityLogo } from "@/lib/logos";
import { consolidatedCenterId } from "@/lib/profit-loss/consolidate";
import { datasetEdits } from "@/lib/profit-loss/db";
import { CostCenterUploadModal } from "./cost-center-upload-modal";
import { usePygData } from "./pyg-data-provider";

/**
 * Excel actions for Profit and Loss. Integrates the provider and upload modal with `ExcelActions`,
 * which handles rendering, progress, and errors. Used in tabs (`ModuleTabs`) and empty states
 * (`PygEmptyState`) to upload or download files.
 *
 * The download menu includes options like «Excel completo» (entire workspace, re-uploadable) and
 * «Un mes en crudo» (latest loaded month in accounting system format). The latter is only
 * available if the workspace supports writing its format. Accepted formats are loaded
 * dynamically. In the CONSOLIDADO the file is instead the sum plus one sheet per piece it summed
 * — every (cliente · centro) that entered and the whole statement of each single-mode client.
 */
function withoutZeros(hide: boolean, description: string): string {
  return hide ? `${description}, sin las cuentas en cero` : description;
}

export function PygExcelActions() {
  const {
    clients,
    activeClientId,
    activeClient,
    isConsolidated,
    contributors,
    consolidatedDetails,
    dataset,
    datasets,
    views,
    mode,
    loadedYears,
    visibleYears,
    loadedMonthsByYear,
    sourceSystemId,
    hideZeroRows,
  } = usePygData();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [acceptedFormats, setAcceptedFormats] = useState<{ id: string; label: string }[]>([]);
  const [writableSystems, setWritableSystems] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("@/lib/profit-loss/upload/registry").then(
      ({ acceptedFileFormats, writableSystemIds }) => {
        if (!cancelled) {
          setAcceptedFormats(acceptedFileFormats());
          setWritableSystems(writableSystemIds());
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const canWriteRawMonth = Boolean(sourceSystemId && writableSystems?.includes(sourceSystemId));

  /**
   * Los logos que encabezan cada hoja del consolidado: el del CLIENTE a la izquierda y el de su
   * CENTRO a la derecha. Los centros se indexan por el id COMPUESTO `<clientId>::<centerId>`, que
   * es el que llevan las piezas — el mismo centro existe en varias empresas, así que el suelto
   * emparejaría con la primera que lo declarara.
   */
  const consolidatedLogos = useMemo(() => {
    const clientLogos: Record<string, EntityLogo> = {};
    const centerLogos: CenterLogos = {};
    for (const client of clients) {
      if (client.logo) {
        clientLogos[client.id] = client.logo;
      }
      for (const [centerId, logo] of Object.entries(client.centerLogos ?? {})) {
        centerLogos[consolidatedCenterId(client.id, centerId)] = logo;
      }
    }
    return { clientLogos, centerLogos };
  }, [clients]);

  const centerViews = useMemo(
    () => views.filter((v) => v.role === "center" || v.role === "sin-centro"),
    [views],
  );

  const rawYear = visibleYears.length === 1 ? visibleYears[0] : null;
  const rawYearMonths = rawYear === null ? [] : (loadedMonthsByYear[rawYear] ?? []);
  const latestLoadedMonth = rawYearMonths.length > 0 ? Math.max(...rawYearMonths) : null;
  const anyMonthLoaded = Object.values(loadedMonthsByYear).some((months) => months.length > 0);
  const severalYearsReason =
    "Hay varios años a la vista; elige uno para descargar un mes en crudo.";

  const downloads = useMemo<ExcelDownloadOption[]>(() => {
    if (isConsolidated) {
      return [
        {
          id: "consolidado",
          title: "Excel consolidado",
          description: withoutZeros(
            hideZeroRows,
            consolidatedDetails.length > 0
              ? `Suma de ${pluralize(contributors.length, "cliente")}: el total por año y una hoja por cada cliente y centro que entra`
              : `Suma de ${pluralize(contributors.length, "cliente")}, una hoja por año`,
          ),
          icon: FileSpreadsheet,
          iconClassName: "text-brand",
          disabled: datasets.length === 0,
          disabledReason: "Todavía no hay nada que consolidar.",
          run: async () => {
            const [exportMod, { downloadBlob }] = await Promise.all([
              import("@/lib/profit-loss/export"),
              import("@/lib/download"),
            ]);
            const workbook = exportMod.buildConsolidatedWorkbook({
              datasets,
              // Las piezas que la suma tomó, tal como las devolvió `consolidate.ts`: así el archivo
              // no puede traer hojas que no cuadren con su propio total.
              details: consolidatedDetails,
              loadedMonthsByYear,
              hideEmpty: hideZeroRows,
              clientLogos: consolidatedLogos.clientLogos,
              centerLogos: consolidatedLogos.centerLogos,
            });
            const blob = await exportMod.workbookToBlob(workbook);
            downloadBlob(blob, exportMod.consolidatedFilename(loadedYears));
          },
        },
      ];
    }

    if (mode === "multi") {
      const noMonthsReason = "Carga un mes primero.";
      const options: ExcelDownloadOption[] = [
        {
          id: "completo",
          title: "Excel completo",
          description: withoutZeros(
            hideZeroRows,
            "Todo el espacio de trabajo: la hoja consolidada y una por centro, se puede volver a subir",
          ),
          icon: FileSpreadsheet,
          iconClassName: "text-brand",
          disabled: !anyMonthLoaded,
          disabledReason: noMonthsReason,
          run: async () => {
            const [exportMod, { downloadBlob }] = await Promise.all([
              import("@/lib/profit-loss/export"),
              import("@/lib/download"),
            ]);
            const centersAllYears = datasets.filter(
              (d) => d.role === "center" || d.role === "sin-centro",
            );
            const withEdits = await Promise.all(
              centersAllYears.map(async (d) => ({
                dataset: d,
                edits: await datasetEdits(d.id),
              })),
            );
            const workbook = exportMod.buildMultiCenterWorkbook({
              companyName: dataset?.companyName ?? "LiderPlus",
              loadedMonthsByYear,
              ...(sourceSystemId ? { sourceSystemId } : {}),
              hideEmpty: hideZeroRows,
              centers: withEdits,
              ...(activeClient?.logo ? { logo: activeClient.logo } : {}),
              // Cada hoja de centro se lleva el suyo; la del Consolidado no, porque no es un centro.
              ...(activeClient?.centerLogos ? { centerLogos: activeClient.centerLogos } : {}),
            });
            const blob = await exportMod.workbookToBlob(workbook);
            downloadBlob(blob, exportMod.multiCenterFilename(loadedYears));
          },
        },
        {
          id: "mes-crudo",
          title: "Un mes en crudo",
          description:
            "El último mes cargado en el formato del sistema contable, con los ajustes aplicados",
          icon: FilePlus2,
          iconClassName: "text-muted",
          disabled: latestLoadedMonth === null,
          disabledReason: rawYear === null ? severalYearsReason : noMonthsReason,
          run: async () => {
            if (latestLoadedMonth === null || rawYear === null) {
              return;
            }
            const [exportMod, { downloadBlob }] = await Promise.all([
              import("@/lib/profit-loss/export"),
              import("@/lib/download"),
            ]);
            const withEdits = await Promise.all(
              centerViews.map(async (v) => ({
                name: v.name,
                dataset: v.dataset,
                edits: await datasetEdits(v.dataset.id),
              })),
            );
            const workbook = exportMod.buildMonthSliceWorkbook({
              companyName: dataset?.companyName ?? "LiderPlus",
              year: rawYear,
              month: latestLoadedMonth,
              centers: withEdits,
              ...(activeClient?.logo ? { logo: activeClient.logo } : {}),
            });
            const blob = await exportMod.workbookToBlob(workbook);
            downloadBlob(blob, exportMod.monthSliceFilename(rawYear, latestLoadedMonth));
          },
        },
      ];
      return canWriteRawMonth ? options : options.filter((option) => option.id !== "mes-crudo");
    }

    const noMonthsReason = "Carga un mes primero.";
    const options: ExcelDownloadOption[] = [
      {
        id: "data",
        title: "Excel con tus datos",
        description: withoutZeros(
          hideZeroRows,
          "El estado de resultados con sus doce columnas mensuales, los valores actuales y los comentarios",
        ),
        icon: FileSpreadsheet,
        iconClassName: "text-brand",
        disabled: !dataset,
        disabledReason: "Carga un archivo de Excel primero.",
        run: async () => {
          if (!dataset) {
            return;
          }
          const [exportMod, { downloadBlob }] = await Promise.all([
            import("@/lib/profit-loss/export"),
            import("@/lib/download"),
          ]);
          const singlesAllYears = datasets.filter((d) => d.role === "single");
          const slices = await Promise.all(
            singlesAllYears.map(async (d) => ({
              dataset: d,
              edits: await datasetEdits(d.id),
            })),
          );
          const workbook = exportMod.buildPygWorkbook(
            slices,
            loadedMonthsByYear,
            sourceSystemId ?? undefined,
            hideZeroRows,
            activeClient?.logo,
          );
          const blob = await exportMod.workbookToBlob(workbook);
          downloadBlob(blob, exportMod.pygExportFilename(dataset, loadedYears));
        },
      },
      {
        id: "mes-crudo",
        title: "Un mes en crudo",
        description:
          "El último mes cargado en el formato del sistema contable, con los ajustes aplicados",
        icon: FilePlus2,
        iconClassName: "text-muted",
        disabled: !dataset || latestLoadedMonth === null,
        disabledReason: rawYear === null ? severalYearsReason : noMonthsReason,
        run: async () => {
          if (!dataset || latestLoadedMonth === null || rawYear === null) {
            return;
          }
          const [exportMod, { downloadBlob }] = await Promise.all([
            import("@/lib/profit-loss/export"),
            import("@/lib/download"),
          ]);
          const workbook = exportMod.buildSingleMonthSliceWorkbook({
            companyName: dataset.companyName,
            year: rawYear,
            month: latestLoadedMonth,
            dataset,
            edits: await datasetEdits(dataset.id),
            ...(activeClient?.logo ? { logo: activeClient.logo } : {}),
          });
          const blob = await exportMod.workbookToBlob(workbook);
          downloadBlob(blob, exportMod.monthSliceFilename(rawYear, latestLoadedMonth));
        },
      },
    ];
    return canWriteRawMonth ? options : options.filter((option) => option.id !== "mes-crudo");
  }, [
    isConsolidated,
    contributors.length,
    consolidatedDetails,
    consolidatedLogos,
    activeClient?.logo,
    activeClient?.centerLogos,
    dataset,
    datasets,
    mode,
    centerViews,
    loadedYears,
    loadedMonthsByYear,
    rawYear,
    anyMonthLoaded,
    latestLoadedMonth,
    sourceSystemId,
    canWriteRawMonth,
    hideZeroRows,
  ]);

  return (
    <>
      <ExcelActions
        upload={{
          onClick: () => setUploadOpen(true),
          disabled: activeClientId === null || isConsolidated,
          disabledReason: isConsolidated
            ? "El consolidado es la suma de todos los clientes. Abre uno para cargar datos."
            : "Crea un cliente antes de cargar datos.",
        }}
        downloads={downloads}
        info={{
          title: "Archivos aceptados",
          children:
            acceptedFormats.length > 0 ? (
              <>Se aceptan: {acceptedFormats.map((f) => f.label).join(", ")}.</>
            ) : (
              "Cargando los formatos aceptados…"
            ),
        }}
      />

      <CostCenterUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  );
}
