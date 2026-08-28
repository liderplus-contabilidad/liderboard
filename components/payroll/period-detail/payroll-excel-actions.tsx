"use client";

import { useCallback, useState } from "react";
import { ExcelActions } from "@/components/ui/excel-actions";
import type { CompanyProfile } from "@/lib/company-profile";
import type { CostCenter } from "@/lib/cost-center";
import type { EntityLogo } from "@/lib/logos";
import { downloadRolWorkbook } from "@/lib/payroll/export/download";
import { DEFAULT_PAYROLL_PARAMETERS } from "@/lib/payroll/engine/parameters";
import type { PayrollEmployeeLine, PayrollPeriod } from "@/lib/payroll/types";
import { RolUploadModal } from "../rol-upload-modal";

/**
 * Rol de Pagos' wrapper over `ExcelActions` — the same rule `PygExcelActions` and
 * `OccupancyExcelActions` follow: the module supplies what «Cargar» opens, what «Descargar»
 * generates and what the `ⓘ` says; the shape of the controls belongs to the primitive and no module
 * writes it.
 *
 * It goes in the tab bar's `rightSlot`, and only over «Empleados»: loading and downloading the rol is
 * what happens in that view, just as PyG mounts its own only over Datos.
 *
 * The download is assembled HERE, at the moment of the click, from the nómina and the engine: nothing
 * the file carries is stored, which is the same rule as the payslip in PDF and the journal entry.
 */
export function PayrollExcelActions({
  period,
  periods,
  lines,
  clientName,
  clientLogo,
  clientCompany,
  clientCostCenter,
}: {
  period: PayrollPeriod;
  periods: readonly PayrollPeriod[];
  lines: readonly PayrollEmployeeLine[];
  clientName: string;
  clientLogo?: EntityLogo;
  clientCompany?: CompanyProfile;
  clientCostCenter?: CostCenter;
}) {
  const [uploading, setUploading] = useState(false);

  const download = useCallback(
    () =>
      downloadRolWorkbook(
        {
          clientName,
          ...(clientCompany ? { company: clientCompany } : {}),
          ...(clientCostCenter ? { costCenter: clientCostCenter } : {}),
          year: period.year,
          monthIndex: period.monthIndex,
          lines,
          parameters: DEFAULT_PAYROLL_PARAMETERS,
        },
        clientLogo,
      ),
    [
      clientName,
      clientCompany,
      clientCostCenter,
      clientLogo,
      lines,
      period.monthIndex,
      period.year,
    ],
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
                cobrar) salen con su rótulo y en blanco, y las filas de bono van sumadas en{" "}
                <span className="font-mono">OTROS INGRESOS</span>: esa columna todavía no se relee,
                así que volver a cargar el archivo la perdería.
              </p>
              <p className="mt-2">
                Los NOMBRES PROPIOS que un empleado le haya puesto a sus filas —llamarle{" "}
                <span className="font-mono">Uniformes</span> a{" "}
                <span className="font-mono">OTROS</span>, por ejemplo— tampoco viajan: cada columna
                de la hoja lleva la cabecera del libro, que es lo que hace cotejable el archivo. Los
                importes vuelven completos; los nombres viven en la pantalla y en el comprobante.
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
