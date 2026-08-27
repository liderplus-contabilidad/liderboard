"use client";

import { X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldBox, FormField, TextField } from "@/components/ui/form-field";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select } from "@/components/ui/select";
import { areaOptions } from "@/lib/payroll/areas";
import { addEmployee, updateEmployee } from "@/lib/payroll/db";
import {
  employeeFormFrom,
  emptyEmployeeForm,
  toEmployeeLine,
  toEmployeePatch,
  validateEmployeeForm,
  type EmployeeFormValues,
} from "@/lib/payroll/employee-form";
import { periodLongLabel } from "@/lib/payroll/periods";
import { RESERVE_FUND_OPTIONS } from "@/lib/payroll/reserve-fund";
import type { PayrollEmployeeLine, PayrollPeriod } from "@/lib/payroll/types";

/**
 * Creating and EDITING an employee: the same form in two modes.
 *
 * It is one component and not two because a record field that exists in one and is missing in the
 * other is exactly the failure nobody sees — the creation asks for it, the edit does not let it be
 * corrected, and the screen says nothing. What changes between modes is where the values come from,
 * where they are written and two fields the edit does NOT draw.
 *
 * **The edit offers neither base salary nor days.** Both are edited inline on the month's screen,
 * where the net pay can be watched moving as they are corrected, and a second door to the same fields
 * would be one more place to say something different. In the CREATION they are asked for: there is no
 * previous record to start from.
 *
 * **An edit reaches only the open período.** Each período stores its own copy of the nómina, just as
 * the accountant has a `GENERAL` sheet per month, so correcting March does not rewrite February — and
 * the correction travels forward on its own when the nómina is copied to April. The subtitle SAYS so,
 * because it is the only thing on this screen anyone could assume the other way round.
 *
 * Same shell as `RolUploadModal` and `DeletePeriodDialog` —a `fixed inset-0` layer over `bg-ink/40`,
 * a `surface` card— because it is this module's dialog convention.
 *
 * All the logic that can be WRONG lives in `lib/payroll/employee-form.ts` (what is required, what
 * shape a cédula has, what range the days admit, how the form is poured into a record) and is tested
 * there. What is left here is only what belongs to the screen: drawing the controls and deciding WHEN
 * errors are shown.
 *
 * Errors do not appear while someone types —that would be scolding over a field not yet filled— but
 * from the first attempt to save; from then on they do refresh on their own, so correcting one
 * switches it off without having to retry.
 *
 * **Three fields the design did not carry and that have to be captured anyway**, because without them
 * the creation is lame and nothing gives it away: the CONTRACT TYPE (it halves the décimo cuarto,
 * §4), the HIRE DATE (the employee record shows it) and the RESERVE FUND mode as a three-option
 * control instead of the design's single «Acumula» checkbox (the book's two flags cross and give three
 * cases, §7 — see `lib/payroll/reserve-fund.ts`).
 */

/** The book's LITERAL code in front, and what it means behind: the employee record shows a bare
 *  «CT»/«TP» because it is what the rol prints, but picking it for the first time with two letters and
 *  without its consequence is guessing. */
const CONTRACT_OPTIONS = [
  { value: "CT", label: "CT · Tiempo completo" },
  { value: "TP", label: "TP · Tiempo parcial" },
];

interface EmployeeFormModalProps {
  period: PayrollPeriod;
  /** The nómina the período already has: from it come the areas this client actually uses and the
   *  rejection of a duplicate cédula. */
  lines: readonly PayrollEmployeeLine[];
  /** The record being edited. ABSENT is a creation — there is no separate `mode` because the mode IS
   *  having or not having a record to start from, and two fields that could contradict each other
   *  would be one more impossible state to represent. */
  employee?: PayrollEmployeeLine;
  onClose: () => void;
}

