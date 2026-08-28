"use client";

import type { ReactNode } from "react";
import { NumericInput } from "@/components/ui/numeric-input";
import { formatCurrency } from "@/lib/format";
import type { PayrollEmployeeLine } from "@/lib/payroll/types";

interface EmployeePeriodFieldsProps {
  /** The calendar's three ends arrive ALREADY FORMATTED. Formatting a date is a rule of the app
   *  (`@/lib/date.ts`), not of this screen: written here there would be two definitions of «what a
   *  date looks like» and they could drift apart. `hireDate` is `null` when the record does not
   *  declare it. */
  periodStart: string;
  periodEnd: string;
  hireDate: string | null;
  /** `BB` · TC. The LITERAL code is shown («CT»/«TP»), not «Tiempo completo»: it is what the book
   *  writes and what the accountant checks cell by cell against their sheet. */
  contractType: PayrollEmployeeLine["contractType"];
  /** `AZ` · AC FR — from the record, not the month: it is a choice of the employee. */
  accumulatesReserveFund: boolean;
  /** `AS` and `AT` · what the engine derived for the two décimo provisions, or `null` when the record
   *  has them switched off. The box shows the AMOUNT when it provisions and «No» when it does not:
   *  those are the two questions anyone asks there, and the amount already implies the answer to the
   *  first.
   *
   *  They are here, read-only, because these two figures appear nowhere else on the screen
   *  —`EmployeeTotals` breaks out none of the five provisions— and the checkboxes that showed them
   *  moved to the record dialog, which is where they come from. */
  thirteenthProvision: number | null;
  fourteenthProvision: number | null;
  /** `E` · days paid in the month. */
  days: number;
  /** `D` · sueldo base. */
  baseSalary: number;
  /** `BZ` · PAGADO. `null` while the período does not declare it — and that is NOT zero: without it
   *  the employee is neither reconciled nor in difference. */
  paid: number | null;
  onDaysChange: (days: number) => void;
  onBaseSalaryChange: (baseSalary: number) => void;
  onPaidChange: (paid: number | null) => void;
  /** Switches the three editable ones off: a closed período, or while saving. */
  readOnly?: boolean;
}

/**
 * The grid of eight fields between the identity cards and the concept tables: the frame under which
 * every figure below is read.
 *
 * Five are READ-ONLY on a grey fill and three are edited, and that is the only distinction the grid
 * makes visible — the same grammar the concept tables use a little further down (grey = what is not
 * typed), so whoever reads the screen learns the rule once.
 *
 * The período's two ends are not edited because the período declares them, not the employee; the
 * contract type, the hire date, the reserve-fund accumulation and the two décimo provisions belong to
 * the RECORD and change there —in «Editar ficha», from the header—, not in the month being captured.
 *
 * The label goes to the LEFT of the value and aligned towards it, not above: with the eight values in
 * boxes of the same width and right-aligned, the column of figures stays plumb and is compared at a
 * glance, which is what one does with these fields.
 */
export function EmployeePeriodFields({
  periodStart,
  periodEnd,
  hireDate,
  contractType,
  accumulatesReserveFund,
  thirteenthProvision,
  fourteenthProvision,
  days,
  baseSalary,
  paid,
  onDaysChange,
  onBaseSalaryChange,
  onPaidChange,
  readOnly = false,
}: EmployeePeriodFieldsProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-x-[26px] gap-y-3.5 px-5 pb-5">
      <ReadOnlyField label="Inicio de período" value={periodStart} />
      <ReadOnlyField label="Fin de período" value={periodEnd} />
      <EditableField label="Días trabajados">
        <NumericInput
          value={days}
          onCommit={(value) => onDaysChange(value ?? 0)}
          format="plain"
          disabled={readOnly}
          ariaLabel="Días trabajados"
          className="text-[12.5px]"
        />
      </EditableField>
      <EditableField label="Sueldo base">
        <NumericInput
          value={baseSalary}
          onCommit={(value) => onBaseSalaryChange(value ?? 0)}
          disabled={readOnly}
          ariaLabel="Sueldo base"
          className="text-[12.5px]"
        />
      </EditableField>

      <ReadOnlyField label="Tipo de contrato" value={contractType} />
      <ReadOnlyField label="Fecha de ingreso" value={hireDate} />
      <ReadOnlyField label="Acumula fondo reserva" value={accumulatesReserveFund ? "Sí" : "No"} />
      <ReadOnlyField label="Provisiona décimo III" value={provisionLabel(thirteenthProvision)} />
      <ReadOnlyField label="Provisiona décimo IV" value={provisionLabel(fourteenthProvision)} />
      <EditableField label="Pagado">
        <NumericInput
          value={paid}
          onCommit={onPaidChange}
          nullable
          disabled={readOnly}
          ariaLabel="Pagado"
          className="text-[12.5px]"
        />
      </EditableField>
    </div>
  );
}

/** A provision that is on is stated with its amount; off, with a «No». A `$0.00` would not do: it
 *  would read as «provisions zero» instead of «does not provision». */
function provisionLabel(amount: number | null): string {
  return amount === null ? "No" : formatCurrency(amount, { cents: true });
}

/** Both classes of field measure alike: the label shrinks and the box does not, so the eight boxes
 *  stay plumb even though the labels measure differently. */
const LABEL_CLASS = "min-w-0 flex-1 truncate text-right text-[12px] text-muted";
const BOX_CLASS =
  "w-[132px] shrink-0 rounded-lg px-2.5 py-2 text-right font-mono text-[12.5px] tabular-nums";

/** A datum this screen does not decide: a grey box with no control inside. Not an `<input disabled>`
 *  — a switched-off field invites you to try it; a box that is not one does not. */
function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <span className={LABEL_CLASS}>{label}</span>
      <span className={`${BOX_CLASS} truncate border border-border bg-surface-calc text-muted`}>
        {value ? value : "—"}
      </span>
    </div>
  );
}

function EditableField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-3">
      <span className={LABEL_CLASS}>{label}</span>
      <span
        className={`${BOX_CLASS} border border-chip-border bg-surface transition-colors focus-within:border-brand`}
      >
        {children}
      </span>
    </label>
  );
}
