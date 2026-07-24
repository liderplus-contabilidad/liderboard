"use client";

import { ChevronDown, FilePlus2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { db } from "@/lib/profit-loss/db";
import { CostCenterUploadModal } from "./cost-center-upload-modal";
import { usePygData } from "./pyg-data-provider";

/**
 * Las acciones de Excel de Pérdidas y Ganancias — cargar, el menú de descarga y el info tip de
 * archivos aceptados. Viven aquí porque las monta la barra de Datos (`DatosToolbar`) y también
 * el vacío de Gráficas/Análisis (`PygEmptyState`), donde son la única forma de cargar un archivo.
 */
export function PygExcelActions() {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={() => setUploadOpen(true)}
        className="inline-flex h-[34px] items-center gap-2 rounded-[8px] bg-brand px-[13px] text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-hover"
      >
        <Upload size={14} />
        Cargar Excel
      </button>

      <DownloadMenu />
      <InfoTip label="¿Qué archivos acepta?" title="Archivos aceptados">
        Acepta el reporte mensual o anual del sistema contable (con o sin línea de centro de costo),
        o uno editado por la app. El consolidado por centros de costo estará disponible
        próximamente.
      </InfoTip>

      <CostCenterUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}

type ExportKind = "data" | "template";

/**
 * "Descargar Excel": exports the edited Estado de Resultados or a blank template seeded
 * with the current accounts. Both build the workbook via a dynamic import of the exceljs
 * layer (kept out of the initial bundle), then trigger a browser download.
 */
function DownloadMenu() {
  const { dataset, edits, views, mode } = usePygData();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [failed, setFailed] = useState(false);

  const runExport = useCallback(
    async (kind: ExportKind) => {
      if (busy || (kind === "data" && !dataset)) {
        return;
      }
      setBusy(kind);
      setFailed(false);
      try {
        const [exportMod, { downloadBlob }] = await Promise.all([
          import("@/lib/profit-loss/export"),
          import("@/lib/download"),
        ]);
        let workbook: import("exceljs").Workbook;
        if (kind === "template") {
          workbook = exportMod.buildBlankTemplate(dataset);
        } else if (mode === "multi") {
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
        downloadBlob(blob, exportMod.pygExportFilename(dataset, kind));
        setOpen(false);
      } catch {
        setFailed(true);
      } finally {
        setBusy(null);
      }
    },
    [busy, dataset, edits, views, mode],
  );

  return (
    <div className="relative">
      {open && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 cursor-default"
        />
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative z-30 inline-flex h-[34px] items-center gap-2 rounded-[8px] border border-faintest bg-surface px-[13px] text-[12.5px] font-semibold text-brand transition-colors hover:bg-canvas"
      >
        <FileSpreadsheet size={14} />
        Descargar Excel
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="menu"
          style={{ width: 308 }}
          className="absolute right-0 top-[calc(100%+8px)] z-30 rounded-xl border border-border bg-surface p-[7px] shadow-[0_14px_36px_rgba(15,23,42,0.16)]"
        >
          <DownloadItem
            icon={<FileSpreadsheet size={17} className="text-brand" />}
            title="Excel con tus datos"
            description={
              mode === "multi"
                ? "Una hoja por centro + la hoja consolidada"
                : "El estado con los valores y comentarios actuales"
            }
            onClick={() => runExport("data")}
            disabled={!dataset}
            busy={busy === "data"}
          />
          <DownloadItem
            icon={<FilePlus2 size={17} className="text-muted" />}
            title="Plantilla vacía"
            description="Tus cuentas con los montos en blanco, para llenar y recargar"
            onClick={() => runExport("template")}
            busy={busy === "template"}
          />
          {failed && (
            <p className="px-[11px] pt-1.5 text-[11.5px] leading-snug text-negative">
              No se pudo generar el Excel. Intenta de nuevo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DownloadItem({
  icon,
  title,
  description,
  onClick,
  disabled = false,
  busy = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled || busy}
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-[9px] px-[11px] py-2.5 text-left transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span className="mt-px shrink-0">
        {busy ? <Loader2 size={17} className="animate-spin text-brand" /> : icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        <span className="text-[11.5px] leading-snug text-faint">{description}</span>
      </span>
    </button>
  );
}
