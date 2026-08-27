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
/** A stable constant: recreating it on every render would invalidate the tables' `useMemo`s. */
const EMPTY_ADDED: ReadonlySet<string> = new Set();

/**
 * An employee's screen: `/payroll/[periodId]/[employeeId]`.
 *
 * It reads the período's WHOLE nómina, not just this employee, because the ‹ › arrows need to know
 * who comes before and who comes after — and reviewing a rol is precisely walking it. It is one
 * query and a few dozen rows, so fetching them all costs less than two queries.
 *
 * Nothing computed is stored: every figure comes out of `computeLinePayroll` at render time. It is
 * the same rule as the rest of the module (`PayrollRosterSummary`, the período totals) and it
 * matters here more than anywhere: a persisted figure would go stale the moment someone corrects the
 * days worked, and the screen would say one thing and the Excel another with nothing to give it
 * away.
 *
 * Every edit persists ON THE SPOT, on leaving the field — no draft and no save button. That is what
 * makes a rol readable: you correct the days and watch the net pay, the contribution and the cost
 * move at once, which is exactly the relationship the user comes to check.
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
   * The captured concepts the user added that are still worth zero.
   *
   * It is SCREEN state and is deliberately not stored: as soon as an amount is typed, the amount
   * itself makes the row visible (`visibleIncomeConcepts`), so persisting this would store empty
   * rows that say nothing. It is cleared on switching employee — each brings their own.
   */
  const [added, setAdded] = useState<ReadonlySet<string>>(EMPTY_ADDED);
  useEffect(() => setAdded(EMPTY_ADDED), [employeeId]);

  /** This screen's two dialogs. They close when switching employee with the arrows: one left open
   *  over another record would edit someone who was not being looked at. */
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

  // There is always a rol to compute: with no capture, what is captured is worth zero and the derived
  // figures still come out of the record. The app works with no Excel, and this is the point where
  // that is decided. The bonus rows travel INSIDE the capture, so this employee's rol needs nothing
  // from the período to be computed.
  const computed = useMemo(
    () => (line ? computeLinePayroll(line, DEFAULT_PAYROLL_PARAMETERS) : null),
    [line],
  );
  const capture = useMemo(() => line?.capture ?? emptyCapture(), [line]);

  /**
   * Every write goes through here and persists ON THE SPOT, on leaving each field. There is no draft
   * and no save button: `useLiveQuery` re-reads, the engine recomputes and the screen shows the
   * effect immediately — which is what makes a rol readable, watching the net pay move as the days
   * are corrected. It is the same mechanic as PyG's Datos table.
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
   * Removes the employee from THIS período and goes back to the list: without them, this screen is
   * left showing «does not exist» over a URL that no longer leads anywhere.
   *
   * The navigation happens BEFORE `useLiveQuery` re-reads, which is what avoids that flicker.
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
   * Removes a catalogue row from THIS employee's rol: it empties what was typed and stops showing it.
   *
   * It does not delete the concept —the thirteen income and thirteen deduction concepts belong to the
   * accountant's book and always exist—, and that is why it is two writes: the amount (or the hours)
   * to zero, which is what makes `visibleIncomeConcepts` stop rendering it, and the removal from
   * `added`, without which the row would stay in sight at zero until a reload. With only one of the
   * two the row does not go away.
   *
   * And it takes the ROW'S OWN LABEL with it in the same write: leaving it hanging would resurrect it
   * on adding that concept again, putting another month's name on a new figure.
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
   * This employee's BONUS rows, and the own label of the catalogue rows. The five operations write to
   * the CAPTURE, which is where every label of the rol now lives: a bonus row carries its name, its
   * class and its amount together, and a catalogue one stores its name in `labels` under its code.
   *
   * A name's rejection (duplicate, empty, too long) is kept so it can be said out loud, and it is
   * cleared as soon as an operation succeeds: a notice that stays stuck stops being read.
   */
  const [extraError, setExtraError] = useState<string | null>(null);
  useEffect(() => setExtraError(null), [employeeId]);

  /** The universe uniqueness is judged against: everything this employee has in sight. */
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
      // It is born with a provisional name because the row has to exist before anything can be
      // written into it: the label field IS the row itself, so asking for it beforehand in a dialog
      // would be one step too many and would leave the name in two places.
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

  /** The own label of a CATALOGUE row. An empty name deletes the entry: the row goes back to being
   *  called what the book calls it instead of being stored labelled with nothing. */
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

  /** The caps, against the unified salary the engine has just derived. */
  const capBreaches = useMemo(
    () =>
      computed ? extraCapBreaches(sumExtraIncome(capture.extras), computed.unifiedSalary) : [],
    [computed, capture.extras],
  );

  /**
   * The payslip in PDF. It is assembled ON THE SPOT from the record, what was captured and what the
   * engine has just derived — nothing is persisted, for the same reason no total of the module is:
   * a stored copy would go stale on correcting the days worked and the paper would say one thing and
   * the screen another.
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
        ...(activeClient?.costCenter ? { clientCostCenter: activeClient.costCenter } : {}),
        // The book calls its `A` column `Codigo:`, which is a 1…N counter in nómina order skipping
        // the area headers — the same position the header already shows.
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
    activeClient?.costCenter,
    capture,
    computed,
    index,
    line,
    period,
  ]);

  // Before the first read from Dexie it is not known whether the período exists: waiting avoids the
  // «does not exist» empty state flickering over one that is actually there.
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
 * The cost center the payslip prints under the area: «HOSPEDAJE» → «COSTO PERSONAL HOSPEDAJE».
 *
 * ⚠️ It is a DERIVATION, not data: the rol does not carry this column and the module does not store a
 * plan of cost centers yet. It reproduces exactly what the design prototype does for any area, and it
 * serves while the firm does not provide the real map —which may not be a template, since an area
 * could be charged against a center with another name—. The day that map exists, this is replaced by
 * a read and not by another template.
 */

function costCenterFor(area: string): string | null {
  const trimmed = area.trim();
  return trimmed ? `COSTO PERSONAL ${trimmed}` : null;
}
