/**
 * LOS COMPROBANTES DE UN PERÍODO ENTERO: la nómina guardada → un `PayslipDocument` por empleado.
 *
 * Es `buildPayslipDocument` en bucle, y existe como función propia porque lo pide MÁS DE UNA
 * pantalla: la del período (`/payroll/[periodId]`) y la fila del historial, que baja el mismo .zip
 * sin abrir el período. Escrito a mano en las dos, «los comprobantes de este período» tendría dos
 * definiciones capaces de separarse —el orden, el `Codigo:`, el logo y el membrete del cliente— y nada lo
 * delataría: los dos archivos se abren por separado y cada uno parece correcto.
 *
 * Recibe las LÍNEAS y no un rol ya calculado, así que un consumidor no necesita el motor para pedir
 * su papel. Que la pantalla de detalle calcule su propio `rows` para los KPIs y la tabla no abre
 * ninguna grieta: las dos rutas pasan por `computeLinePayroll`, que es la única composición de
 * ficha + captura → motor del módulo, y el motor es determinista.
 *
 * Es puro: no lee la base ni escribe nada. Quién trae las líneas y quién baja el archivo es de la
 * capa de arriba.
 */
import type { CompanyProfile } from "@/lib/company-profile";
import type { CostCenter } from "@/lib/cost-center";
import type { EntityLogo } from "@/lib/workspaces";
import { computeLinePayroll, emptyCapture } from "../employee-input";
import type { PayrollParameters } from "../engine/parameters";
import type { PayrollEmployeeLine, PayrollPeriod } from "../types";
import { buildPayslipDocument } from "./document";
import type { PayslipDocument } from "./types";

export function buildPeriodPayslips({
  period,
  lines,
  parameters,
  clientName,
  clientLogo,
  clientCompany,
  clientCostCenter,
}: {
  period: PayrollPeriod;
  /** La nómina en el orden en que se lee la tabla: es el que numera el `Codigo:`. */
  lines: readonly PayrollEmployeeLine[];
  parameters: PayrollParameters;
  clientName: string;
  clientLogo?: EntityLogo;
  clientCompany?: CompanyProfile;
  clientCostCenter?: CostCenter;
}): PayslipDocument[] {
  return lines.map((line, index) =>
    buildPayslipDocument({
      line,
      computed: computeLinePayroll(line, parameters),
      capture: line.capture ?? emptyCapture(),
      year: period.year,
      monthIndex: period.monthIndex,
      clientName,
      ...(clientLogo ? { clientLogo } : {}),
      ...(clientCompany ? { clientCompany } : {}),
      ...(clientCostCenter ? { clientCostCenter } : {}),
      // `Codigo:` es la POSICIÓN en la nómina, 1…N, no el `id` de la ficha: la columna `A` del
      // libro es un contador por orden que salta las cabeceras de área.
      position: index + 1,
    }),
  );
}
