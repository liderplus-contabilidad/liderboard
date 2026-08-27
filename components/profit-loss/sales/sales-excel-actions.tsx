"use client";

import { ExcelActions } from "@/components/ui/excel-actions";
import { useSalesData } from "./sales-data-provider";
import { SalesUploadModal } from "./sales-upload-modal";

/**
 * The `ExcelActions` wrapper for sales: a module only wires what «Cargar» opens and what the `ⓘ`
 * says, never its own button markup.
 *
 * **There is no download**, and the SHAPE of the control reflects that on its own: `ExcelActions`
 * derives the control from how many options it receives, and with zero it draws none. The Excel here
 * is the SOURCE and the screen reads; writing it back would be offering a file no accounting system
 * expects to receive. What the firm hands over is the PDF report, which has its own button next to
 * it.
 */
export function SalesExcelActions({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { clientId } = useSalesData();

  return (
    <>
      <ExcelActions
        upload={{
          onClick: () => onOpenChange(true),
          disabled: clientId === null,
          // A control switched off with no reason in sight forces you to point at it to find out what
          // is missing, and what is missing here is the previous step of the whole module.
          disabledReason: clientId === null ? "Abre un cliente en Pérdidas y Ganancias" : undefined,
        }}
        downloads={[]}
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
              <p>Volver a cargar un mes reemplaza por completo el que hubiera.</p>
            </div>
          ),
        }}
      />
      <SalesUploadModal open={open} onClose={() => onOpenChange(false)} />
    </>
  );
}
