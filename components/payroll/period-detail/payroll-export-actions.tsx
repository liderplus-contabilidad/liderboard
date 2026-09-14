"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ExportActions, type ExportOption } from "@/components/ui/export-actions";
import type { CompanyProfile } from "@/lib/company-profile";
import type { CostCenter } from "@/lib/cost-center";
import type { EntityLogo } from "@/lib/logos";
import { downloadRolWorkbook } from "@/lib/payroll/export/download";
import { DEFAULT_PAYROLL_PARAMETERS } from "@/lib/payroll/engine/parameters";
import { downloadPayslipZip } from "@/lib/payroll/payslip/download";
import { buildPeriodPayslips } from "@/lib/payroll/payslip/period";
import type { PayrollEmployeeLine, PayrollPeriod } from "@/lib/payroll/types";
import { RolUploadModal } from "../rol-upload-modal";

/**
 * Rol de Pagos' wrapper over `ExportActions` — the same rule `PygExportActions` and
 * `OccupancyExportActions` follow: the module supplies what «Cargar» opens, what «Exportar» offers
 * and what the `ⓘ` says; the shape of the controls belongs to the primitive and no module writes it.
 *
 * It goes in the tab bar's `rightSlot`, and only over «Empleados»: loading and exporting the rol is
 * what happens in that view, just as PyG mounts its upload only over Datos.
 *
 * «Exportar» offers the two files the período delivers: the rol as an Excel —the GENERAL sheet— and
 * the payslips as PDFs, one per employee in a .zip. Both are assembled HERE, at the moment of the
 * click, from the nómina and the engine: nothing either file carries is stored, which is the same rule
 * as the journal entry. `buildPeriodPayslips` is the SAME builder the history row uses, which
 * downloads this same .zip without opening the período. While `pdf-lib` loads and one PDF per
 * employee is assembled the primitive shows its progress: with nóminas of thirty employees that is a
 * few tenths of a second, and without the notice the entry looked unresponsive and got pressed again.
 */
export function PayrollExportActions({
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

  const downloadPayslips = useCallback(
    () =>
      downloadPayslipZip(
        buildPeriodPayslips({
          period,
          lines,
          parameters: DEFAULT_PAYROLL_PARAMETERS,
          clientName,
          ...(clientLogo ? { clientLogo } : {}),
          ...(clientCompany ? { clientCompany } : {}),
          ...(clientCostCenter ? { clientCostCenter } : {}),
        }),
        period,
      ),
    [clientName, clientLogo, clientCompany, clientCostCenter, lines, period],
  );

  const empty = lines.length === 0;
  // The same reason for both files: with no employees there is nothing to write on either.
  const emptyReason = "El período todavía no tiene empleados.";

  const exports = useMemo<ExportOption[]>(
    () => [
      {
        id: "rol",
        title: "Rol de pagos",
        description:
          "La hoja GENERAL del período, con las columnas del libro y todas las cifras del motor.",
        icon: FileSpreadsheet,
        iconClassName: "text-brand",
        disabled: empty,
        disabledReason: emptyReason,
        run: download,
      },
      {
        id: "payslips",
        title: "Roles individuales",
        description: "Un PDF por empleado, en el orden de la tabla, dentro de un .zip.",
        icon: FileText,
        iconClassName: "text-muted",
        disabled: empty,
        disabledReason: emptyReason,
        run: downloadPayslips,
      },
    ],
    [empty, download, downloadPayslips],
  );

  return (
    <>
      <ExportActions
        upload={{ label: "Cargar rol de pagos", onClick: () => setUploading(true) }}
        exports={exports}
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
