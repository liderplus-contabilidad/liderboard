"use client";

import { FileSpreadsheet } from "lucide-react";
import { useCallback } from "react";
import { ExcelActions, type ExcelDownloadOption } from "@/components/ui/excel-actions";
import { downloadBlob } from "@/lib/download";
import { buildRevenueWorkbook, revenueExportFilename } from "@/lib/revenue/export";
import { useRevenueData } from "./revenue-data-provider";

/**
 * A THIN wrapper over the app's one Excel control — a module writes what «Descargar» generates, never
 * its own button markup. The download's FORM is derived by the primitive from how many options it
 * receives, and `busy`, the errors and the reentrancy guard live there.
 *
 * **Here nothing is uploaded**: the revenue comes from PyG and the external figures are typed into
 * the drawer, so the upload is rendered disabled with the reason in a pill — the primitive's own way
 * of saying what a control is missing, and the missing step here belongs to another module.
 *
 * **ONE download, so «Excel» is a plain button and not a menu** — the primitive derives that shape
 * from the number of options it gets, which is why this wrapper never declares it. The capture used
 * to be offered as a second file, «Datos externos», and it earned nothing: its matrix is already the
 * three «vs» sheets of the comparativo, so the menu asked the user to choose between a file and a
 * subset of that same file.
 */
export function RevenueExcelActions() {
  const { cardsInput, clientName, periodName } = useRevenueData();

  const downloadComparison = useCallback(async () => {
    const header = { clientName: clientName ?? "Cliente", periodLabel: periodName };
    downloadBlob(await buildRevenueWorkbook(cardsInput, header), revenueExportFilename(header));
  }, [cardsInput, clientName, periodName]);

  const ready = cardsInput.years.length > 0;

  const downloads: ExcelDownloadOption[] = [
    {
      id: "comparativo",
      title: "Comparativo completo",
      description: "Una hoja por lectura, con las mismas cifras de la pantalla.",
      icon: FileSpreadsheet,
      disabled: !ready,
      disabledReason: "Marca al menos un año con datos.",
      run: downloadComparison,
    },
  ];

  return (
    // NO `upload`: the revenue is loaded in PyG and the external figures are typed into the drawer,
    // so there is nothing to upload here — and a control with nothing to do is not drawn disabled, it
    // is not drawn.
    <ExcelActions downloads={downloads} downloadLabel="Excel" />
  );
}
