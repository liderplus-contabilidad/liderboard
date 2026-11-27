"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ExportActions, type ExportOption } from "@/components/ui/export-actions";
import { deriveSalesIdentity } from "@/lib/sales/identity";
import { useSalesData } from "./sales-data-provider";
import { SalesUploadModal } from "./sales-upload-modal";

/**
 * The `ExportActions` wrapper for sales. The Excel is a COPY of what is stored —every month of
 * the client, read from the base and not from the screen's marked years, and built in the Worker—
 * so it can come back through the ordinary upload. The preview loads dynamically.
 */
const SalesReportPreview = dynamic(
  () => import("./report/sales-report-preview").then((mod) => mod.SalesReportPreview),
  { ssr: false },
);

export function SalesExportActions({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { clientId, coverage } = useSalesData();
  const [reportOpen, setReportOpen] = useState(false);
  const ready = clientId !== null && coverage.length > 0;

  const exports = useMemo<ExportOption[]>(
    () => [
      {
        id: "data",
        title: "Excel con tus datos",
        description: "Todos los meses cargados en una hoja; se vuelve a subir tal cual",
        icon: FileSpreadsheet,
        iconClassName: "text-brand",
        disabled: !ready,
        disabledReason:
          clientId === null
            ? "Abre un cliente en Pérdidas y Ganancias"
            : "Carga un mes de ventas primero.",
        run: async () => {
          if (clientId === null || coverage.length === 0) {
            return;
          }
          const [{ monthsForClientYears }, { buildSalesBlob }, exportMod, { downloadBlob }] =
            await Promise.all([
              import("@/lib/sales/db"),
              import("@/lib/sales/upload/client"),
              import("@/lib/sales/export"),
              import("@/lib/download"),
            ]);
          // Every year, not the marked ones: this is the backup.
          const years = [...new Set(coverage.map((row) => row.year))].sort((a, b) => a - b);
          const stored = await monthsForClientYears(clientId, years);
          // The coverage carries the day and the company code the sheet writes.
          const byId = new Map(coverage.map((row) => [row.id, row]));
          const months = stored.map((month) => ({
            ...month,
            firstDay: byId.get(month.id)?.firstDay ?? 1,
            companyCode: byId.get(month.id)?.companyCode ?? "",
          }));
          const blob = await buildSalesBlob(months);
          // Named after the company code the files declare, never the user's label.
          downloadBlob(
            blob,
            exportMod.salesExportFilename(deriveSalesIdentity(coverage)?.companyCode ?? "", years),
          );
        },
      },
      {
        id: "pdf",
        title: "Informe PDF",
        description: "Vista previa para imprimir: las lecturas con las marcas de la barra",
        icon: FileText,
        iconClassName: "text-muted",
        disabled: !ready,
        // Naming the missing step: a control switched off with no explanation forces you to point
        // at it to find out what it is missing.
        disabledReason: "Carga el Excel de ventas de al menos un mes.",
        run: () => setReportOpen(true),
      },
    ],
    [coverage, clientId, ready],
  );

  return (
    <>
      <ExportActions
        upload={{
          onClick: () => onOpenChange(true),
          disabled: clientId === null,
          // A control switched off with no reason in sight forces you to point at it to find out what
          // is missing, and what is missing here is the previous step of the whole module.
          disabledReason: clientId === null ? "Abre un cliente en Pérdidas y Ganancias" : undefined,
        }}
        exports={exports}
        info={{
          title: "¿Qué archivos acepta?",
          children: (
            <div className="flex flex-col gap-2">
              <p>
                El <strong>reporte de ventas</strong> del sistema contable, en <code>.xls</code> o{" "}
                <code>.xlsx</code>: una fila por línea de factura, con las columnas FECHA, SEGURO,
                TIPO DE SERVICIO, COD. ARTICULO, NOMBRE DEL ARTICULO, NETO y VENDEDOR. Las demás
                columnas se ignoran.
              </p>
              <p>
                Puede traer <strong>cualquier rango de fechas</strong> —un mes, dos o varios años—:
                cada línea cae en el mes de su FECHA. El nombre del archivo no participa. Se pueden
                soltar varios a la vez, siempre que no compartan ningún mes.
              </p>
              <p>
                También acepta el <strong>«Excel con tus datos»</strong> que se descarga aquí: una
                sola hoja con todos los meses, y al subirlo la base queda como estaba.
              </p>
              <p>
                Cada mes que el archivo trae reemplaza por completo al que hubiera; los demás meses
                no se tocan.
              </p>
            </div>
          ),
        }}
      />
      <SalesUploadModal open={open} onClose={() => onOpenChange(false)} />
      {reportOpen && <SalesReportPreview onClose={() => setReportOpen(false)} />}
    </>
  );
}
