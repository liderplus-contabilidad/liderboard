"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { monthBounds, formatDayMonthYear } from "@/lib/date";
import {
  DEDUCTION_CONCEPTS,
  INCOME_CONCEPTS,
  deductionSwapPatch,
  incomeSwapPatch,
  type DeductionConcept,
  type IncomeConcept,
  type OvertimeHoursField,
} from "@/lib/payroll/concepts";
import { listEmployees, updateEmployee } from "@/lib/payroll/db";
import { DEFAULT_PAYROLL_PARAMETERS } from "@/lib/payroll/engine/parameters";
import { computeLinePayroll, emptyCapture } from "@/lib/payroll/employee-input";
import { buildPayslipDocument } from "@/lib/payroll/payslip/document";
import { downloadPayslips, payslipFilename } from "@/lib/payroll/payslip/download";
import { reconciliationStatusOf } from "@/lib/payroll/period-detail";
import type { PayrollEmployeeLine, PayrollMonthlyCapture } from "@/lib/payroll/types";
import { usePayrollData } from "../payroll-data-provider";
import { PeriodNotFound } from "../period-detail/period-not-found";
import { ConceptTable } from "./concept-table";
import { EmployeeDetailCard, EmployeeDetailSection } from "./employee-detail-card";
import { EmployeeDetailHeader } from "./employee-detail-header";
import { EmployeeIdentityCards } from "./employee-identity-cards";
import { EmployeePeriodFields } from "./employee-period-fields";
import { EmployeeTotals } from "./employee-totals";

const EMPTY_LINES: PayrollEmployeeLine[] = [];
/** Constante estable: recrearla en cada render invalidaría los `useMemo` de las tablas. */
const EMPTY_ADDED: ReadonlySet<string> = new Set();

/**
 * La pantalla de un empleado: `/payroll/[periodId]/[employeeId]`.
 *
 * Lee la nómina ENTERA del período, no solo a este empleado, porque las flechas ‹ › necesitan
 * saber quién va antes y quién después — y revisar un rol es justamente recorrerlo. Es una sola
 * consulta y son decenas de filas, así que traerlas todas cuesta menos que dos consultas.
 *
 * Nada calculado se guarda: cada cifra sale de `computeLinePayroll` en el render. Es la misma
 * regla que el resto del módulo (`PayrollRosterSummary`, los totales del período) y aquí pesa más
 * que en ningún sitio: una cifra persistida quedaría obsoleta en cuanto alguien corrija los días
 * trabajados, y la pantalla diría una cosa y el Excel otra sin que nada lo delate.
 *
 * Cada edición persiste EN EL ACTO, al salir del campo — sin borrador ni botón de guardar. Es lo
 * que hace legible un rol: corriges los días y ves moverse el líquido, el aporte y el costo a la
 * vez, que es exactamente la relación que el usuario viene a comprobar.
 */
