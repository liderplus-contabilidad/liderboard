"use client";

import { ExcelActions } from "@/components/ui/excel-actions";
import { useSalesData } from "./sales-data-provider";
import { SalesUploadModal } from "./sales-upload-modal";

/**
 * El envoltorio de `ExcelActions` para ventas: un módulo solo cablea qué abre «Cargar» y qué dice
 * el `ⓘ`, nunca su propio markup de botones.
 *
 * **No hay descarga**, y la FORMA del control lo refleja sola: `ExcelActions` deriva el control de
 * cuántas opciones recibe, y con cero no dibuja ninguno. El Excel aquí es la FUENTE y la pantalla
 * lee; volver a escribirlo sería ofrecer un archivo que ningún sistema contable espera recibir. Lo
 * que la firma entrega es el informe en PDF, que tiene su propio botón al lado.
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
          // Un control apagado sin razón a la vista obliga a apuntarlo para descubrir qué falta, y
          // lo que falta aquí es el paso anterior de todo el módulo.
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
