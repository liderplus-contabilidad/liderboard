"use client";

import { Plus } from "lucide-react";
import { memo, useCallback, useMemo, type ReactNode } from "react";
import { DataGrid, GridRow } from "@/components/data-table/data-grid";
import { Cell, HeadCell } from "@/components/data-table/grid-cells";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { formatCurrency, formatCurrencyOrDash } from "@/lib/format";
import {
  DEDUCTION_CONCEPTS,
  INCOME_CONCEPTS,
  addableDeductionConcepts,
  addableIncomeConcepts,
  capturedHoursField,
  swapOptionsFor,
  visibleDeductionConcepts,
  visibleIncomeConcepts,
  deductionAmount,
  incomeAmount,
  type DeductionConcept,
  type IncomeConcept,
  type OvertimeHoursField,
} from "@/lib/payroll/concepts";
import type { PayrollEmployeeComputation } from "@/lib/payroll/engine/types";
import type { PayrollMonthlyCapture } from "@/lib/payroll/types";

/**
 * Los dos botones de «Agregar …» se rinden APAGADOS con su motivo, en vez de omitirse: el catálogo
 * de `lib/payroll/concepts.ts` es cerrado y la tabla ya lo recorre entero, así que hoy no hay nada
 * que agregar — pero el del libro no lo está del todo. Las cuatro columnas de egreso `AJ`–`AM` que
 * el rol suma y nadie rotuló (§11.4) son exactamente lo que este botón encendería el día que
 * tengan nombre, así que el control no es decorado: es una función pendiente, la misma lectura que
 * los dos botones apagados de la cabecera.
 */
/** Un conjunto vacío estable: recrearlo en cada render rompería los `useMemo` de abajo. */
const EMPTY_ADDED: ReadonlySet<string> = new Set();

interface ConceptTableBaseProps {
  computed: PayrollEmployeeComputation;
  capture: PayrollMonthlyCapture;
  /**
   * El total del pie. Llega del MOTOR (`grossIncome` / `totalDeductions`) y nunca se suma aquí, y
   * eso no es purismo: en ingresos la suma de las filas y el total son distintos A PROPÓSITO —
   * `I-02`…`I-04` enseñan el valor entero de las horas trabajadas mientras el total solo contiene
   * lo que Gerencia aprobó (`overtimeTotal`). Sumar la columna daría una cifra que no está en
   * ningún sitio del rol.
   */
  total: number;
  /**
   * Los códigos que el usuario añadió con «Agregar …». Un capturado en cero solo se ve si está
   * aquí — sin esta memoria, la fila que se acaba de crear desaparecería antes de teclearla.
   */
  added?: ReadonlySet<string>;
  /** Añade un concepto capturado que todavía no se ve. */
  onAdd: (code: string) => void;
  /** Cambia una fila capturada por otro concepto, llevándose su importe. */
  onSwap: (from: string, to: string) => void;
  /** Apaga los capturados: período cerrado, o mientras se guarda. */
  readOnly?: boolean;
}

export type ConceptTableProps =
  | (ConceptTableBaseProps & {
      kind: "ingresos";
      /** Solo se llama con conceptos `capturado` — los `calculado` no se editan. */
      onAmountChange: (concept: IncomeConcept, value: number) => void;
      /** La CANTIDAD de horas de las tres clases de extra, que sí se teclea aunque su valor sea
       *  derivado. */
      onHoursChange: (field: OvertimeHoursField, value: number) => void;
    })
  | (ConceptTableBaseProps & {
      kind: "egresos";
      onAmountChange: (concept: DeductionConcept, value: number) => void;
    });

/**
 * La tabla de conceptos del rol — la MISMA para ingresos y egresos, porque el comprobante del
 * contador las imprime iguales salvo por la columna de CANTIDAD, que solo los ingresos tienen.
 *
 * Ningún rótulo se escribe aquí: recorre `INCOME_CONCEPTS`/`DEDUCTION_CONCEPTS` de
 * `@/lib/payroll/concepts`, que es donde el catálogo está declarado UNA vez junto a su columna del
 * libro. Un rótulo tecleado en esta pantalla podría discrepar del que usa el parser y ningún test
 * de cifras lo notaría, porque las cifras seguirían sumando igual. Por lo mismo el orden es el del
 * catálogo, que es el del libro y el del comprobante impreso: la fila 3 de la pantalla es la fila 3
 * del rol.
 *
 * Un concepto `calculado` va en gris y no se edita; uno `capturado` es un campo. Es la misma
 * gramática de la rejilla de período, un poco más arriba.
 */
