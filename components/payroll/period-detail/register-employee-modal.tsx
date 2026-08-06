"use client";

import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldBox, FormField, TextField } from "@/components/ui/form-field";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select } from "@/components/ui/select";
import { areaOptions } from "@/lib/payroll/areas";
import { addEmployee } from "@/lib/payroll/db";
import {
  emptyEmployeeForm,
  toEmployeeLine,
  validateEmployeeForm,
  type EmployeeFormValues,
} from "@/lib/payroll/employee-form";
import { periodLongLabel } from "@/lib/payroll/periods";
import { RESERVE_FUND_OPTIONS } from "@/lib/payroll/reserve-fund";
import type { PayrollEmployeeLine, PayrollPeriod } from "@/lib/payroll/types";

/**
 * El alta de un empleado en un período.
 *
 * Mismo armazón que `RolUploadModal` y `DeletePeriodDialog` —capa `fixed inset-0` sobre `bg-ink/40`,
 * tarjeta de `surface`— porque es la convención de diálogo de este módulo.
 *
 * Toda la lógica que puede estar MAL vive en `lib/payroll/employee-form.ts` (qué es obligatorio,
 * qué forma tiene una cédula, qué rango admiten los días, cómo se vuelca el formulario en una
 * ficha) y está testeada allí. Aquí solo queda lo que es de la pantalla: pintar los controles y
 * decidir CUÁNDO se enseñan los errores.
 *
 * Los errores no aparecen mientras alguien teclea —eso sería regañar por un campo que todavía no
 * se ha llenado— sino desde el primer intento de guardar; a partir de ahí sí se refrescan solos,
 * para que corregir uno lo apague sin tener que reintentar.
 *
 * **Tres campos que el diseño no traía y que hay que capturar igual**, porque sin ellos el alta
 * queda coja y nada lo delata: el TIPO DE CONTRATO (parte a la mitad el décimo cuarto, §4), la
 * FECHA DE INGRESO (la ficha del empleado la enseña) y el modo del FONDO DE RESERVA como un
 * control de tres opciones en vez de la única casilla «Acumula» del diseño (las dos banderas del
 * libro se cruzan y dan tres casos, §7 — ver `lib/payroll/reserve-fund.ts`).
 */

/** El código LITERAL del libro delante, y qué significa detrás: la ficha del empleado enseña
 *  «CT»/«TP» a secas porque es lo que el rol imprime, pero elegirlo por primera vez con dos letras
 *  y sin su consecuencia es adivinar. */
const CONTRACT_OPTIONS = [
  { value: "CT", label: "CT · Tiempo completo" },
  { value: "TP", label: "TP · Tiempo parcial" },
];

interface RegisterEmployeeModalProps {
  period: PayrollPeriod;
  /** La nómina que el período ya tiene: de ahí salen las áreas que este cliente usa de verdad y el
   *  rechazo de una cédula repetida. */
  lines: readonly PayrollEmployeeLine[];
  onClose: () => void;
}

