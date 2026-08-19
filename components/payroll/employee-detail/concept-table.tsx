"use client";

import { Plus, Trash2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DataGrid, GridRow } from "@/components/data-table/data-grid";
import { Cell, HeadCell } from "@/components/data-table/grid-cells";
import { Dropdown, DropdownPanel, useDropdown } from "@/components/ui/dropdown";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { NumericInput } from "@/components/ui/numeric-input";
import { cn } from "@/lib/cn";
import { formatCurrency, formatCurrencyOrDash } from "@/lib/format";
import {
  EXTRA_CONCEPT_KIND_LABEL,
  EXTRA_CONCEPT_KIND_SHORT,
  MAX_EXTRA_CONCEPT_LABEL_LENGTH,
  describeCapBreach,
  type ExtraCapBreach,
} from "@/lib/payroll/extra-income";
import {
  addableDeductionConcepts,
  addableIncomeConcepts,
  capturedHoursField,
  visibleDeductionConcepts,
  visibleIncomeConcepts,
  deductionAmount,
  incomeAmount,
  type DeductionConcept,
  type IncomeConcept,
  type OvertimeHoursField,
} from "@/lib/payroll/concepts";
import { isRenameable, labelFor } from "@/lib/payroll/row-labels";
import type { PayrollEmployeeComputation } from "@/lib/payroll/engine/types";
import type {
  PayrollExtraConceptKind,
  PayrollExtraRow,
  PayrollMonthlyCapture,
} from "@/lib/payroll/types";

/** Un conjunto vacío estable: recrearlo en cada render rompería los `useMemo` de abajo. */
const EMPTY_ADDED: ReadonlySet<string> = new Set();

/** Lo que la tabla de INGRESOS necesita para dibujar y editar los conceptos del período. Va en un
 *  objeto y no en cinco props sueltas para que la tabla de egresos, que no los tiene, no cargue
 *  con ellas. */