export function ConceptTable(props: ConceptTableProps) {
  // Se reparte en dos cuerpos en vez de estrechar dentro de un `useCallback`: los despachadores de
  // fila tienen que ser ESTABLES para que las filas memoizadas sirvan de algo, y una unión
  // estrechada dentro del callback obliga a un cast o a una dependencia que cambia cada render.
  return props.kind === "ingresos" ? <IncomeTable {...props} /> : <DeductionTable {...props} />;
}

function IncomeTable({
  computed,
  capture,
  total,
  added = EMPTY_ADDED,
  readOnly = false,
  onAmountChange,
  onHoursChange,
  onAdd,
  onSwap,
}: Extract<ConceptTableProps, { kind: "ingresos" }>) {
  const concepts = useMemo(() => visibleIncomeConcepts(capture, added), [capture, added]);

  const handleAmount = useCallback(
    (index: number, value: number) => onAmountChange(concepts[index], value),
    [concepts, onAmountChange],
  );

  const handleHours = useCallback(
    (index: number, value: number) => {
      const field = capturedHoursField(concepts[index]);
      if (field) {
        onHoursChange(field, value);
      }
    },
    [concepts, onHoursChange],
  );

  return (
    <ConceptSection
      title="Ingresos"
      totalLabel="Total ingresos"
      total={total}
      showQuantity
      addLabel="Agregar ingreso"
      addableCode={addableIncomeConcepts(capture, added)[0]?.code ?? null}
      onAdd={onAdd}
      footnote={<OvertimeFootnote computed={computed} capture={capture} />}
    >
      {concepts.map((concept, index) => {
        const hoursField = capturedHoursField(concept);

        return (
          <ConceptRow
            key={concept.code}
            index={index}
            code={concept.code}
            tone="ingreso"
            label={concept.label}
            options={
              // Las horas extras llevan desplegable IGUAL que un capturado: son elegibles (su
              // cantidad se teclea), y sin él una fila añadida desde «Agregar ingreso» quedaría
              // clavada en el concepto con el que nació.
              concept.kind === "capturado" || hoursField
                ? swapOptionsFor(concept.code, INCOME_CONCEPTS, capture, added)
                : undefined
            }
            onSwap={onSwap}
            amount={incomeAmount(concept, computed, capture)}
            amountEditable={concept.kind === "capturado"}
            hours={hoursField ? capture[hoursField] : null}
            showQuantity
            disabled={readOnly}
            onAmount={handleAmount}
            onHours={handleHours}
          />
        );
      })}
    </ConceptSection>
  );
}

function DeductionTable({
  computed,
  capture,
  total,
  added = EMPTY_ADDED,
  readOnly = false,
  onAmountChange,
  onAdd,
  onSwap,
}: Extract<ConceptTableProps, { kind: "egresos" }>) {
  const concepts = useMemo(() => visibleDeductionConcepts(capture, added), [capture, added]);

  const handleAmount = useCallback(
    (index: number, value: number) => onAmountChange(concepts[index], value),
    [concepts, onAmountChange],
  );

  return (
    <ConceptSection
      title="Egresos"
      totalLabel="Total egresos"
      total={total}
      showQuantity
      addLabel="Agregar deducción"
      addableCode={addableDeductionConcepts(capture, added)[0]?.code ?? null}
      onAdd={onAdd}
    >
      {concepts.map((concept, index) => (
        <ConceptRow
          key={concept.code}
          index={index}
          code={concept.code}
          tone="egreso"
          label={concept.label}
          options={
            concept.kind === "capturado"
              ? swapOptionsFor(concept.code, DEDUCTION_CONCEPTS, capture, added)
              : undefined
          }
          onSwap={onSwap}
          amount={deductionAmount(concept, computed, capture)}
          amountEditable={concept.kind === "capturado"}
          hours={null}
          showQuantity
          disabled={readOnly}
          onAmount={handleAmount}
          onHours={noop}
        />
      ))}
    </ConceptSection>
  );
}

