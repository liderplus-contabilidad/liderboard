"use client";

import { FilePlus2, FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ExcelActions, type ExcelDownloadOption } from "@/components/ui/excel-actions";
import { pluralize } from "@/lib/format";
import { datasetEdits } from "@/lib/profit-loss/db";
import { CostCenterUploadModal } from "./cost-center-upload-modal";
import { usePygData } from "./pyg-data-provider";

/**
 * Las acciones de Excel de Pérdidas y Ganancias: cablea el proveedor y el modal de carga sobre
 * `ExcelActions`, que es quien rinde la fila y posee el progreso y el error. Las monta la fila de
 * tabs (`ModuleTabs`, solo en Datos) y también el vacío de Gráficas/Análisis (`PygEmptyState`),
 * donde son la única forma de cargar un archivo.
 *
 * El menú de descarga es el mismo en ambos modos: «Excel completo»/«Excel con tus datos» (el
 * workspace entero, re-subible) y «Un mes en crudo» (el mes más reciente cargado, en el formato
 * del sistema contable, con los ajustes aplicados) — llenar a mano doce meses por cuenta no es
 * un flujo real, así que «Plantilla vacía» no existe en ninguno de los dos. «Un mes en crudo»
 * solo aparece si la estrategia que originó el workspace declara que sabe ESCRIBIR su formato
 * (`writesOwnFormat`): un workspace MicroPlus, que la app solo sabe leer, se queda con una sola
 * opción y `ExcelActions` la rinde como botón plano. El `ⓘ` lee el catálogo de formatos
 * aceptados del mismo registry en vez de llevar el texto escrito a mano — todo cargado bajo
 * demanda para no meter SheetJS en el bundle inicial.
 */
export function PygExcelActions() {
  const {
    activeClientId,
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
  } = usePygData();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [acceptedFormats, setAcceptedFormats] = useState<{ id: string; label: string }[]>([]);
  // `null` mientras el registry no ha cargado: hasta saberlo, no se ofrece escribir un formato
  // que quizá no sepamos escribir (el sentido seguro de la duda).
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
  // "Un mes en crudo" writes ONE month of ONE year, so it needs a resolved year: with several
  // years on screen there is no such thing, and the option says so instead of guessing.
  const rawYear = visibleYears.length === 1 ? visibleYears[0] : null;
  const rawYearMonths = rawYear === null ? [] : (loadedMonthsByYear[rawYear] ?? []);
  const latestLoadedMonth = rawYearMonths.length > 0 ? Math.max(...rawYearMonths) : null;
  const anyMonthLoaded = Object.values(loadedMonthsByYear).some((months) => months.length > 0);
  const severalYearsReason =
    "Hay varios años a la vista; marca uno solo para bajar un mes en crudo.";

  const downloads = useMemo<ExcelDownloadOption[]>(() => {
    if (isConsolidated) {
      return [
        {
          id: "consolidado",
          title: "Excel del consolidado",
          description: `La suma de ${pluralize(contributors.length, "cliente")}, una hoja por año`,
          icon: FileSpreadsheet,
          iconClassName: "text-brand",
          disabled: datasets.length === 0,
          disabledReason: "Todavía no hay nada que sumar.",
          run: async () => {
            const [exportMod, { downloadBlob }] = await Promise.all([
              import("@/lib/profit-loss/export"),
              import("@/lib/download"),
            ]);
            const workbook = exportMod.buildConsolidatedWorkbook(datasets, loadedMonthsByYear);
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
          description: "El workspace entero: la hoja consolidada más una por centro, re-subible",
          icon: FileSpreadsheet,
          iconClassName: "text-brand",
          disabled: !anyMonthLoaded,
          disabledReason: noMonthsReason,
          run: async () => {
            const [exportMod, { downloadBlob }] = await Promise.all([
              import("@/lib/profit-loss/export"),
              import("@/lib/download"),
            ]);
            // EVERY year of the workspace, not just the visible ones: this file is the backup,
            // so what it leaves out is what a restore would not bring back.
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
              centers: withEdits,
            });
            const blob = await exportMod.workbookToBlob(workbook);
            downloadBlob(blob, exportMod.multiCenterFilename(loadedYears));
          },
        },
        {
          id: "mes-crudo",
          title: "Un mes en crudo",
          description:
            "El mes más reciente cargado, en el formato del sistema contable, con los ajustes aplicados",
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
        description: "El estado con sus doce columnas de mes, los valores y comentarios actuales",
        icon: FileSpreadsheet,
        iconClassName: "text-brand",
        disabled: !dataset,
        disabledReason: "Carga un Excel primero.",
        run: async () => {
          if (!dataset) {
            return;
          }
          const [exportMod, { downloadBlob }] = await Promise.all([
            import("@/lib/profit-loss/export"),
            import("@/lib/download"),
          ]);
          // Every year of the statement, same reasoning as the by-centers workbook.
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
          );
          const blob = await exportMod.workbookToBlob(workbook);
          downloadBlob(blob, exportMod.pygExportFilename(dataset, loadedYears));
        },
      },
      {
        id: "mes-crudo",
        title: "Un mes en crudo",
        description:
          "El mes más reciente cargado, en el formato del sistema contable, con los ajustes aplicados",
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
  ]);

  return (
    <>
      <ExcelActions
        upload={{
          onClick: () => setUploadOpen(true),
          disabled: activeClientId === null || isConsolidated,
          // Junto al botón, no en un tooltip: sin cliente, cargar no es lo siguiente que hay que
          // hacer, y el vacío de al lado ya ofrece lo que sí. Sobre el consolidado el motivo es
          // otro —es una suma derivada—, así que lo dice con sus propias palabras.
          disabledReason: isConsolidated
            ? "El consolidado es una suma de todos los clientes: abre uno para cargar datos."
            : "Crea un cliente antes de cargar datos.",
        }}
        downloads={downloads}
        info={{
          title: "Archivos aceptados",
          children:
            acceptedFormats.length > 0 ? (
              <>Acepta: {acceptedFormats.map((f) => f.label).join(", ")}.</>
            ) : (
              "Cargando los formatos aceptados…"
            ),
        }}
      />

      <CostCenterUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  );
}
