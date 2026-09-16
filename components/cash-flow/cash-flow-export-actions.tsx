"use client";

import { FileSpreadsheet, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { ExportActions, type ExportOption } from "@/components/ui/export-actions";
import type { ModuleTabId } from "@/lib/modules";
import { useCashFlowData } from "./cash-flow-data-provider";
import { CashEntriesUploadModal } from "./cash-entries-upload-modal";
import { ChecksUploadModal } from "./checks-upload-modal";
import { FlowReportPreview } from "./flow-report-preview";
import { PayablesUploadModal } from "./payables-upload-modal";

/**
 * Flujo de caja's `ExportActions` wrapper, per tab: «Cargar Excel» where something is loaded (a
 * cartera in CxP, the register in Cheques, the `CARGAS CASH` sheet in Cargas cash) and «Exportar ▾» with that tab's outputs — the `REPORTE
 * CXP`, the fourteen-column control, the flow's report and Excel, the «Cargas cash» sheet. Resumen
 * mounts nothing (see `module-views.tsx`).
 */
export function CashFlowExportActions({ tab }: { tab: ModuleTabId }) {
  const {
    activeClientId,
    activeClient,
    payables,
    visibleChecks,
    derived,
    flow,
    asOf,
    accounts,
    centers,
    cashMatrix,
  } = useCashFlowData();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const companyName = activeClient?.name ?? "";
  const logo = activeClient?.logo;

  const exports = useMemo<ExportOption[]>(() => {
    if (tab === "cxp") {
      return [
        {
          id: "cartera",
          title: "Cartera",
          description: "Toda la cartera con sus marcas y aprobaciones, tal como está",
          icon: FileSpreadsheet,
          iconClassName: "text-brand",
          disabled: payables.length === 0,
          disabledReason: "No hay cartera que exportar.",
          run: async () => {
            const [mod, shared, { downloadBlob }] = await Promise.all([
              import("@/lib/cash-flow/export/cartera-workbook"),
              import("@/lib/cash-flow/export/shared"),
              import("@/lib/download"),
            ]);
            const blob = await shared.workbookToBlob(
              mod.buildCarteraWorkbook(payables, accounts, companyName),
            );
            downloadBlob(blob, shared.exportFilename("CARTERA", companyName, asOf));
          },
        },
      ];
    }
    if (tab === "cheques") {
      return [
        {
          id: "control-cheques",
          title: "Control de cheques",
          description: "Las catorce columnas del libro, con lo que pasa los filtros",
          icon: FileSpreadsheet,
          iconClassName: "text-brand",
          disabled: visibleChecks.length === 0,
          disabledReason: "No hay cheques en pantalla que exportar.",
          run: async () => {
            const [mod, shared, { downloadBlob }] = await Promise.all([
              import("@/lib/cash-flow/export/checks-workbook"),
              import("@/lib/cash-flow/export/shared"),
              import("@/lib/download"),
            ]);
            const blob = await shared.workbookToBlob(
              mod.buildChecksWorkbook(visibleChecks, companyName, logo),
            );
            downloadBlob(blob, shared.exportFilename("CHEQUES", companyName, asOf));
          },
        },
      ];
    }
    if (tab === "flujo") {
      const empty = accounts.length === 0;
      return [
        {
          id: "flow-report",
          title: "Reporte de flujo",
          description:
            "Cuentas, ingresos, pagos por proveedor y préstamos, para imprimir o guardar en PDF",
          icon: Printer,
          iconClassName: "text-brand",
          disabled: empty,
          disabledReason: "Declara una cuenta bancaria primero.",
          run: () => setReportOpen(true),
        },
        {
          id: "flow-excel",
          title: "Excel de flujo",
          description: "Las mismas secciones del reporte en una hoja",
          icon: FileSpreadsheet,
          iconClassName: "text-brand",
          disabled: empty,
          disabledReason: "Declara una cuenta bancaria primero.",
          run: async () => {
            const [{ buildFlowReport }, mod, shared, { downloadBlob }] = await Promise.all([
              import("@/lib/cash-flow/report"),
              import("@/lib/cash-flow/export/flow-workbook"),
              import("@/lib/cash-flow/export/shared"),
              import("@/lib/download"),
            ]);
            const report = buildFlowReport({
              clientName: companyName,
              ...(logo ? { logo } : {}),
              derived,
              incomes: flow?.incomes ?? [],
              accounts,
              centers,
              generatedAt: new Date(),
            });
            const blob = await shared.workbookToBlob(mod.buildFlowWorkbook(report, logo));
            downloadBlob(blob, shared.exportFilename("FLUJO", companyName, asOf));
          },
        },
      ];
    }
    if (tab === "cargas") {
      const empty = cashMatrix.sections.every((section) => section.rows.length === 0);
      return [
        {
          id: "cash-entries",
          title: "Cargas cash",
          description: "Las tres matrices del libro con sus totales, en una hoja",
          icon: FileSpreadsheet,
          iconClassName: "text-brand",
          disabled: empty,
          disabledReason: "No hay filas ni documentos cash que exportar.",
          run: async () => {
            const [mod, shared, { downloadBlob }] = await Promise.all([
              import("@/lib/cash-flow/export/cash-entries-workbook"),
              import("@/lib/cash-flow/export/shared"),
              import("@/lib/download"),
            ]);
            const blob = await shared.workbookToBlob(
              mod.buildCashEntriesWorkbook(cashMatrix, companyName, logo),
            );
            downloadBlob(blob, shared.exportFilename("CARGAS_CASH", companyName, asOf));
          },
        },
      ];
    }
    return [];
  }, [
    tab,
    payables,
    visibleChecks,
    derived,
    flow,
    asOf,
    companyName,
    logo,
    accounts,
    centers,
    cashMatrix,
  ]);

  const uploads = tab === "cxp" || tab === "cheques" || tab === "cargas";
  const uploadLabel =
    tab === "cxp" ? "Cargar cartera" : tab === "cheques" ? "Cargar cheques" : "Cargar matriz";

  return (
    <>
      <ExportActions
        {...(uploads
          ? {
              upload: {
                label: uploadLabel,
                onClick: () => setUploadOpen(true),
                disabled: activeClientId === null,
                disabledReason: "Agrega una empresa primero: cada una guarda su propia cartera.",
              },
            }
          : {})}
        exports={exports}
      />
      {tab === "cxp" && (
        <PayablesUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      )}
      {tab === "cheques" && (
        <ChecksUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      )}
      {tab === "cargas" && (
        <CashEntriesUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      )}
      {reportOpen && <FlowReportPreview onClose={() => setReportOpen(false)} />}
    </>
  );
}