/** Estable por definición: la tabla de egresos no tiene columna de cantidad que despachar. */
function noop(): void {}

/** Los anchos exactos del diseño. La tabla va `table-fixed` con un `<colgroup>` para que los
 *  declare UNA vez y no dependan de lo que mida el texto de cada fila: la columna de CANTIDAD y la
 *  de VALOR tienen que caer a plomo entre las dos tablas, que se leen una al lado de la otra. */
const CODE_WIDTH = 96;
const QUANTITY_WIDTH = 116;
const VALUE_WIDTH = 150;
/** La quinta columna, vacía: el hueco donde vive la acción de fila. Reservarlo desde ahora es lo
 *  que evita que las columnas se corran el día que aparezca. */
const ACTION_WIDTH = 40;
const CONCEPT_MIN_WIDTH = 240;

function ConceptSection({
  title,
  totalLabel,
  total,
  showQuantity,
  addLabel,
  addableCode,
  onAdd,
  footnote,
  children,
}: {
  title: string;
  totalLabel: string;
  total: number;
  showQuantity: boolean;
  addLabel: string;
  /** El primer concepto libre, o `null` cuando ya están todos puestos. */
  addableCode: string | null;
  onAdd: (code: string) => void;
  footnote?: ReactNode;
  children: ReactNode;
}) {
  const minWidth =
    CODE_WIDTH +
    CONCEPT_MIN_WIDTH +
    VALUE_WIDTH +
    ACTION_WIDTH +
    (showQuantity ? QUANTITY_WIDTH : 0);

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {/* La leyenda del gris. Va sobre cada tabla y no una vez por pantalla porque cada tabla se
            lee sola: quien mira solo los egresos también necesita saber por qué el aporte al IESS
            no se deja teclear. */}
        <p className="text-[11.5px] text-faint">Los valores en gris se calculan solos</p>
      </div>

      <DataGrid className="table-fixed" minWidth={minWidth}>
        <colgroup>
          <col style={{ width: CODE_WIDTH }} />
          <col />
          {showQuantity && <col style={{ width: QUANTITY_WIDTH }} />}
          <col style={{ width: VALUE_WIDTH }} />
          <col style={{ width: ACTION_WIDTH }} />
        </colgroup>
        <thead>
          <tr>
            <HeadCell>
              <ColumnLabel>Código</ColumnLabel>
            </HeadCell>
            <HeadCell>
              <ColumnLabel>Concepto</ColumnLabel>
            </HeadCell>
            {showQuantity && (
              <HeadCell align="right">
                <ColumnLabel>Cantidad</ColumnLabel>
              </HeadCell>
            )}
            <HeadCell align="right">
              <ColumnLabel>Valor</ColumnLabel>
            </HeadCell>
            <HeadCell />
          </tr>
        </thead>
        <tbody>{children}</tbody>
        <tfoot>
          {/* El mismo fondo que la cabecera y DENTRO del borde de la tabla: el total cierra la
              rejilla, no es una línea aparte que casualmente esté debajo. */}
          <GridRow className="bg-surface-header">
            <Cell />
            <Cell>
              <span className="font-semibold uppercase tracking-[0.3px] text-ink">
                {totalLabel}
              </span>
            </Cell>
            {showQuantity && <Cell />}
            <Cell numeric>
              <span className="font-mono font-semibold text-ink">
                {formatCurrency(total, { cents: true })}
              </span>
            </Cell>
            <Cell />
          </GridRow>
        </tfoot>
      </DataGrid>

      {footnote}
      <AddConceptButton label={addLabel} code={addableCode} onAdd={onAdd} />
    </section>
  );
}

interface ConceptRowProps {
  /** El sitio del concepto en su catálogo. Viaja en vez de una función por fila para que el
   *  despachador del padre pueda ser estable y `memo` sirva de algo. */
  index: number;
  code: string;
  tone: "ingreso" | "egreso";
  label: string;
  amount: number;
  /** El importe se teclea (concepto capturado) en vez de derivarse. */
  amountEditable: boolean;
  /** `null` = este concepto no se mide en horas. */
  hours: number | null;
  showQuantity: boolean;
  disabled: boolean;
  /** Lo que ofrece el desplegable de esta fila; ausente en los calculados, que no se eligen. */
  options?: readonly { code: string; label: string }[];
  onAmount: (index: number, value: number) => void;
  onHours: (index: number, value: number) => void;
  onSwap?: (from: string, to: string) => void;
}

