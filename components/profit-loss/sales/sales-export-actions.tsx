"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ExportActions, type ExportOption } from "@/components/ui/export-actions";
import { usePygData } from "../pyg-data-provider";
import { deriveSalesIdentity } from "@/lib/sales/identity";
import { useSalesData } from "./sales-data-provider";
import { SalesUploadModal } from "./sales-upload-modal";

/**
 * The `ExportActions` wrapper for sales: a module only wires what «Cargar» opens, what «Exportar»
 * offers and what the `ⓘ` says, never its own button markup.
 *
 * **The Excel is a COPY of what is stored** —every month of the open client, one sheet each, in the
 * report's own shape (`lib/sales/export.ts`)— and it exists so the data can leave the browser and
 * come back through the ordinary upload unchanged. It is NOT a file for the accounting system, which
 * never receives one: what the firm hands over is the «Informe PDF», the other entry of the same
 * menu. The preview loads dynamically: it mounts one chart per section and cannot weigh on the load
 * of a screen that most of the time is only looked at.
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
  const { activeClient } = usePygData();
  const { clientId, months } = useSalesData();
  const logo = activeClient?.logo;
  const [reportOpen, setReportOpen] = useState(false);
  const ready = clientId !== null && months.length > 0;

  const exports = useMemo<ExportOption[]>(
    () => [
      {
        id: "data",
        title: "Excel con tus datos",
        description: "Todos los meses cargados, una hoja por mes; se vuelve a subir tal cual",
        icon: FileSpreadsheet,
        iconClassName: "text-brand",
        disabled: months.length === 0,
        disabledReason:
          clientId === null
            ? "Abre un cliente en Pérdidas y Ganancias"
            : "Carga un mes de ventas primero.",
        run: async () => {
          if (months.length === 0) {
            return;
          }
          const [exportMod, { downloadBlob }] = await Promise.all([
            import("@/lib/sales/export"),
            import("@/lib/download"),
          ]);
          const blob = await exportMod.workbookToBlob(exportMod.buildSalesWorkbook(months, logo));
          // Named after the razón social the FILES declare, never the user's label: the file is a
          // copy of the data and its name says which company's it is.
          downloadBlob(
            blob,
            exportMod.salesExportFilename(
              deriveSalesIdentity(months)?.companyName ?? "",
              months.map((month) => month.year),
            ),
          );
        },
      },
      {
        id: "pdf",
        title: "Informe PDF",
        description: "Vista previa para imprimir: las tres lecturas con las marcas de la barra",
        icon: FileText,
        iconClassName: "text-muted",
        disabled: !ready,
        // Naming the missing step: a control switched off with no explanation forces you to point
        // at it to find out what it is missing.
        disabledReason: "Carga el Excel de ventas de al menos un mes.",
        run: () => setReportOpen(true),
      },
    ],
    [months, clientId, logo, ready],
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
                El reporte <strong>«Venta de Servicios por FACTURA»</strong> del sistema contable,
                en <code>.xls</code> o <code>.xlsx</code>. Un archivo por mes; se pueden soltar
                varios a la vez.
              </p>
              <p>
                El periodo se lee del propio reporte (<code>Desde:</code> / <code>Hasta:</code>) y
                tiene que ser <strong>un mes calendario completo</strong>. El nombre del archivo no
                participa, así que renombrarlo no cambia dónde aterriza el mes.
              </p>
              <p>
                También acepta el <strong>«Excel con tus datos»</strong> que se descarga aquí: una
                hoja por mes, y al subirlo la base queda exactamente como estaba.
              </p>
              <p>Volver a cargar un mes reemplaza por completo el que hubiera.</p>
            </div>
          ),
        }}
      />
      <SalesUploadModal open={open} onClose={() => onOpenChange(false)} />
      {reportOpen && <SalesReportPreview onClose={() => setReportOpen(false)} />}
    </>
  );
}
