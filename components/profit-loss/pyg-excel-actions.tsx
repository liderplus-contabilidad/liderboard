"use client";

import { FilePlus2, FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ExcelActions, type ExcelDownloadOption } from "@/components/ui/excel-actions";
import { pluralize } from "@/lib/format";
import { datasetEdits } from "@/lib/profit-loss/db";
import { CostCenterUploadModal } from "./cost-center-upload-modal";
import { usePygData } from "./pyg-data-provider";

/**
 * Excel actions for Profit and Loss. Integrates the provider and upload modal with `ExcelActions`,
 * which handles rendering, progress, and errors. Used in tabs (`ModuleTabs`) and empty states
 * (`PygEmptyState`) to upload or download files.
 *
 * The download menu includes options like "Full Excel" (entire workspace, re-uploadable) and
 * "Raw Month" (latest loaded month in accounting system format). "Raw Month" is only available
 * if the workspace supports writing its format. Accepted formats are loaded dynamically.
 */
function withoutZeros(hide: boolean, description: string): string {
  return hide ? `${description}, excluding zero accounts` : description;
}

export function PygExcelActions() {
  const {
    activeClientId,
    activeClient,
    isConsolidated,
    contributors,
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

  const centerViews = useMemo(
    () => views.filter((v) => v.role === "center" || v.role === "sin-centro"),
    [views],
  );

  const rawYear = visibleYears.length === 1 ? visibleYears[0] : null;
  const rawYearMonths = rawYear === null ? [] : (loadedMonthsByYear[rawYear] ?? []);
  const latestLoadedMonth = rawYearMonths.length > 0 ? Math.max(...rawYearMonths) : null;
  const anyMonthLoaded = Object.values(loadedMonthsByYear).some((months) => months.length > 0);
  const severalYearsReason = "Multiple years visible; select one to download a raw month.";

  const downloads = useMemo<ExcelDownloadOption[]>(() => {
    if (isConsolidated) {
      return [
        {
          id: "consolidado",
          title: "Consolidated Excel",
          description: withoutZeros(
            hideZeroRows,
            `Sum of ${pluralize(contributors.length, "client")}, one sheet per year`,
          ),
          icon: FileSpreadsheet,
          iconClassName: "text-brand",
          disabled: datasets.length === 0,
          disabledReason: "No data to consolidate yet.",
          run: async () => {
            const [exportMod, { downloadBlob }] = await Promise.all([
              import("@/lib/profit-loss/export"),
              import("@/lib/download"),
            ]);
            const workbook = exportMod.buildConsolidatedWorkbook(
              datasets,
              loadedMonthsByYear,
              hideZeroRows,
            );
            const blob = await exportMod.workbookToBlob(workbook);
            downloadBlob(blob, exportMod.consolidatedFilename(loadedYears));
          },
        },
      ];
    }

    if (mode === "multi") {
      const noMonthsReason = "Load a month first.";
      const options: ExcelDownloadOption[] = [
        {
          id: "completo",
          title: "Full Excel",
          description: withoutZeros(
            hideZeroRows,
            "Entire workspace: consolidated sheet and one per center, re-uploadable",
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
            });
            const blob = await exportMod.workbookToBlob(workbook);
            downloadBlob(blob, exportMod.multiCenterFilename(loadedYears));
          },
        },
        {
          id: "mes-crudo",
          title: "Raw Month",
          description: "Latest loaded month in accounting system format, with adjustments applied",
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

    const noMonthsReason = "Load a month first.";
    const options: ExcelDownloadOption[] = [
      {
        id: "data",
        title: "Excel with Your Data",
        description: withoutZeros(
          hideZeroRows,
          "Statement with 12 monthly columns, current values, and comments",
        ),
        icon: FileSpreadsheet,
        iconClassName: "text-brand",
        disabled: !dataset,
        disabledReason: "Load an Excel file first.",
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
        title: "Raw Month",
        description: "Latest loaded month in accounting system format, with adjustments applied",
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
    activeClient?.logo,
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
            ? "Consolidated data is a sum of all clients. Open one to upload data."
            : "Create a client before uploading data.",
        }}
        downloads={downloads}
        info={{
          title: "Accepted Files",
          children:
            acceptedFormats.length > 0 ? (
              <>Accepted: {acceptedFormats.map((f) => f.label).join(", ")}.</>
            ) : (
              "Loading accepted formats..."
            ),
        }}
      />

      <CostCenterUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  );
}