/** El rótulo de una columna: micro-mayúsculas, la convención de cabecera de toda la app. */
function ColumnLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-[0.6px] text-faint">{children}</span>
  );
}

function ConceptRowComponent({
  index,
  code,
  tone,
  label,
  amount,
  amountEditable,
  hours,
  showQuantity,
  disabled,
  options,
  onAmount,
  onHours,
  onSwap,
}: ConceptRowProps) {
  return (
    <GridRow>
      <Cell>
        <ConceptCode code={code} tone={tone} />
      </Cell>
      <Cell>
        {/* Un concepto CAPTURADO se elige, no se impone: la fila que crea «Agregar …» nace con el
            primero libre y aquí se cambia por el que toque. Un calculado va en texto plano porque
            no hay nada que elegir — la app lo deriva. */}
        {options && options.length > 1 ? (
          <Select
            size="sm"
            aria-label={`Concepto de la fila ${code}`}
            value={code}
            disabled={disabled}
            options={options.map((option) => ({ value: option.code, label: option.label }))}
            onChange={(event) => onSwap?.(code, event.target.value)}
          />
        ) : (
          <span className="text-ink">{label}</span>
        )}
      </Cell>

      {showQuantity &&
        (hours !== null ? (
          // HORAS, no dinero. La unidad se rotula junto al campo porque esta columna lleva las
          // dos cosas —horas en las extras, importe en los capturados— y sin decirlo se teclean
          // horas donde se creía escribir dólares: 4.654.651 «horas» pasan por un importe
          // plausible y salen convertidas en catorce millones sin que nada chirríe.
          <NumberFieldCell
            value={hours === 0 ? null : hours}
            disabled={disabled}
            ariaLabel={`Horas de ${label}`}
            format="plain"
            unit="h"
            onCommit={(value) => onHours(index, value)}
          />
        ) : amountEditable ? (
          // Lo que se teclea de un capturado ES su importe, y va aquí y no en VALOR: toda la
          // tabla se lee igual, izquierda lo que escribes y derecha lo que vale.
          <NumberFieldCell
            value={amount === 0 ? null : amount}
            disabled={disabled}
            ariaLabel={`Importe de ${label}`}
            format="plain"
            unit="$"
            onCommit={(value) => onAmount(index, value)}
          />
        ) : (
          <Cell numeric>
            <span className="text-faintest">–</span>
          </Cell>
        ))}

      {/* VALOR es SIEMPRE la columna gris: lo que el concepto vale, con símbolo, se teclee o se
          derive. Que el gris signifique «esto no se edita aquí» sin excepciones es lo que hace
          que la leyenda de la cabecera sea cierta. */}
      <Cell numeric className="bg-surface-calc">
        <span className="font-mono text-muted">{formatCurrencyOrDash(amount)}</span>
      </Cell>

      <Cell />
    </GridRow>
  );
}

/** Las dos tablas juntas son 26 filas que se repintan con cada tecla, porque el motor deriva sus
 *  veinte columnas de nuevo; memoizada con `code` de key, igual que `EmployeeRow`. */
const ConceptRow = memo(ConceptRowComponent);

/**
 * El código en una píldora teñida por su clase — verde el ingreso, ámbar el egreso —, que es lo que
 * deja reconocer de un vistazo en qué tabla se está mirando cuando las dos se leen en paralelo.
 *
 * No es un `Badge`: aquel es `rounded-full` y en versalitas, la forma de un ESTADO. Esto es un
 * código de cuenta, y en esta app un código va en mono y en una caja de esquina viva.
 */
function ConceptCode({ code, tone }: { code: string; tone: "ingreso" | "egreso" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-[6px] px-1.5 py-0.5 font-mono text-[11px] font-semibold",
        tone === "ingreso" ? "bg-positive/10 text-positive" : "bg-warning/10 text-warning",
      )}
    >
      {code}
    </span>
  );
}