export interface ExtraConceptControls {
  /** Las filas de bono de ESTE empleado, con su rótulo, su clase y su importe dentro. */
  rows: readonly PayrollExtraRow[];
  /** Los topes superados, ya calculados por la capa pura. Vacío es «todo dentro». */
  breaches: readonly ExtraCapBreach[];
  onAdd: (kind: PayrollExtraConceptKind) => void;
  onRename: (rowId: string, label: string) => void;
  onRemove: (rowId: string) => void;
  onAmountChange: (rowId: string, value: number) => void;
  /** El último rechazo de un nombre (repetido, vacío, demasiado largo), para poder decirlo. */
  error: string | null;
}

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
  /** Añade el concepto capturado que se eligió en el menú. */
  onAdd: (code: string) => void;
  /**
   * Le pone a una fila del catálogo el nombre que este empleado quiere. Un nombre VACÍO la
   * devuelve al rótulo del libro.
   */
  onRename: (code: string, label: string) => void;
  /**
   * Quita una fila CAPTURADA del rol de este empleado: vacía lo tecleado y la esconde.
   *
   * No «borra» nada, y por eso no dice borrar: los conceptos del catálogo son del libro del
   * contador y existen siempre — lo que se quita es su fila de ESTE empleado, que es justo lo que
   * «Agregar ingreso» había puesto. Un concepto extra sí se borra de verdad, y por eso su papelera
   * dice otra cosa.
   */
  onRemove: (code: string) => void;
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
      /** Los conceptos que el PERÍODO declara por su cuenta. Ausentes en una tabla de solo
       *  lectura o antes de que el período exista. */
      extra?: ExtraConceptControls;
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
  onRename,
  onRemove,
  extra,
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
      addable={addableIncomeConcepts(capture, added)}
      onAdd={onAdd}
      onAddExtra={extra && !readOnly ? extra.onAdd : undefined}
      footnote={
        <>
          <OvertimeFootnote computed={computed} capture={capture} />
          {extra && <ExtraCapNotice breaches={extra.breaches} error={extra.error} />}
        </>
      }
      appended={
        extra
          ? extra.rows.map((row) => (
              <ExtraConceptRow
                key={row.id}
                row={row}
                disabled={readOnly}
                onRename={extra.onRename}
                onRemove={extra.onRemove}
                onAmount={extra.onAmountChange}
              />
            ))
          : undefined
      }
    >
      {concepts.map((concept, index) => {
        const hoursField = capturedHoursField(concept);

        return (
          <ConceptRow
            key={concept.code}
            index={index}
            code={concept.code}
            tone="ingreso"
            label={labelFor(concept, capture)}
            renameable={isRenameable(concept)}
            onRename={onRename}
            amount={incomeAmount(concept, computed, capture)}
            amountEditable={concept.kind === "capturado"}
            hours={hoursField ? capture[hoursField] : null}
            showQuantity
            disabled={readOnly}
            onAmount={handleAmount}
            onHours={handleHours}
            // Solo lo que se TECLEA se puede quitar: un calculado no tiene fila que vaciar, la
            // app lo deriva y volvería en el siguiente render.
            onRemove={concept.kind === "capturado" || hoursField ? onRemove : undefined}
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
  onRename,
  onRemove,
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
      addable={addableDeductionConcepts(capture, added)}
      onAdd={onAdd}
    >
      {concepts.map((concept, index) => (
        <ConceptRow
          key={concept.code}
          index={index}
          code={concept.code}
          tone="egreso"
          label={labelFor(concept, capture)}
          renameable={isRenameable(concept)}
          onRename={onRename}
          amount={deductionAmount(concept, computed, capture)}
          amountEditable={concept.kind === "capturado"}
          hours={null}
          showQuantity
          disabled={readOnly}
          onAmount={handleAmount}
          onHours={noop}
          onRemove={concept.kind === "capturado" ? onRemove : undefined}
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
  addable,
  onAdd,
  onAddExtra,
  footnote,
  appended,
  children,
}: {
  title: string;
  totalLabel: string;
  total: number;
  showQuantity: boolean;
  addLabel: string;
  /** Los conceptos del catálogo que este empleado todavía no usa. Vacío = están todos puestos. */
  addable: readonly { code: string; label: string }[];
  onAdd: (code: string) => void;
  /** Declara una fila de BONO. Ausente donde no las hay (egresos, solo lectura). */
  onAddExtra?: (kind: PayrollExtraConceptKind) => void;
  footnote?: ReactNode;
  /** Filas que van DESPUÉS del catálogo: las de bono que este empleado declara. */
  appended?: ReactNode;
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
        <tbody>
          {children}
          {appended}
        </tbody>
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
      <AddConceptButton label={addLabel} addable={addable} onAdd={onAdd} onAddExtra={onAddExtra} />
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
  /** Si esta fila admite nombre propio: solo las que teclean su importe. */
  renameable: boolean;
  onAmount: (index: number, value: number) => void;
  onHours: (index: number, value: number) => void;
  onRename: (code: string, label: string) => void;
  /** Ausente en los calculados: no hay fila que quitar cuando la app la deriva. */
  onRemove?: (code: string) => void;
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
  renameable,
  onAmount,
  onHours,
  onRename,
  onRemove,
}: ConceptRowProps) {
  return (
    // `group` es lo que deja que la papelera de la quinta columna aparezca al pasar por la FILA y
    // no solo por su propia celda, que es un blanco de 40 px.
    <GridRow className="group">
      <Cell>
        <ConceptCode code={code} tone={tone} />
      </Cell>
      <Cell>
        {/* El concepto se eligió al AGREGAR la fila, así que aquí no queda nada que elegir y la
            celda es el nombre. Un calculado va en texto plano: su rótulo es del libro —o una tasa
            de ley— y no lo escribe nadie. */}
        {renameable ? (
          <RowNameField
            value={label}
            disabled={disabled}
            ariaLabel={`Nombre de la fila ${code}`}
            onCommit={(next) => onRename(code, next)}
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

      <Cell>
        {onRemove && !disabled && (
          <RowAction
            label={`Quitar ${label} del rol`}
            title="Quitar del rol de este empleado"
            onClick={() => onRemove(code)}
          />
        )}
      </Cell>
    </GridRow>
  );
}

/**
 * La papelera de una fila. Aparece al pasar por encima y no siempre: veintiséis papeleras
 * encendidas a la vez compiten con las cifras, que es lo que la tabla existe para enseñar.
 */
function RowAction({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      className="rounded-md p-1 text-faint opacity-0 transition-[color,background-color,opacity] hover:bg-negative/10 hover:text-negative focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Trash2 size={14} />
    </button>
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
const DASHED_ADD_BUTTON =
  "mt-2.5 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-chip-border py-[11px] text-[12.5px] font-semibold text-brand transition-colors hover:border-brand hover:bg-brand-soft";

/** El mismo botón, cuando además abre un menú: solo cambia quién le da el `ref` y el click. */
function AddConceptTrigger({ label }: { label: string }) {
  const { open, setOpen, triggerRef } = useDropdown();
  return (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn(DASHED_ADD_BUTTON, open && "border-brand bg-brand-soft")}
    >
      <Plus size={15} />
      {label}
    </button>
  );
}

/**
 * SIEMPRE un menú, en las dos tablas.
 *
 * Antes metía el primer concepto libre sin preguntar y la fila nacía con un desplegable para
 * corregirlo. Eligiendo aquí, ese desplegable se queda sin trabajo y la celda del rótulo queda
 * libre para escribir el nombre — que es lo que hace que TODAS las filas se lean igual, incluida
 * la de bono, que era la única con esa forma.
 *
 * Que las dos tablas usen el mismo gesto no es simetría por gusto: se leen una al lado de la otra,
 * y que una eligiera y la otra impusiera diría que hacen cosas distintas.
 */
function AddConceptButton({
  label,
  addable,
  onAdd,
  onAddExtra,
}: {
  label: string;
  addable: readonly { code: string; label: string }[];
  onAdd: (code: string) => void;
  onAddExtra?: (kind: PayrollExtraConceptKind) => void;
}) {
  // Sin conceptos libres NI la posibilidad de declarar un bono no se rinde: un botón que no puede
  // hacer nada estorba.
  if (addable.length === 0 && !onAddExtra) {
    return null;
  }

  return (
    <Dropdown className="w-full">
      <AddConceptTrigger label={label} />
      <DropdownPanel width={300}>
        {/* UNA sola lista, y los bonos dentro de ella. Estuvieron apartados bajo una línea fija al
            pie del panel, y eso fallaba de las dos maneras: el usuario tenía que mirar en dos
            sitios lo que es una única pregunta —qué fila agrego—, y el bloque fijo se quedaba
            encima de la lista al hacer scroll, tapando el concepto que quedara debajo. */}
        <div className="flex max-h-[320px] flex-col gap-0.5 overflow-y-auto">
          {addable.map((concept) => (
            <AddMenuItem
              key={concept.code}
              title={concept.label}
              hint={concept.code}
              onSelect={() => onAdd(concept.code)}
            />
          ))}
          {onAddExtra &&
            (["aportable", "noAportable"] as const).map((kind) => (
              <AddMenuItem
                key={kind}
                title={EXTRA_CONCEPT_KIND_LABEL[kind]}
                // Donde un concepto del libro pone su código va, aquí, lo único que separa a los
                // dos bonos: la clase se elige aquí porque después no se puede leer en la fila —el
                // rótulo lo escribe el usuario—. Corto para que ocupe un renglón como los demás.
                hint={kind === "aportable" ? "Aporta al IESS" : "No aporta al IESS"}
                onSelect={() => onAddExtra(kind)}
              />
            ))}
        </div>
      </DropdownPanel>
    </Dropdown>
  );
}

function AddMenuItem({
  title,
  hint,
  onSelect,
}: {
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  const { setOpen } = useDropdown();
  return (
    <button
      type="button"
      onClick={() => {
        onSelect();
        setOpen(false);
      }}
      className="rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-canvas"
    >
      <span className="block text-[12.5px] font-medium text-ink">{title}</span>
      <span className="mt-0.5 block text-[11.5px] leading-snug text-faint">{hint}</span>
    </button>
  );
}

/**
 * El campo del nombre de una fila — el mismo para una del catálogo y una de bono, porque después
 * de este cambio son la misma cosa: una fila con rótulo propio.
 *
 * Borrador local: el rótulo se persiste al SALIR del campo, no en cada tecla — escribir
 * «Movilización» dispararía trece escrituras y trece relecturas de Dexie.
 */
function RowNameField({
  value,
  disabled,
  ariaLabel,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  ariaLabel: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <input
      type="text"
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      maxLength={MAX_EXTRA_CONCEPT_LABEL_LENGTH}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
      className={cn(
        "min-w-0 flex-1 rounded-[7px] border px-2 py-1 text-[12.5px] text-ink transition-colors",
        disabled
          ? "border-transparent bg-transparent"
          : "border-transparent bg-transparent hover:border-chip-border focus:border-brand focus:bg-surface focus:outline-none",
      )}
    />
  );
}

/**
 * Una fila de BONO: la clase en la píldora, el nombre EDITABLE en la columna Concepto y su importe
 * en Cantidad. Es la misma forma que una fila del catálogo — píldora, nombre, importe, valor,
 * papelera —, que es justamente lo que este cambio buscaba.
 *
 * La CLASE va en la píldora y no se cambia: cambiarla movería el importe entre bases y con él el
 * aporte al IESS y los décimos, sin que nada en esta fila lo enseñe. Para cambiarla se quita la
 * fila y se agrega la de la otra clase.
 */
function ExtraConceptRowComponent({
  row,
  disabled,
  onRename,
  onRemove,
  onAmount,
}: {
  row: PayrollExtraRow;
  disabled: boolean;
  onRename: (rowId: string, label: string) => void;
  onRemove: (rowId: string) => void;
  onAmount: (rowId: string, value: number) => void;
}) {
  return (
    <GridRow className="group">
      <Cell>
        {/* La columna Código son 96 px menos el padding de la celda: cabe una píldora corta y no
            «NO APORT.», que se parte en dos líneas y estira la fila por encima de las demás. Lo
            que va aquí es la CLASE de fila —un bono—, y CUÁL de las dos clases se lee al lado del
            nombre, en la columna elástica, donde además está lo que esa clase califica. */}
        <ConceptCode code="BONO" tone="ingreso" />
      </Cell>
      <Cell>
        <div className="flex items-center gap-2">
          <RowNameField
            value={row.label}
            disabled={disabled}
            ariaLabel={`Nombre del ${EXTRA_CONCEPT_KIND_LABEL[row.kind].toLowerCase()}`}
            onCommit={(next) => onRename(row.id, next)}
          />
          {/* En versalitas y no en píldora: una segunda píldora en la misma fila competiría con
              la del código, y esto no es un código sino una propiedad del concepto. */}
          <span className="shrink-0 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.5px] text-faint">
            {EXTRA_CONCEPT_KIND_SHORT[row.kind]}
          </span>
        </div>
      </Cell>
      <NumberFieldCell
        value={row.amount === 0 ? null : row.amount}
        disabled={disabled}
        ariaLabel={`Importe de ${row.label}`}
        format="plain"
        unit="$"
        onCommit={(value) => onAmount(row.id, value)}
      />
      <Cell numeric className="bg-surface-calc">
        <span className="font-mono text-muted">{formatCurrencyOrDash(row.amount)}</span>
      </Cell>
      <Cell>
        {!disabled && (
          <RowAction
            label={`Quitar ${row.label}`}
            title="Quitar del rol de este empleado"
            onClick={() => onRemove(row.id)}
          />
        )}
      </Cell>
    </GridRow>
  );
}

const ExtraConceptRow = memo(ExtraConceptRowComponent);

/**
 * El aviso de tope. AVISA y no bloquea: la app reproduce lo que la firma decide —`approvedOvertime`
 * ya se teclea sin validar— y una liquidación o un acuerdo puntual no puede quedar bloqueado.
 */
function ExtraCapNotice({
  breaches,
  error,
}: {
  breaches: readonly ExtraCapBreach[];
  error: string | null;
}) {
  if (breaches.length === 0 && !error) {
    return null;
  }

  return (
    <div className="mt-2.5 flex flex-col gap-2">
      {error && <NoticeBanner>{error}</NoticeBanner>}
      {breaches.map((breach) => {
        const { subject, rule } = describeCapBreach(breach);
        return (
          <NoticeBanner key={breach.kind}>
            {subject} suman{" "}
            <span className="font-mono font-semibold tabular-nums">
              {formatCurrency(breach.total, { cents: true })}
            </span>
            , por encima de {rule} (
            <span className="font-mono tabular-nums">
              {formatCurrency(breach.cap, { cents: true })}
            </span>
            ). Se pasa por{" "}
            <span className="font-mono font-semibold tabular-nums">
              {formatCurrency(breach.excess, { cents: true })}
            </span>
            . El importe se guarda igual y el rol lo calcula con él.
          </NoticeBanner>
        );
      })}
    </div>
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
