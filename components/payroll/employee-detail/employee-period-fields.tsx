"use client";

import type { ReactNode } from "react";
import { NumericInput } from "@/components/ui/numeric-input";
import { formatCurrency } from "@/lib/format";
import type { PayrollEmployeeLine } from "@/lib/payroll/types";

interface EmployeePeriodFieldsProps {
  /** Los tres extremos del calendario llegan YA FORMATEADOS. Dar formato a una fecha es una regla
   *  de la app (`@/lib/date.ts`), no de esta pantalla: si la escribiera aquí habría dos
   *  definiciones de «cómo se ve una fecha» y podrían separarse. `hireDate` es `null` cuando la
   *  ficha no la declara. */
  periodStart: string;
  periodEnd: string;
  hireDate: string | null;
  /** `BB` · TC. Se enseña el código LITERAL («CT»/«TP»), no «Tiempo completo»: es lo que el libro
   *  escribe y lo que el contador coteja celda por celda contra su hoja. */
  contractType: PayrollEmployeeLine["contractType"];
  /** `AZ` · AC FR — de la ficha, no del mes: es una elección del empleado. */
  accumulatesReserveFund: boolean;
  /** `AS` y `AT` · lo que el motor derivó para las dos provisiones de décimos, o `null` cuando la
   *  ficha las tiene apagadas. La caja enseña el IMPORTE cuando provisiona y «No» cuando no: son
   *  las dos preguntas que alguien se hace ahí, y el importe implica ya la respuesta a la primera.
   *
   *  Están aquí, en solo lectura, porque estas dos cifras no salen en ninguna otra parte de la
   *  pantalla —`EmployeeTotals` no desglosa ninguna de las cinco provisiones— y las casillas que
   *  las enseñaban se fueron al diálogo de ficha, que es de donde salen. */
  thirteenthProvision: number | null;
  fourteenthProvision: number | null;
  /** `E` · días pagados del mes. */
  days: number;
  /** `D` · sueldo base. */
  baseSalary: number;
  /** `BZ` · PAGADO. `null` mientras el período no lo declare — y eso NO es cero: sin él el empleado
   *  no está ni conciliado ni con diferencia. */
  paid: number | null;
  onDaysChange: (days: number) => void;
  onBaseSalaryChange: (baseSalary: number) => void;
  onPaidChange: (paid: number | null) => void;
  /** Apaga los tres editables: un período cerrado, o mientras se guarda. */
  readOnly?: boolean;
}

/**
 * La rejilla de ocho campos entre las fichas de identidad y las tablas de conceptos: el marco bajo
 * el que se leen todas las cifras de abajo.
 *
 * Cinco son de SOLO LECTURA sobre fondo gris y tres se editan, y esa es la única distinción que la
 * rejilla hace visible — la misma gramática que las tablas de conceptos usan un poco más abajo
 * (gris = lo que no se teclea), así que quien lee la pantalla aprende la regla una vez.
 *
 * Los dos extremos del período no se editan porque los declara el período, no el empleado; el tipo
 * de contrato, la fecha de ingreso, la acumulación de fondo de reserva y las dos provisiones de
 * décimos son de la FICHA y cambian ahí —en «Editar ficha», del encabezado—, no en el mes que se
 * está capturando.
 *
 * El rótulo va a la IZQUIERDA del valor y alineado hacia él, no encima: con los ocho valores en
 * cajas del mismo ancho y a la derecha, la columna de cifras queda a plomo y se compara de un
 * vistazo, que es lo que se hace con estos campos.
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

/** Una provisión encendida se dice con su importe; apagada, con un «No». Un `$0.00` no serviría:
 *  se leería como «provisiona cero» en vez de «no provisiona». */
function provisionLabel(amount: number | null): string {
  return amount === null ? "No" : formatCurrency(amount, { cents: true });
}

/** Las dos clases de campo miden igual: el rótulo se encoge y la caja no, así que las ocho cajas
 *  quedan a plomo aunque los rótulos midan distinto. */
const LABEL_CLASS = "min-w-0 flex-1 truncate text-right text-[12px] text-muted";
const BOX_CLASS =
  "w-[132px] shrink-0 rounded-lg px-2.5 py-2 text-right font-mono text-[12.5px] tabular-nums";

/** Un dato que esta pantalla no decide: caja gris sin control dentro. Nada de un `<input disabled>`
 *  — un campo apagado invita a intentarlo; una caja que no lo es, no. */
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
