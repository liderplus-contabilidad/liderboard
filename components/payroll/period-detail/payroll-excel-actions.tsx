"use client";

import { useCallback, useState } from "react";
import { ExcelActions } from "@/components/ui/excel-actions";
import type { CompanyProfile } from "@/lib/company-profile";
import type { EntityLogo } from "@/lib/logos";
import { downloadRolWorkbook } from "@/lib/payroll/export/download";
import { DEFAULT_PAYROLL_PARAMETERS } from "@/lib/payroll/engine/parameters";
import type { PayrollEmployeeLine, PayrollExtraConcept, PayrollPeriod } from "@/lib/payroll/types";
import { RolUploadModal } from "../rol-upload-modal";

/**
 * El envoltorio de Rol de Pagos sobre `ExcelActions` — la misma regla que siguen `PygExcelActions`
 * y `OccupancyExcelActions`: el módulo aporta qué abre «Cargar», qué genera «Descargar» y qué dice
 * el `ⓘ`; la forma de los controles es del primitivo y ningún módulo la escribe.
 *
 * Va en el `rightSlot` de la barra de pestañas, y solo sobre «Empleados»: cargar y descargar el rol
 * es lo que se hace en esa vista, igual que PyG monta las suyas solo sobre Datos.
 *
 * La descarga se arma AQUÍ, en el momento de pulsar, desde la nómina y el motor: nada de lo que
 * lleva el archivo está guardado, que es la misma regla del comprobante en PDF y del asiento.
 */
export function PayrollExcelActions({
  period,
  periods,
  lines,
  extraConcepts,
  clientName,
  clientLogo,
  clientCompany,
}: {
  period: PayrollPeriod;
  periods: readonly PayrollPeriod[];
  lines: readonly PayrollEmployeeLine[];
  extraConcepts: readonly PayrollExtraConcept[];
  clientName: string;
  clientLogo?: EntityLogo;
  clientCompany?: CompanyProfile;
}) {
  const [uploading, setUploading] = useState(false);

  const download = useCallback(
    () =>
      downloadRolWorkbook(
        {
          clientName,
          ...(clientCompany ? { company: clientCompany } : {}),
          year: period.year,
          monthIndex: period.monthIndex,
          lines,
          parameters: DEFAULT_PAYROLL_PARAMETERS,
          extraConcepts,
        },
        clientLogo,
      ),
    [clientName, clientCompany, clientLogo, extraConcepts, lines, period.monthIndex, period.year],
  );

  const empty = lines.length === 0;

  return (
    <>
      <ExcelActions
        upload={{ label: "Cargar rol de pagos", onClick: () => setUploading(true) }}
        downloads={[
          {
            id: "rol",
            title: "Rol de pagos",
            description:
              "La hoja GENERAL del período, con las columnas del libro y todas las cifras del motor.",
            disabled: empty,
            ...(empty ? { disabledReason: "El período todavía no tiene empleados." } : {}),
            run: download,
          },
        ]}
        downloadLabel="Descargar rol"
        info={{
          title: "¿Qué archivo acepta, y qué archivo entrega?",
          children: (
            <>
              <p>
                Acepta el Excel del sistema contable, con su hoja{" "}
                <span className="font-mono">GENERAL</span>. El mes NO sale del nombre del archivo:
                se lee de la línea que la propia hoja declara (
                <span className="font-mono">MARZO 2026</span>), y tiene que ser el del período
                abierto.
              </p>
              <p className="mt-2">
                Entrega esa misma hoja —una sola, con cada columna en su letra del libro—,
                encabezada por el logo y los datos de la empresa del cliente, y vuelve a entrar aquí
                sin perder nada: el membrete no se relee porque esos datos son del cliente, no del
                archivo. Las columnas cuyo dato la app no guarda (número de cuenta, ctas. por
                cobrar) salen con su rótulo y en blanco, y los conceptos de ingreso extra van
                sumados en <span className="font-mono">OTROS INGRESOS</span>: esa columna todavía no
                se relee, así que volver a cargar el archivo la perdería.
              </p>
            </>
          ),
        }}
      />

      {uploading && (
        <RolUploadModal
          period={period}
          periods={periods}
          currentCount={lines.length}
          onClose={() => setUploading(false)}
        />
      )}
    </>
  );
}
