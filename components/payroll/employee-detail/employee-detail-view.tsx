"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { monthBounds, formatDayMonthYear } from "@/lib/date";
import {
  DEDUCTION_CONCEPTS,
  INCOME_CONCEPTS,
  capturedHoursField,
  deductionSwapPatch,
  incomeSwapPatch,
  type DeductionConcept,
  type IncomeConcept,
  type OvertimeHoursField,
} from "@/lib/payroll/concepts";
import {
  addExtraConcept,
  deleteExtraConcept,
  listEmployees,
  renameExtraConcept,
  updateEmployee,
  type ExtraConceptResult,
} from "@/lib/payroll/db";
import {
  EXTRA_CONCEPT_KIND_LABEL,
  extraCapBreaches,
  sumExtraIncome,
} from "@/lib/payroll/extra-income";
import { DEFAULT_PAYROLL_PARAMETERS } from "@/lib/payroll/engine/parameters";
import { computeLinePayroll, emptyCapture } from "@/lib/payroll/employee-input";
import { buildPayslipDocument } from "@/lib/payroll/payslip/document";
import { downloadPayslips, payslipFilename } from "@/lib/payroll/payslip/download";
import { reconciliationStatusOf } from "@/lib/payroll/period-detail";
import type {
  PayrollEmployeeLine,
  PayrollExtraConcept,
  PayrollExtraConceptKind,
  PayrollMonthlyCapture,
} from "@/lib/payroll/types";
import { usePayrollData } from "../payroll-data-provider";
import { PeriodNotFound } from "../period-detail/period-not-found";
import { ConceptTable } from "./concept-table";
import { EmployeeDetailCard, EmployeeDetailSection } from "./employee-detail-card";
import { EmployeeDetailHeader } from "./employee-detail-header";
import { EmployeeIdentityCards } from "./employee-identity-cards";
import { EmployeeMonthAdjustments, type ProvisionFlag } from "./employee-month-adjustments";
import { EmployeePeriodFields } from "./employee-period-fields";
import { EmployeeTotals } from "./employee-totals";