export function EmployeeFormModal({ period, lines, employee, onClose }: EmployeeFormModalProps) {
  const editing = employee !== undefined;
  const [values, setValues] = useState<EmployeeFormValues>(() =>
    employee ? employeeFormFrom(employee) : emptyEmployeeForm(),
  );
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const areas = useMemo(() => areaOptions(lines), [lines]);
  const errors = useMemo(
    () => validateEmployeeForm(values, { existing: lines, selfId: employee?.id }),
    [values, lines, employee?.id],
  );
  const shown = submitted ? errors : {};

  const set = useCallback(
    <K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) => {
      setValues((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const save = useCallback(async () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setSaving(true);
    setFailure(null);
    try {
      if (employee) {
        await updateEmployee(employee.id, toEmployeePatch(values, employee));
      } else {
        await addEmployee(period.id, toEmployeeLine(values));
      }
      onClose();
    } catch {
      // The table is refreshed by `useLiveQuery`, so if the write fails nobody would notice: the
      // modal would close and the change would not be there. Better to stay open and say so.
      setFailure(
        employee
          ? "No se pudo guardar la ficha. Inténtalo otra vez."
          : "No se pudo guardar el empleado. Inténtalo otra vez.",
      );
    } finally {
      setSaving(false);
    }
  }, [errors, period.id, values, employee, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-6">
      <div className="flex max-h-full w-full max-w-[620px] flex-col overflow-hidden rounded-[13px] border border-border bg-surface shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">
              {editing ? "Editar ficha" : "Registrar empleado"}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-faint">
              {editing
                ? `Cambia solo el período ${periodLongLabel(period.year, period.monthIndex)} y se recalcula el rol.`
                : `Se agrega al período ${periodLongLabel(period.year, period.monthIndex)} y se recalcula el rol.`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="mt-0.5 shrink-0 text-faint transition-colors hover:text-muted"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            <TextField
              label="Nombre completo"
              fieldClassName="col-span-2"
              placeholder="APELLIDOS Y NOMBRES"
              value={values.name}
              error={shown.name}
              onChange={(event) => set("name", event.target.value)}
            />

            <TextField
              label="Cédula"
              variant="mono"
              inputMode="numeric"
              placeholder="0102030405"
              value={values.idCard}
              error={shown.idCard}
              onChange={(event) => set("idCard", event.target.value)}
            />
            <TextField
              label="Cargo"
              placeholder="Recepcionista"
              value={values.role}
              error={shown.role}
              onChange={(event) => set("role", event.target.value)}
            />

            <Select
              label="Área"
              value={values.area}
              onChange={(event) => set("area", event.target.value)}
              options={areas.map((area) => ({ value: area, label: area }))}
            />
            {/* The two fields of the MONTH. The edit does not draw them: they are corrected inline on
                the employee's screen, where the net pay can be watched moving. Their values stay in
                the form —seeded from the record— so a single validation serves both modes, and
                `toEmployeePatch` is what decides not to write them. */}
            {!editing && (
              <>
                <FormField label="Sueldo base" error={shown.baseSalary}>
                  <FieldBox invalid={Boolean(shown.baseSalary)}>
                    <NumericInput
                      ariaLabel="Sueldo base"
                      value={values.baseSalary}
                      nullable
                      align="left"
                      onCommit={(value) => set("baseSalary", value)}
                    />
                  </FieldBox>
                </FormField>

                <FormField label="Días trabajados" error={shown.days}>
                  <FieldBox invalid={Boolean(shown.days)}>
                    <NumericInput
                      ariaLabel="Días trabajados"
                      format="plain"
                      value={values.days}
                      nullable
                      align="left"
                      onCommit={(value) => set("days", value)}
                    />
                  </FieldBox>
                </FormField>
              </>
            )}
            <Select
              label="Fondo de reserva"
              value={values.reserveFund}
              onChange={(event) =>
                set("reserveFund", event.target.value as EmployeeFormValues["reserveFund"])
              }
              options={RESERVE_FUND_OPTIONS.map((option) => ({ ...option }))}
            />

            <FormField
              label="Tipo de contrato"
              hint="A tiempo parcial el décimo cuarto se paga a la mitad."
            >
              <Select
                aria-label="Tipo de contrato"
                value={values.contractType}
                onChange={(event) =>
                  set("contractType", event.target.value as EmployeeFormValues["contractType"])
                }
                options={CONTRACT_OPTIONS}
              />
            </FormField>
            <TextField
              label="Fecha de ingreso"
              type="date"
              value={values.hireDate}
              error={shown.hireDate}
              onChange={(event) => set("hireDate", event.target.value)}
            />

            <TextField
              label="Código sectorial"
              fieldClassName="col-span-2"
              variant="mono"
              placeholder="Opcional"
              value={values.sectorCode}
              onChange={(event) => set("sectorCode", event.target.value)}
            />
          </div>

          {editing && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
              El sueldo base y los días trabajados se corrigen en la pantalla del empleado, junto al
              líquido que mueven.
            </p>
          )}

          {/* The DÉCIMOS belong to the record and not to the month: taking them monthly or accruing
              them is a choice of the employee, the same class of decision as the reserve fund above.
              That is why they are here and not on the month's screen, and why the nómina copy carries
              them into April without anyone marking them again. */}
          <div className="mt-4 overflow-hidden rounded-[9px] border border-border">
            <div className="flex items-baseline gap-2 border-b border-border bg-surface-muted px-3.5 py-2.5">
              <span className="text-[12px] font-semibold text-ink">Décimos</span>
              <span className="text-[11.5px] text-faint">provisión</span>
            </div>

            <div className="flex flex-col gap-2.5 px-3.5 py-3.5">
              <ProvisionToggle
                label="Provisiona décimo tercero"
                checked={values.provisionsThirteenth}
                onChange={(checked) => set("provisionsThirteenth", checked)}
              />
              <ProvisionToggle
                label="Provisiona décimo cuarto"
                checked={values.provisionsFourteenth}
                onChange={(checked) => set("provisionsFourteenth", checked)}
              />
              <p className="text-[11px] leading-relaxed text-faint">
                Apagadas por defecto: los décimos ya se mensualizan en el rol, y provisionarlos otra
                vez los contaría dos veces. Encendidas suman al costo total empresa sin tocar el
                líquido del empleado.
              </p>
            </div>
          </div>

          {failure && <p className="mt-3 text-[11.5px] text-negative">{failure}</p>}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
          <p className="text-[11.5px] leading-relaxed text-faint">
            {editing
              ? "Los meses anteriores no cambian: cada período guarda su propia nómina."
              : "Los valores calculados (unificado, décimos, IESS) se generan solos. Las horas extras y los descuentos se capturan en la ficha del empleado."}
          </p>
          <div className="flex shrink-0 items-center gap-2.5">
            <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              {saving ? "Guardando…" : editing ? "Guardar ficha" : "Guardar empleado"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A provision flag: the checkbox and its label, in a row that can be clicked whole. */
function ProvisionToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <Checkbox checked={checked} onChange={onChange} size={16} ariaLabel={label} />
      <span className="text-[12.5px] text-ink">{label}</span>
    </label>
  );
}