export function EmployeeDetailView({
  periodId,
  employeeId,
}: {
  periodId: string;
  employeeId: string;
}) {
  const { activeClient, activeClientId, periods, ready } = usePayrollData();
  const lines = useLiveQuery(() => listEmployees(periodId), [periodId]) ?? EMPTY_LINES;

  /**
   * Los conceptos capturados que el usuario añadió y todavía valen cero.
   *
   * Es estado de PANTALLA y no se guarda a propósito: en cuanto se teclea un importe, el propio
   * importe hace visible la fila (`visibleIncomeConcepts`), así que persistir esto guardaría filas
   * vacías que no dicen nada. Se vacía al cambiar de empleado — cada uno trae los suyos.
   */
  const [added, setAdded] = useState<ReadonlySet<string>>(EMPTY_ADDED);
  useEffect(() => setAdded(EMPTY_ADDED), [employeeId]);

  const period = periods.find((candidate) => candidate.id === periodId) ?? null;
  const index = lines.findIndex((line) => line.id === employeeId);
  const line = index === -1 ? null : lines[index];

  // Siempre hay rol que calcular: sin captura, lo capturado vale cero y las cifras derivadas
  // salen igual de la ficha. La app sirve sin Excel, y este es el punto donde eso se decide.
  const computed = useMemo(
    () => (line ? computeLinePayroll(line, DEFAULT_PAYROLL_PARAMETERS) : null),
    [line],
  );
  const capture = useMemo(() => line?.capture ?? emptyCapture(), [line]);

  /**
   * Toda escritura pasa por aquí y persiste EN EL ACTO, al salir de cada campo. No hay borrador
   * ni botón de guardar: `useLiveQuery` relee, el motor recalcula y la pantalla enseña el efecto
   * inmediatamente — que es lo que hace legible un rol, ver moverse el líquido al corregir los
   * días. Es la misma mecánica que la tabla de Datos de PyG.
   */
  const patchCapture = useCallback(
    (change: Partial<PayrollMonthlyCapture>) => {
      if (!line) {
        return;
      }
      void updateEmployee(line.id, { capture: { ...(line.capture ?? emptyCapture()), ...change } });
    },
    [line],
  );

  const handleIncomeAmount = useCallback(
    (concept: IncomeConcept, value: number) => {
      if (concept.kind === "capturado") {
        patchCapture({ [concept.field]: value });
      }
    },
    [patchCapture],
  );

  const handleDeductionAmount = useCallback(
    (concept: DeductionConcept, value: number) => {
      if (concept.kind === "capturado") {
        const base = line?.capture ?? emptyCapture();
        patchCapture({ deductions: { ...base.deductions, [concept.field]: value } });
      }
    },
    [line?.capture, patchCapture],
  );

  const handleHours = useCallback(
    (field: OvertimeHoursField, value: number) => patchCapture({ [field]: value }),
    [patchCapture],
  );

  const addConcept = useCallback(
    (code: string) => setAdded((current) => new Set(current).add(code)),
    [],
  );

  /**
   * Cambia una fila por otro concepto, llevándose lo que se tecleó en ella cuando las dos hablan
   * la misma unidad. QUÉ se escribe lo decide `incomeSwapPatch`/`deductionSwapPatch`, en la capa
   * pura y con tests: aquí solo queda recordar que la fila nueva está puesta, para que no
   * desaparezca en el instante en que nace valiendo cero.
   */
  const swapConcept = useCallback(
    (
      from: string,
      to: string,
      patchFor: (base: PayrollMonthlyCapture) => Partial<PayrollMonthlyCapture> | null,
    ) => {
      const patch = patchFor(line?.capture ?? emptyCapture());
      if (!patch) {
        return;
      }
      patchCapture(patch);
      setAdded((current) => {
        // El concepto nuevo ocupa el SITIO del viejo, no el final de la cola: cambiar lo que una
        // fila es no debería moverla de sitio bajo el cursor.
        const codes = [...current];
        const at = codes.indexOf(from);
        if (at === -1) {
          return new Set([...codes, to]);
        }
        codes[at] = to;
        return new Set(codes);
      });
    },
    [line?.capture, patchCapture],
  );

  /**
   * El comprobante en PDF. Se arma EN EL MOMENTO desde la ficha, lo capturado y lo que acaba de
   * derivar el motor — nada se persiste, por la misma razón que no se persiste ningún total del
   * módulo: una copia guardada quedaría obsoleta al corregir los días trabajados y el papel diría
   * una cosa y la pantalla otra.
   */
  const [downloading, setDownloading] = useState(false);
  const downloadPayslip = useCallback(async () => {
    if (!line || !computed || !period) {
      return;
    }
    setDownloading(true);
    try {
      const document = buildPayslipDocument({
        line,
        computed,
        capture,
        year: period.year,
        monthIndex: period.monthIndex,
        clientName: activeClient?.name ?? "",
        // El libro llama `Codigo:` a su columna `A`, que es un contador 1…N por orden de nómina
        // saltando las cabeceras de área — la misma posición que la cabecera ya muestra.
        position: index + 1,
      });
      await downloadPayslips(
        [document],
        payslipFilename(period.year, period.monthIndex, line.name),
      );
    } finally {
      setDownloading(false);
    }
  }, [activeClient?.name, capture, computed, index, line, period]);

  const swapIncome = useCallback(
    (from: string, to: string) => {
      const origin = INCOME_CONCEPTS.find((c) => c.code === from);
      const target = INCOME_CONCEPTS.find((c) => c.code === to);
      if (origin && target) {
        swapConcept(from, to, (base) => incomeSwapPatch(origin, target, base));
      }
    },
    [swapConcept],
  );
  const swapDeduction = useCallback(
    (from: string, to: string) => {
      const origin = DEDUCTION_CONCEPTS.find((c) => c.code === from);
      const target = DEDUCTION_CONCEPTS.find((c) => c.code === to);
      if (origin && target) {
        swapConcept(from, to, (base) => deductionSwapPatch(origin, target, base));
      }
    },
    [swapConcept],
  );

  // Antes de la primera lectura de Dexie no se sabe si el período existe: esperar evita el
  // parpadeo del vacío «no existe» sobre uno que en realidad sí está.
  if (!ready) {
    return null;
  }

  if (activeClientId === null || !period || !line) {
    return <PeriodNotFound />;
  }

  const bounds = monthBounds(period.year, period.monthIndex);
  const target = (offset: number) => {
    const other = lines[index + offset];
    return other ? { href: `/payroll/${periodId}/${other.id}`, name: other.name } : null;
  };

  return (
    <div className="px-7 py-5">
      <EmployeeDetailHeader
        backHref={`/payroll/${periodId}`}
        year={period.year}
        monthIndex={period.monthIndex}
        employeeName={line.name}
        position={{ index: index + 1, total: lines.length }}
        prev={target(-1)}
        next={target(1)}
        onDownloadPayslip={() => void downloadPayslip()}
        downloading={downloading}
      />

      <div className="mt-4">
        <EmployeeDetailCard
          status={reconciliationStatusOf(computed?.difference ?? null)}
          number={index + 1}
        >
          <EmployeeIdentityCards
            clientName={activeClient?.name ?? ""}
            costCenter={costCenterFor(line.area)}
            employee={line}
          />

          <EmployeePeriodFields
            periodStart={bounds.start}
            periodEnd={bounds.end}
            hireDate={formatDayMonthYear(line.hireDate)}
            contractType={line.contractType}
            accumulatesReserveFund={line.accumulatesReserveFund}
            days={line.days}
            baseSalary={line.baseSalary}
            paid={line.capture?.paid ?? null}
            onDaysChange={(days) => void updateEmployee(line.id, { days })}
            onBaseSalaryChange={(baseSalary) => void updateEmployee(line.id, { baseSalary })}
            onPaidChange={(paid) => patchCapture({ paid })}
          />

          {computed && (
            <>
              <EmployeeDetailSection>
                <ConceptTable
                  kind="ingresos"
                  computed={computed}
                  capture={capture}
                  total={computed.grossIncome}
                  added={added}
                  onAmountChange={handleIncomeAmount}
                  onHoursChange={handleHours}
                  onAdd={addConcept}
                  onSwap={swapIncome}
                />
                <div className="mt-5">
                  <ConceptTable
                    kind="egresos"
                    computed={computed}
                    capture={capture}
                    total={computed.totalDeductions}
                    added={added}
                    onAmountChange={handleDeductionAmount}
                    onAdd={addConcept}
                    onSwap={swapDeduction}
                  />
                </div>
              </EmployeeDetailSection>

              <EmployeeDetailSection>
                <EmployeeTotals computed={computed} />
              </EmployeeDetailSection>
            </>
          )}
        </EmployeeDetailCard>
      </div>
    </div>
  );
}

/**
 * El centro de costo que el comprobante imprime bajo el área: «HOSPEDAJE» → «COSTO PERSONAL
 * HOSPEDAJE».
 *
 * ⚠️ Es una DERIVACIÓN, no un dato: el rol no trae esta columna y el módulo todavía no guarda un
 * plan de centros de costo. Reproduce exactamente lo que el prototipo del diseño hace para
 * cualquier área, y sirve mientras la firma no dé el mapa real —que puede no ser una plantilla,
 * porque un área podría cargarse contra un centro con otro nombre—. El día que ese mapa exista,
 * esto se sustituye por una lectura y no por otra plantilla.
 */
function costCenterFor(area: string): string | null {
  const trimmed = area.trim();
  return trimmed ? `COSTO PERSONAL ${trimmed}` : null;
}