export function RegisterEmployeeModal({ period, lines, onClose }: RegisterEmployeeModalProps) {
  const [values, setValues] = useState<EmployeeFormValues>(emptyEmployeeForm);
  const [submitted, setSubmitted] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const areas = useMemo(() => areaOptions(lines), [lines]);
  const errors = useMemo(() => validateEmployeeForm(values, { existing: lines }), [values, lines]);
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
      await addEmployee(period.id, toEmployeeLine(values));
      onClose();
    } catch {
      // La tabla la refresca `useLiveQuery`, así que si la escritura falla nadie lo notaría: el
      // modal se cerraría y el empleado no estaría. Mejor quedarse abierto y decirlo.
      setFailure("No se pudo guardar el empleado. Inténtalo otra vez.");
    } finally {
      setSaving(false);
    }
  }, [errors, period.id, values, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-6">
      <div className="flex max-h-full w-full max-w-[620px] flex-col overflow-hidden rounded-[13px] border border-border bg-surface shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">Registrar empleado</h2>
            <p className="mt-0.5 text-[12.5px] text-faint">
              Se agrega al período {periodLongLabel(period.year, period.monthIndex)} y se recalcula
              el rol.
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

          <div className="mt-4 overflow-hidden rounded-[9px] border border-border">
            <button
              type="button"
              aria-expanded={showCapture}
              onClick={() => setShowCapture((open) => !open)}
              className="flex w-full items-center gap-2 bg-surface-muted px-3.5 py-2.5 text-left transition-colors hover:bg-surface-header"
            >
              {showCapture ? (
                <ChevronDown size={14} className="text-faint" />
              ) : (
                <ChevronRight size={14} className="text-faint" />
              )}
              <span className="text-[12px] font-semibold text-ink">Captura del mes</span>
              <span className="text-[11.5px] text-faint">opcional</span>
            </button>

            {showCapture && (
              <div className="border-t border-border px-3.5 py-3.5">
                <div className="grid grid-cols-3 gap-x-4 gap-y-3.5">
                  <FormField label="Horas extras 50 %" error={shown.overtimeHours50}>
                    <FieldBox invalid={Boolean(shown.overtimeHours50)}>
                      <NumericInput
                        ariaLabel="Horas extras al 50 %"
                        format="plain"
                        value={values.overtimeHours50}
                        nullable
                        align="left"
                        placeholder="0"
                        onCommit={(value) => set("overtimeHours50", value)}
                      />
                    </FieldBox>
                  </FormField>
                  <FormField label="Horas extras 100 %" error={shown.overtimeHours100}>
                    <FieldBox invalid={Boolean(shown.overtimeHours100)}>
                      <NumericInput
                        ariaLabel="Horas extras al 100 %"
                        format="plain"
                        value={values.overtimeHours100}
                        nullable
                        align="left"
                        placeholder="0"
                        onCommit={(value) => set("overtimeHours100", value)}
                      />
                    </FieldBox>
                  </FormField>
                  <FormField label="Horas extras 25 %" error={shown.overtimeHours25}>
                    <FieldBox invalid={Boolean(shown.overtimeHours25)}>
                      <NumericInput
                        ariaLabel="Horas extras al 25 %"
                        format="plain"
                        value={values.overtimeHours25}
                        nullable
                        align="left"
                        placeholder="0"
                        onCommit={(value) => set("overtimeHours25", value)}
                      />
                    </FieldBox>
                  </FormField>
                </div>

                {/* El `*0` del libro, tecleable. Sin este control las horas extras capturadas
                    SIEMPRE suman, y el rol deja de cuadrar con el del contador — que en marzo 2026
                    apagó las de los cuatro empleados que tenían. */}
                <FormField
                  label="Importe aprobado de horas extras"
                  error={shown.approvedOvertime}
                  hint="En blanco se reconocen todas las trabajadas; 0 no reconoce ninguna. Lo aprueba Gerencia cada mes."
                  className="mt-3.5 block max-w-[280px]"
                >
                  <FieldBox invalid={Boolean(shown.approvedOvertime)}>
                    <NumericInput
                      ariaLabel="Importe aprobado de horas extras"
                      value={values.approvedOvertime}
                      nullable
                      align="left"
                      placeholder="Todas"
                      onCommit={(value) => set("approvedOvertime", value)}
                    />
                  </FieldBox>
                </FormField>

                <div className="mt-4 flex flex-col gap-2.5">
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
                    Apagadas por defecto: los décimos ya se mensualizan en el rol, y provisionarlos
                    otra vez los contaría dos veces.
                  </p>
                </div>
              </div>
            )}
          </div>

          {failure && <p className="mt-3 text-[11.5px] text-negative">{failure}</p>}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
          <p className="text-[11.5px] leading-relaxed text-faint">
            Los valores calculados (unificado, décimos, IESS) se generan solos.
          </p>
          <div className="flex shrink-0 items-center gap-2.5">
            <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              {saving ? "Guardando…" : "Guardar empleado"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Una bandera de provisión: la casilla y su rótulo, en una fila que se puede pulsar entera. */
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
