"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { ExportActions, type ExportOption } from "@/components/ui/export-actions";
import { downloadBlob } from "@/lib/download";
import { OperationsImportDialog } from "./import-dialog";
import { useOperations } from "./operations-provider";
import { VaultDialog } from "./vault-gate";

const AgendaReport = dynamic(() => import("./agenda-report").then((m) => m.AgendaReport), {
  ssr: false,
});

export function OperationsExportActions({ mode }: { mode: "keys" | "schedule" }) {
  const ops = useOperations();
  const [upload, setUpload] = useState(false),
    [report, setReport] = useState(false);
  const [unlock, setUnlock] = useState(false);
  const exports: ExportOption[] =
    mode === "keys"
      ? [
          {
            id: "keys-workbook",
            title: "Empresas y accesos (incluye claves)",
            description: "Excel completo de empresas y credenciales",
            icon: FileSpreadsheet,
            disabled: !ops.unlocked || !ops.companies.length,
            disabledReason: "Desbloquea las claves.",
            run: async () => {
              const [builder, shared] = await Promise.all([
                import("@/lib/credentials/export"),
                import("@/lib/operations/workbooks"),
              ]);
              downloadBlob(
                shared.workbookBlob(
                  builder.accessWorkbook(ops.companies, ops.accesses, ops.obligations),
                ),
                "LIDERPLUS_CLAVES.xlsx",
              );
            },
          },
          {
            id: "keys-source",
            title: "Datos originales (incluye claves)",
            description: "Todas las celdas de la última carga, incluidas sus anotaciones",
            icon: FileSpreadsheet,
            disabled: !ops.unlocked || !ops.companies.length,
            disabledReason: "Desbloquea las claves.",
            run: async () => {
              if (!ops.key) throw new Error("Desbloquea las claves.");
              const [db, shared] = await Promise.all([
                import("@/lib/operations/db"),
                import("@/lib/operations/workbooks"),
              ]);
              const source = await db.readLatestSource(ops.key);
              if (!source) throw new Error("Todavía no hay un archivo original cargado.");
              downloadBlob(
                shared.workbookBlob(shared.sourceWorkbook(source)),
                "LIDERPLUS_DATOS_ORIGINALES.xlsx",
              );
            },
          },
        ]
      : [
          {
            id: "schedule-workbook",
            title: "Cronograma Excel",
            description: "Todas las tareas y períodos; se puede volver a cargar",
            icon: FileSpreadsheet,
            disabled: !ops.tasks.length,
            disabledReason: "Agrega tareas para exportar.",
            run: async () => {
              const [builder, shared] = await Promise.all([
                import("@/lib/schedule/export"),
                import("@/lib/operations/workbooks"),
              ]);
              downloadBlob(
                shared.workbookBlob(builder.scheduleWorkbook(ops.companies, ops.tasks)),
                "LIDERPLUS_CRONOGRAMA.xlsx",
              );
            },
          },
          {
            id: "schedule-pdf",
            title: "Agenda PDF",
            description: "Las tareas visibles con sus fechas y responsables",
            icon: FileText,
            disabled: !ops.filteredTasks.length,
            disabledReason: "No hay tareas en esta selección.",
            run: () => setReport(true),
          },
        ];
  return (
    <>
      <ExportActions
        upload={{
          onClick: () => {
            if (mode === "keys" && !ops.unlocked) setUnlock(true);
            else setUpload(true);
          },
        }}
        exports={exports}
        info={{
          title: mode === "keys" ? "Archivos de claves" : "Archivos de cronograma",
          children:
            mode === "keys"
              ? "La primera hoja de CLAVES o el Excel exportado por LiderPlus."
              : "Tabla con Empresa, Tarea, Fecha o Período, Responsable, Estado y Notas.",
        }}
      />
      {unlock && !ops.unlocked && (
        <VaultDialog onClose={() => setUnlock(false)} onUnlocked={() => setUpload(true)} />
      )}
      {upload && <OperationsImportDialog mode={mode} onClose={() => setUpload(false)} />}
      {report && <AgendaReport onClose={() => setReport(false)} />}
    </>
  );
}
