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
 * El menú de descarga cambia por modo: multi-centro ofrece «Excel completo» (el workspace
 * entero, re-subible) y «Un mes en crudo» (el mes más reciente cargado, en el formato del
 * sistema contable); estado único ofrece solo «Excel con tus datos» (llenar a mano doce meses
 * por cuenta no es un flujo real, así que «Plantilla vacía» se retira de los dos modos). El
 * `ⓘ` lee el catálogo de formatos aceptados del registry de estrategias en vez de llevar el
 * texto escrito a mano — cargado bajo demanda para no meter SheetJS en el bundle inicial.
 */
export function PygExcelActions() {
  const { dataset, datasets, edits, views, mode, loadedMonths } = usePygData();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [acceptedFormats, setAcceptedFormats] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void import("@/lib/profit-loss/upload/registry").then(({ acceptedFileFormats }) => {
      if (!cancelled) {
        setAcceptedFormats(acceptedFileFormats());
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const centerViews = useMemo(
    () => views.filter((v) => v.role === "center" || v.role === "sin-centro"),
    [views],
  );
  const workspaceYear = centerViews[0]?.dataset.year ?? datasets.find((d) => d.year != null)?.year;
  const latestLoadedMonth = loadedMonths.length > 0 ? Math.max(...loadedMonths) : null;

  const downloads = useMemo<ExcelDownloadOption[]>(() => {
    if (mode === "multi") {
      const noMonthsReason = "Carga un mes primero.";
      return [
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
    }

    return [
      {
        id: "data",
        title: "Excel con tus datos",
        description: "El estado con los valores y comentarios actuales",
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
          const workbook = exportMod.buildPygWorkbook(dataset, edits);
          const blob = await exportMod.workbookToBlob(workbook);
          downloadBlob(blob, exportMod.pygExportFilename(dataset));
        },
      },
    ];
  }, [dataset, edits, mode, centerViews, loadedMonths, workspaceYear, latestLoadedMonth]);

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
