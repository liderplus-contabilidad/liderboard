"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { monthBounds, formatDayMonthYear } from "@/lib/date";
import {
  DEDUCTION_CONCEPTS,
  INCOME_CONCEPTS,
  capturedHoursField,
  visibleDeductionConcepts,
  visibleIncomeConcepts,
  type DeductionConcept,
  type IncomeConcept,
  type OvertimeHoursField,
} from "@/lib/payroll/concepts";
import { deleteEmployee, listEmployees, updateEmployee } from "@/lib/payroll/db";
import {
  extraCapBreaches,
  newExtraRow,
  removeExtraRow,
  renameExtraRow,
  setExtraRowAmount,
  sumExtraIncome,
} from "@/lib/payroll/extra-income";
import {
  rowLabelUniverse,
  validateRowLabel,
  withRowLabel,
  withoutRowLabel,
} from "@/lib/payroll/row-labels";
import { DEFAULT_PAYROLL_PARAMETERS } from "@/lib/payroll/engine/parameters";
import { computeLinePayroll, emptyCapture } from "@/lib/payroll/employee-input";
import { buildPayslipDocument } from "@/lib/payroll/payslip/document";
import { downloadPayslips, payslipFilename } from "@/lib/payroll/payslip/download";
import { reconciliationStatusOf } from "@/lib/payroll/period-detail";
import { periodLongLabel } from "@/lib/payroll/periods";
import type {
  PayrollEmployeeLine,
  PayrollExtraConceptKind,
  PayrollMonthlyCapture,
} from "@/lib/payroll/types";
import { EmployeeFormModal } from "../employee-form-modal";
import { usePayrollData } from "../payroll-data-provider";
import { PeriodNotFound } from "../period-detail/period-not-found";
import { ConceptTable } from "./concept-table";
import { EmployeeDetailCard, EmployeeDetailSection } from "./employee-detail-card";
import { EmployeeDetailHeader } from "./employee-detail-header";
import { EmployeeIdentityCards } from "./employee-identity-cards";
import { EmployeeOvertimeApproval } from "./employee-overtime-approval";
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

  /** Los dos diálogos de esta pantalla. Se cierran al cambiar de empleado con las flechas: uno
   *  abierto sobre otra ficha editaría a quien no se estaba mirando. */
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    setEditing(false);
    setDeleting(false);
  }, [employeeId]);
  const router = useRouter();

  const period = periods.find((candidate) => candidate.id === periodId) ?? null;
  const index = lines.findIndex((line) => line.id === employeeId);
  const line = index === -1 ? null : lines[index];

  // Siempre hay rol que calcular: sin captura, lo capturado vale cero y las cifras derivadas
  // salen igual de la ficha. La app sirve sin Excel, y este es el punto donde eso se decide.
  // Las filas de bono viajan DENTRO de la captura, así que el rol de este empleado no necesita
  // nada del período para calcularse.
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

  const handleApprovedOvertime = useCallback(
    (value: number | null) => patchCapture({ approvedOvertime: value }),
    [patchCapture],
  );

  const addConcept = useCallback(
    (code: string) => setAdded((current) => new Set(current).add(code)),
    [],
  );

  /**
   * Da de baja al empleado de ESTE período y vuelve al listado: sin él, esta pantalla se queda
   * enseñando «no existe» sobre una URL que ya no lleva a nada.
   *
   * Se navega ANTES de que `useLiveQuery` relea, que es lo que evita ese parpadeo.
   */
  const [removing, setRemoving] = useState(false);
  const confirmDelete = useCallback(async () => {
    if (!line) {
      return;
    }
    setRemoving(true);
    try {
      await deleteEmployee(line.id);
      router.push(`/payroll/${periodId}`);
    } finally {
      setRemoving(false);
    }
  }, [line, periodId, router]);

  /**
   * Quita una fila del catálogo del rol de ESTE empleado: vacía lo tecleado y la deja de mostrar.
   *
   * No borra el concepto —los trece ingresos y los trece egresos son del libro del contador y
   * existen siempre—, y por eso son dos escrituras: el importe (o las horas) a cero, que es lo que
   * hace que `visibleIncomeConcepts` deje de rendirla, y la salida de `added`, sin la cual la fila
   * seguiría a la vista en cero hasta recargar. Con una sola de las dos la fila no se va.
   *
   * Y se lleva el RÓTULO PROPIO en la misma escritura: dejarlo colgado lo resucitaría al volver a
   * agregar ese concepto, poniéndole a una cifra nueva el nombre de otro mes.
   */
  const removeConcept = useCallback(
    (code: string) => {
      const base = line?.capture ?? emptyCapture();
      const labels = withoutRowLabel(base.labels, code);
      const income = INCOME_CONCEPTS.find((concept) => concept.code === code);
      const hoursField = income ? capturedHoursField(income) : null;
      if (hoursField) {
        patchCapture({ [hoursField]: 0, labels });
      } else if (income?.kind === "capturado") {
        patchCapture({ [income.field]: 0, labels });
      } else {
        const deduction = DEDUCTION_CONCEPTS.find((concept) => concept.code === code);
        if (deduction?.kind === "capturado") {
          patchCapture({ deductions: { ...base.deductions, [deduction.field]: 0 }, labels });
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
   * Las filas de BONO de este empleado, y el rótulo propio de las filas del catálogo. Las cinco
   * operaciones escriben en la CAPTURA, que es donde vive ahora todo rótulo del rol: una fila de
   * bono lleva su nombre, su clase y su importe juntos, y una del catálogo guarda su nombre en
   * `labels` bajo su código.
   *
   * El rechazo de un nombre (repetido, vacío, largo) se guarda para poder decirlo, y se limpia en
   * cuanto una operación sale bien: un aviso que se queda pegado deja de leerse.
   */
  const [extraError, setExtraError] = useState<string | null>(null);
  useEffect(() => setExtraError(null), [employeeId]);

  /** El universo contra el que se juzga la unicidad: todo lo que este empleado tiene a la vista. */
  const labelUniverse = useMemo(
    () =>
      rowLabelUniverse(capture, [
        ...visibleIncomeConcepts(capture, added),
        ...visibleDeductionConcepts(capture, added),
      ]),
    [capture, added],
  );

  const addExtra = useCallback(
    (kind: PayrollExtraConceptKind) => {
      // Nace con un nombre provisional porque la fila tiene que existir para poder escribir en
      // ella: el campo del rótulo ES la propia fila, así que pedirlo antes en un diálogo sería un
      // paso de más y dejaría el nombre en dos sitios.
      const base = line?.capture ?? emptyCapture();
      const rows = base.extras ?? [];
      setExtraError(null);
      patchCapture({
        extras: [
          ...rows,
          newExtraRow(
            kind,
            rows,
            labelUniverse.map((row) => row.label),
          ),
        ],
      });
    },
    [line?.capture, patchCapture, labelUniverse],
  );

  const renameExtra = useCallback(
    (rowId: string, label: string) => {
      const base = line?.capture ?? emptyCapture();
      const check = validateRowLabel(label, labelUniverse, rowId);
      if (!check.ok) {
        setExtraError(check.message);
        return;
      }
      setExtraError(null);
      patchCapture({ extras: renameExtraRow(base.extras ?? [], rowId, check.name) });
    },
    [line?.capture, patchCapture, labelUniverse],
  );

  const removeExtra = useCallback(
    (rowId: string) => {
      const base = line?.capture ?? emptyCapture();
      setExtraError(null);
      patchCapture({ extras: removeExtraRow(base.extras ?? [], rowId) });
    },
    [line?.capture, patchCapture],
  );

  const setExtraAmount = useCallback(
    (rowId: string, value: number) => {
      const base = line?.capture ?? emptyCapture();
      patchCapture({ extras: setExtraRowAmount(base.extras ?? [], rowId, value) });
    },
    [line?.capture, patchCapture],
  );

  /** El rótulo propio de una fila del CATÁLOGO. Un nombre vacío borra la entrada: la fila vuelve a
   *  llamarse como el libro en vez de guardarse rotulada con nada. */
  const renameRow = useCallback(
    (code: string, label: string) => {
      const base = line?.capture ?? emptyCapture();
      if (label.trim()) {
        const check = validateRowLabel(label, labelUniverse, code);
        if (!check.ok) {
          setExtraError(check.message);
          return;
        }
        setExtraError(null);
        patchCapture({ labels: withRowLabel(base.labels, code, check.name) });
        return;
      }
      setExtraError(null);
      patchCapture({ labels: withRowLabel(base.labels, code, "") });
    },
    [line?.capture, patchCapture, labelUniverse],
  );

  /** Los topes, contra el sueldo unificado que el motor acaba de derivar. */
  const capBreaches = useMemo(
    () =>
      computed ? extraCapBreaches(sumExtraIncome(capture.extras), computed.unifiedSalary) : [],
    [computed, capture.extras],
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
        ...(activeClient?.company ? { clientCompany: activeClient.company } : {}),
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
    activeClient?.company,
    capture,
    computed,
    index,
    line,
    period,
  ]);

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
        onEdit={() => setEditing(true)}
        onDelete={() => setDeleting(true)}
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
            thirteenthProvision={
              line.provisionsThirteenth ? (computed?.thirteenthProvision ?? 0) : null
            }
            fourteenthProvision={
              line.provisionsFourteenth ? (computed?.fourteenthProvision ?? 0) : null
            }
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
                  onRename={renameRow}
                  onRemove={removeConcept}
                  extra={{
                    rows: capture.extras ?? [],
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
                    onRename={renameRow}
                    onRemove={removeConcept}
                  />
                </div>
              </EmployeeDetailSection>

              <EmployeeDetailSection className="flex flex-wrap items-start justify-between gap-5">
                <EmployeeOvertimeApproval
                  approvedOvertime={capture.approvedOvertime}
                  computed={computed}
                  onApprovedOvertimeChange={handleApprovedOvertime}
                />
                <EmployeeTotals computed={computed} />
              </EmployeeDetailSection>
            </>
          )}
        </EmployeeDetailCard>
      </div>

      {editing && (
        <EmployeeFormModal
          period={period}
          lines={lines}
          employee={line}
          onClose={() => setEditing(false)}
        />
      )}

      <ConfirmDialog
        open={deleting}
        variant="destructive"
        title={`Eliminar a ${line.name}`}
        description={
          <>
            Sale de la nómina de {periodLongLabel(period.year, period.monthIndex)} y el rol del mes
            se recalcula sin él. Los otros períodos no cambian: cada uno guarda su propia nómina.
          </>
        }
        confirmLabel="Eliminar empleado"
        busy={removing}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(false)}
      />
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