const EMPTY_LINES: PayrollEmployeeLine[] = [];
/** Constante estable: recrearla en cada render invalidaría los `useMemo` de las tablas. */
const EMPTY_ADDED: ReadonlySet<string> = new Set();
/** Lo mismo para los conceptos que el período no declara: entra en las dependencias del rol. */
const EMPTY_EXTRA_CONCEPTS: readonly PayrollExtraConcept[] = [];

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
  // Los conceptos extra los declara el PERÍODO, no la ficha: son una columna del rol compartida
  // por toda la nómina del mes, y aquí solo se captura el importe de este empleado.
  const extraConcepts = period?.extraConcepts ?? EMPTY_EXTRA_CONCEPTS;
  const computed = useMemo(
    () => (line ? computeLinePayroll(line, DEFAULT_PAYROLL_PARAMETERS, extraConcepts) : null),
    [line, extraConcepts],
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

  const handleApprovedOvertime = useCallback(
    (value: number | null) => patchCapture({ approvedOvertime: value }),
    [patchCapture],
  );

  const handleProvision = useCallback(
    (flag: ProvisionFlag, checked: boolean) => patchCapture({ [flag]: checked }),
    [patchCapture],
  );

  const addConcept = useCallback(
    (code: string) => setAdded((current) => new Set(current).add(code)),
    [],
  );

  /**
   * Quita una fila del catálogo del rol de ESTE empleado: vacía lo tecleado y la deja de mostrar.
   *
   * No borra el concepto —los trece ingresos y los trece egresos son del libro del contador y
   * existen siempre—, y por eso son dos escrituras: el importe (o las horas) a cero, que es lo que
   * hace que `visibleIncomeConcepts` deje de rendirla, y la salida de `added`, sin la cual la fila
   * seguiría a la vista en cero hasta recargar. Con una sola de las dos la fila no se va.
   */
  const removeConcept = useCallback(
    (code: string) => {
      const income = INCOME_CONCEPTS.find((concept) => concept.code === code);
      const hoursField = income ? capturedHoursField(income) : null;
      if (hoursField) {
        patchCapture({ [hoursField]: 0 });
      } else if (income?.kind === "capturado") {
        patchCapture({ [income.field]: 0 });
      } else {
        const deduction = DEDUCTION_CONCEPTS.find((concept) => concept.code === code);
        if (deduction?.kind === "capturado") {
          const base = line?.capture ?? emptyCapture();
          patchCapture({ deductions: { ...base.deductions, [deduction.field]: 0 } });
        }
      }
      setAdded((current) => {
        const next = new Set(current);
        next.delete(code);
        return next;
      });
    },
    [line?.capture, patchCapture],
  );

  /**
   * Los conceptos que el período declara por su cuenta. Las tres operaciones escriben en el
   * PERÍODO —no en esta ficha— porque un concepto extra es una columna del rol: declararlo aquí
   * le abre la fila a toda la nómina del mes, que es lo que hace que el rol siga siendo una tabla.
   *
   * El rechazo de un nombre (repetido, vacío, largo) se guarda para poder decirlo, y se limpia en
   * cuanto una operación sale bien: un aviso que se queda pegado deja de leerse.
   */
  const [extraError, setExtraError] = useState<string | null>(null);
  useEffect(() => setExtraError(null), [employeeId]);

  const applyExtra = useCallback(async (run: () => Promise<ExtraConceptResult>) => {
    const result = await run();
    setExtraError(result.ok ? null : result.message);
  }, []);

  const addExtra = useCallback(
    (kind: PayrollExtraConceptKind) => {
      // Nace con un nombre provisional porque la fila tiene que existir para poder escribir en
      // ella: el campo del rótulo es la propia fila, así que pedirlo antes en un diálogo sería un
      // paso de más y dejaría el nombre en dos sitios.
      void applyExtra(() =>
        addExtraConcept(periodId, uniqueDefaultLabel(period?.extraConcepts ?? [], kind), kind),
      );
    },
    [applyExtra, periodId, period?.extraConcepts],
  );

  const renameExtra = useCallback(
    (conceptId: string, label: string) =>
      void applyExtra(() => renameExtraConcept(periodId, conceptId, label)),
    [applyExtra, periodId],
  );

  const removeExtra = useCallback(
    (conceptId: string) => {
      setExtraError(null);
      void deleteExtraConcept(periodId, conceptId);
    },
    [periodId],
  );

  const setExtraAmount = useCallback(
    (conceptId: string, value: number) => {
      const base = line?.capture ?? emptyCapture();
      patchCapture({ extraAmounts: { ...base.extraAmounts, [conceptId]: value } });
    },
    [line?.capture, patchCapture],
  );

  /** Los topes, contra el sueldo unificado que el motor acaba de derivar. */
  const capBreaches = useMemo(
    () =>
      computed
        ? extraCapBreaches(
            sumExtraIncome(extraConcepts, capture.extraAmounts),
            computed.unifiedSalary,
          )
        : [],
    [computed, extraConcepts, capture.extraAmounts],
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
        ...(activeClient?.logo ? { clientLogo: activeClient.logo } : {}),
        extraConcepts,
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
  }, [
    activeClient?.name,
    activeClient?.logo,
    capture,
    computed,
    extraConcepts,
    index,
    line,
    period,
  ]);

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
                  onRemove={removeConcept}
                  extra={{
                    concepts: extraConcepts,
                    breaches: capBreaches,
                    onAdd: addExtra,
                    onRename: renameExtra,
                    onRemove: removeExtra,
                    onAmountChange: setExtraAmount,
                    error: extraError,
                  }}
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
                    onRemove={removeConcept}
                  />
                </div>
              </EmployeeDetailSection>

              <EmployeeDetailSection className="flex flex-wrap items-start justify-between gap-5">
                <EmployeeMonthAdjustments
                  approvedOvertime={capture.approvedOvertime}
                  provisionsThirteenth={capture.provisionsThirteenth}
                  provisionsFourteenth={capture.provisionsFourteenth}
                  computed={computed}
                  onApprovedOvertimeChange={handleApprovedOvertime}
                  onProvisionChange={handleProvision}
                />
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
/**
 * El nombre con el que nace un concepto: «Bono aportable», y «Bono aportable 2» si ese ya está.
 *
 * Nace con nombre en vez de vacío porque el rótulo es único dentro del período y dos filas sin
 * nombre chocarían entre sí antes de que nadie escriba nada. El sufijo se busca contra los
 * declarados, no contra un contador, para que borrar el 2 y volver a crear no dé un 3.
 */
function uniqueDefaultLabel(
  existing: readonly PayrollExtraConcept[],
  kind: PayrollExtraConceptKind,
): string {
  const base = EXTRA_CONCEPT_KIND_LABEL[kind];
  const taken = new Set(existing.map((concept) => concept.label.toLowerCase()));
  if (!taken.has(base.toLowerCase())) {
    return base;
  }
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) {
    n += 1;
  }
  return `${base} ${n}`;
}

function costCenterFor(area: string): string | null {
  const trimmed = area.trim();
  return trimmed ? `COSTO PERSONAL ${trimmed}` : null;
}
