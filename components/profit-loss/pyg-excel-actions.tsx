"use client";

import { FilePlus2, FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { ExcelActions, type ExcelDownloadOption } from "@/components/ui/excel-actions";
import { db } from "@/lib/profit-loss/db";
import { CostCenterUploadModal } from "./cost-center-upload-modal";
import { usePygData } from "./pyg-data-provider";

/**
 * Las acciones de Excel de Pérdidas y Ganancias: cablea el proveedor y el modal de carga sobre
 * `ExcelActions`, que es quien rinde la fila y posee el progreso y el error. Las monta la fila de
 * tabs (`ModuleTabs`, solo en Datos) y también el vacío de Gráficas/Análisis (`PygEmptyState`),
 * donde son la única forma de cargar un archivo.
 */
export function PygExcelActions() {
  const { dataset, edits, views, mode } = usePygData();
  const [uploadOpen, setUploadOpen] = useState(false);

  const downloads = useMemo<ExcelDownloadOption[]>(
    () => [
      {
        id: "data",
        title: "Excel con tus datos",
        description:
          mode === "multi"
            ? "Una hoja por centro + la hoja consolidada"
            : "El estado con los valores y comentarios actuales",
        icon: FileSpreadsheet,
        iconClassName: "text-brand",
        disabled: !dataset,
        disabledReason: "Carga un Excel primero.",
        run: async () => {
          const [exportMod, { downloadBlob }] = await Promise.all([
            import("@/lib/profit-loss/export"),
            import("@/lib/download"),
          ]);
          let workbook: import("exceljs").Workbook;
          if (mode === "multi") {
            const centers = views.filter((v) => v.role === "center");
            const sinView = views.find((v) => v.role === "sin-centro");
            const withEdits = await Promise.all(
              centers.map(async (v) => ({
                dataset: v.dataset,
                edits: await db.edits.where("datasetId").equals(v.dataset.id).toArray(),
              })),
            );
            workbook = exportMod.buildMultiCenterWorkbook({
              companyName: dataset?.companyName ?? "LiderPlus",
              centers: withEdits,
              sinCentro: sinView?.dataset,
            });
          } else if (dataset) {
            workbook = exportMod.buildPygWorkbook(dataset, edits);
          } else {
            return;
          }
          const blob = await exportMod.workbookToBlob(workbook);
          downloadBlob(blob, exportMod.pygExportFilename(dataset, "data"));
        },
      },
      {
        id: "template",
        title: "Plantilla vacía",
        description: "Tus cuentas con los montos en blanco, para llenar y recargar",
        icon: FilePlus2,
        iconClassName: "text-muted",
        run: async () => {
          const [exportMod, { downloadBlob }] = await Promise.all([
            import("@/lib/profit-loss/export"),
            import("@/lib/download"),
          ]);
          const blob = await exportMod.workbookToBlob(exportMod.buildBlankTemplate(dataset));
          downloadBlob(blob, exportMod.pygExportFilename(dataset, "template"));
        },
      },
    ],
    [dataset, edits, views, mode],
  );

  return (
    <>
      <ExcelActions
        upload={{ onClick: () => setUploadOpen(true) }}
        downloads={downloads}
        info={{
          title: "Archivos aceptados",
          children: (
            <>
              Acepta el reporte mensual o anual del sistema contable (con o sin línea de centro de
              costo), o uno editado por la app. El consolidado por centros de costo estará
              disponible próximamente.
            </>
          ),
        }}
      />

      <CostCenterUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  );
}
