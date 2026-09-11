"use client";

import { useMemo, useState } from "react";
import { ExcelActions, type ExcelDownloadOption } from "@/components/ui/excel-actions";
import { usePersonnelCostData } from "./personnel-cost-data-provider";
import { PersonnelCostUploadModal } from "./personnel-cost-upload-modal";

/**
 * The `ExcelActions` wrapper for «Análisis costo personal»: a module only wires what «Cargar» opens,
 * what it downloads and what the `ⓘ` says, never its own button markup.
 *
 * **The one download is a COPY of what is written by hand** —the typed exercises and the nómina de
 * familia, `lib/personnel-cost/export.ts`— and it exists so the data can leave the browser and come
 * back through the upload unchanged. It carries nothing derived from the estado de resultados: those
 * tables are PyG's and are recomputed on every render, and the upload never writes over them either.
 * With a single option `ExcelActions` draws a plain button on its own.
 */
export function PersonnelCostExcelActions() {
  const { clientId, canRead, clientName, backup } = usePersonnelCostData();
  const [open, setOpen] = useState(false);

  const downloads = useMemo<ExcelDownloadOption[]>(
    () => [
      {
        id: "data",
        title: "Excel con tus datos",
        description:
          "Los ejercicios escritos a mano y la nómina de familia; se vuelve a subir tal cual",
        disabled: backup === null,
        disabledReason:
          clientId === null
            ? "Abre un cliente en Pérdidas y Ganancias"
            : "Escribe un ejercicio o la nómina de familia primero.",
        run: async () => {
          if (!backup) {
            return;
          }
          const [exportMod, { downloadBlob }] = await Promise.all([
            import("@/lib/personnel-cost/export"),
            import("@/lib/download"),
          ]);
          const blob = await exportMod.personnelCostWorkbookToBlob(
            exportMod.buildPersonnelCostWorkbook(backup),
          );
          downloadBlob(
            blob,
            exportMod.personnelCostExportFilename(clientName ?? "", [
              ...backup.legacy.map((entry) => entry.year),
              ...backup.family.map((entry) => entry.year),
            ]),
          );
        },
      },
    ],
    [backup, clientId, clientName],
  );

  const uploadable = clientId !== null && canRead;

  return (
    <>
      <ExcelActions
        upload={{
          onClick: () => setOpen(true),
          disabled: !uploadable,
          // A control switched off with no reason in sight forces you to point at it to find out what
          // is missing.
          disabledReason: uploadable
            ? undefined
            : clientId === null
              ? "Abre un cliente en Pérdidas y Ganancias"
              : "Este cliente no es de MicroPlus",
        }}
        downloads={downloads}
        downloadLabel="Excel"
        info={{
          title: "¿Qué archivos acepta?",
          children: (
            <div className="flex flex-col gap-2">
              <p>
                Solo el <strong>«Excel con tus datos»</strong> que se descarga aquí: una hoja
                «Ejercicio <em>año</em>» por año escrito a mano y una hoja «Nómina de familia».
                Puedes editarlo en Excel y volver a subirlo; se lee por rótulos, no por posición.
              </p>
              <p>
                Un ejercicio se <strong>reemplaza por completo</strong> con lo que traiga su hoja
                (un mes en blanco queda en blanco), y la nómina de familia se reemplaza por año.
              </p>
              <p>
                <strong>Nunca toca el estado de resultados.</strong> Si el archivo trae un ejercicio
                de un año que ya sale de PyG, esa hoja se descarta y la tabla queda como está.
              </p>
            </div>
          ),
        }}
      />
      <PersonnelCostUploadModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