/**
 * Un `<td>` cuya área entera es el campo. El `<td>` se escribe a mano en vez de pasarle `p-0` a
 * `Cell`: aquel ya trae `px-3.5 py-2`, y quién gana entre `p-0` y `px-3.5` depende del orden en que
 * Tailwind emite las reglas, no del orden del string.
 */
function NumberFieldCell({
  value,
  disabled,
  ariaLabel,
  format,
  unit,
  onCommit,
}: {
  /** `null` se siembra VACÍO: es lo que distingue «no se trabajaron horas extras» de un cero
   *  tecleado a mano. Lo que vuelve por `onCommit` sí es siempre un número. */
  value: number | null;
  disabled: boolean;
  ariaLabel: string;
  format: "amount" | "plain";
  /** Qué se escribe en esta casilla: «h» de horas, «$» de importe. Va PEGADO al campo y no en la
   *  cabecera porque la columna lleva las dos cosas según la fila. */
  unit?: string;
  onCommit: (value: number) => void;
}) {
  return (
    <td className="border-b border-border-soft px-2 py-1.5">
      {/* La caja SE VE aunque no tenga el foco. Un input sin borde en una tabla llena de cifras
          grises es indistinguible de una celda calculada, y la pantalla deja de decir dónde se
          puede escribir — que es la única pregunta que alguien se hace al abrirla. Por eso el
          recuadro es la afordancia y el foco solo la refuerza. */}
      <span
        className={cn(
          "ml-auto flex max-w-[130px] items-center rounded-[7px] border px-2 py-1.5 transition-colors",
          disabled
            ? "border-border-soft bg-surface-calc"
            : "border-chip-border bg-surface hover:border-muted focus-within:border-brand",
        )}
      >
        <NumericInput
          value={value}
          onCommit={(next) => onCommit(next ?? 0)}
          format={format}
          disabled={disabled}
          ariaLabel={ariaLabel}
          className="text-[12.5px]"
        />
        {unit && <span className="ml-1.5 shrink-0 text-[11px] text-faint">{unit}</span>}
      </span>
    </td>
  );
}

/**
 * El botón de ancho completo y borde discontinuo bajo cada tabla. No usa `Button` a propósito: esa
 * primitiva son tres tallas de control de barra con su propio `border`/`bg`, y forzarle el trazo
 * discontinuo y otro color de borde sería competir con ella por las mismas propiedades, que es lo
 * que resuelve el orden de la hoja de estilos y no el del string.
 */
function AddConceptButton({
  label,
  code,
  onAdd,
}: {
  label: string;
  code: string | null;
  onAdd: (code: string) => void;
}) {
  // Añade el PRIMER concepto libre en vez de abrir un menú, igual que el rol del contador: la
  // fila nace con un desplegable para cambiarla, así que elegir antes de ver la fila sería un
  // paso de más. Sin ninguno libre no se rinde: un botón que no puede hacer nada estorba.
  if (!code) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => onAdd(code)}
      className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-chip-border py-[11px] text-[12.5px] font-semibold text-brand transition-colors hover:border-brand hover:bg-brand-soft"
    >
      <Plus size={15} />
      {label}
    </button>
  );
}

/**
 * Lo que Gerencia aprobó recorta lo que SUMA, no lo que se muestra: `I-02`…`I-04` siguen enseñando
 * el valor entero de las horas trabajadas. Sin esta línea la columna de ingresos no cuadra con su
 * propio total y la tabla parece rota.
 */
function OvertimeFootnote({
  computed,
  capture,
}: {
  computed: PayrollEmployeeComputation;
  capture: PayrollMonthlyCapture;
}) {
  if (capture.approvedOvertime === null) {
    return null;
  }

  const worked = computed.overtimePay50 + computed.overtimePay100 + computed.overtimePay25;
  if (Math.round(worked * 100) === Math.round(computed.overtimeTotal * 100)) {
    return null;
  }

  return (
    <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
      Horas extras reconocidas este mes:{" "}
      <span className="font-mono font-semibold tabular-nums text-ink">
        {formatCurrency(computed.overtimeTotal, { cents: true })}
      </span>{" "}
      de <span className="font-mono tabular-nums">{formatCurrency(worked, { cents: true })}</span>{" "}
      trabajadas. El total de ingresos solo contiene lo aprobado.
    </p>
  );
}
