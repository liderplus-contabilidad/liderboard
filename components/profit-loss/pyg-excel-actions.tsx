"use client";

import { FilePlus2, FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ExcelActions, type ExcelDownloadOption } from "@/components/ui/excel-actions";
import { db } from "@/lib/profit-loss/db";
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
  const { dataset, datasets, edits, views, mode, loadedMonths, sourceSystemId } = usePygData();
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
  const workspaceYear = centerViews[0]?.dataset.year ?? datasets.find((d) => d.year != null)?.year;
  const latestLoadedMonth = loadedMonths.length > 0 ? Math.max(...loadedMonths) : null;

  const downloads = useMemo<ExcelDownloadOption[]>(() => {
    if (mode === "multi") {
      const noMonthsReason = "Carga un mes primero.";
      const options: ExcelDownloadOption[] = [
        {
          id: "completo",
          title: "Excel completo",
          description: "El workspace entero: la hoja consolidada más una por centro, re-subible",
          icon: FileSpreadsheet,
          iconClassName: "text-brand",
          disabled: loadedMonths.length === 0,
          disabledReason: noMonthsReason,
          run: async () => {
            const [exportMod, { downloadBlob }] = await Promise.all([
              import("@/lib/profit-loss/export"),
              import("@/lib/download"),
            ]);
            const withEdits = await Promise.all(
              centerViews.map(async (v) => ({
                dataset: v.dataset,
                edits: await db.edits.where("datasetId").equals(v.dataset.id).toArray(),
              })),
            );
            const workbook = exportMod.buildMultiCenterWorkbook({
              companyName: dataset?.companyName ?? "LiderPlus",
              year: workspaceYear ?? 0,
              loadedMonths,
              ...(sourceSystemId ? { sourceSystemId } : {}),
              centers: withEdits,
            });
            const blob = await exportMod.workbookToBlob(workbook);
            downloadBlob(blob, exportMod.multiCenterFilename(workspaceYear ?? 0));
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
          disabledReason: noMonthsReason,
          run: async () => {
            if (latestLoadedMonth === null) {
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
                edits: await db.edits.where("datasetId").equals(v.dataset.id).toArray(),
              })),
            );
            const workbook = exportMod.buildMonthSliceWorkbook({
              companyName: dataset?.companyName ?? "LiderPlus",
              year: workspaceYear ?? 0,
              month: latestLoadedMonth,
              centers: withEdits,
            });
            const blob = await exportMod.workbookToBlob(workbook);
            downloadBlob(blob, exportMod.monthSliceFilename(workspaceYear ?? 0, latestLoadedMonth));
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
          const workbook = exportMod.buildPygWorkbook(
            dataset,
            edits,
            loadedMonths,
            sourceSystemId ?? undefined,
          );
          const blob = await exportMod.workbookToBlob(workbook);
          downloadBlob(blob, exportMod.pygExportFilename(dataset));
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
        disabledReason: noMonthsReason,
        run: async () => {
          if (!dataset || latestLoadedMonth === null) {
            return;
          }
          const [exportMod, { downloadBlob }] = await Promise.all([
            import("@/lib/profit-loss/export"),
            import("@/lib/download"),
          ]);
          const workbook = exportMod.buildSingleMonthSliceWorkbook({
            companyName: dataset.companyName,
            year: workspaceYear ?? 0,
            month: latestLoadedMonth,
            dataset,
            edits,
          });
          const blob = await exportMod.workbookToBlob(workbook);
          downloadBlob(blob, exportMod.monthSliceFilename(workspaceYear ?? 0, latestLoadedMonth));
        },
      },
    ];
    return canWriteRawMonth ? options : options.filter((option) => option.id !== "mes-crudo");
  }, [
    dataset,
    edits,
    mode,
    centerViews,
    loadedMonths,
    workspaceYear,
    latestLoadedMonth,
    sourceSystemId,
    canWriteRawMonth,
  ]);

  return (
    <>
      <ExcelActions
        upload={{ onClick: () => setUploadOpen(true) }}
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
