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

/** A stable empty set: recreating it on every render would break the `useMemo`s below. */
const EMPTY_ADDED: ReadonlySet<string> = new Set();

/** What the INCOME table needs to draw and edit the período's concepts. It travels in an object and
 *  not in five loose props so the deductions table, which has none of them, does not carry them. */
export interface ExtraConceptControls {
  /** THIS employee's bonus rows, with their label, their class and their amount inside. */
  rows: readonly PayrollExtraRow[];
  /** The caps that were exceeded, already computed by the pure layer. Empty is «all within». */
  breaches: readonly ExtraCapBreach[];
  onAdd: (kind: PayrollExtraConceptKind) => void;
  onRename: (rowId: string, label: string) => void;
  onRemove: (rowId: string) => void;
  onAmountChange: (rowId: string, value: number) => void;
  /** The last rejection of a name (duplicate, empty, too long), so it can be said out loud. */
  error: string | null;
}

interface ConceptTableBaseProps {
  computed: PayrollEmployeeComputation;
  capture: PayrollMonthlyCapture;
  /**
   * The footer's total. It arrives from the ENGINE (`grossIncome` / `totalDeductions`) and is never
   * summed here, and that is not purism: on the income side the sum of the rows and the total differ
   * ON PURPOSE — `I-02`…`I-04` show the whole value of the hours worked while the total only holds
   * what Gerencia approved (`overtimeTotal`). Summing the column would give a figure that is nowhere
   * in the rol.
   */
  total: number;
  /**
   * The codes the user added with «Agregar …». A captured concept at zero is only visible if it is
   * here — without this memory, the row just created would disappear before it could be typed into.
   */
  added?: ReadonlySet<string>;
  /** Adds the captured concept picked in the menu. */
  onAdd: (code: string) => void;
  /**
   * Gives a catalogue row the name this employee wants. An EMPTY name returns it to the book's
   * label.
   */
  onRename: (code: string, label: string) => void;
  /**
   * Removes a CAPTURED row from this employee's rol: it empties what was typed and hides it.
   *
   * It «deletes» nothing, and that is why it does not say delete: the catalogue's concepts belong to
   * the accountant's book and always exist — what is removed is THIS employee's row, which is
   * exactly what «Agregar ingreso» had put there. An extra concept really is deleted, and that is
   * why its trash can says something else.
   */
  onRemove: (code: string) => void;
  /** Switches the captured ones off: closed período, or while saving. */
  readOnly?: boolean;
}

export type ConceptTableProps =
  | (ConceptTableBaseProps & {
      kind: "ingresos";
      /** Only called with `capturado` concepts — `calculado` ones are not edited. */
      onAmountChange: (concept: IncomeConcept, value: number) => void;
      /** The COUNT of hours of the three overtime classes, which is typed even though its value is
       *  derived. */
      onHoursChange: (field: OvertimeHoursField, value: number) => void;
      /** The concepts the PERÍODO declares on its own. Absent in a read-only table or before the
       *  período exists. */
      extra?: ExtraConceptControls;
    })
  | (ConceptTableBaseProps & {
      kind: "egresos";
      onAmountChange: (concept: DeductionConcept, value: number) => void;
    });

/**
 * The rol's concept table — the SAME one for income and deductions, because the accountant's payslip
 * prints them alike except for the CANTIDAD column, which only income has.
 *
 * No label is written here: it walks `INCOME_CONCEPTS`/`DEDUCTION_CONCEPTS` from
 * `@/lib/payroll/concepts`, which is where the catalogue is declared ONCE next to its column of the
 * book. A label typed on this screen could disagree with the one the parser uses and no test of
 * figures would notice, because the figures would keep adding up the same. For the same reason the
 * order is the catalogue's, which is the book's and the printed payslip's: row 3 on screen is row 3
 * of the rol.
 *
 * A `calculado` concept goes grey and is not edited; a `capturado` one is a field. It is the same
 * grammar as the período grid, a little further up.
 */
export function ConceptTable(props: ConceptTableProps) {
  // Split into two bodies instead of narrowing inside a `useCallback`: the row dispatchers have to
  // be STABLE for the memoized rows to be worth anything, and a union narrowed inside the callback
  // forces either a cast or a dependency that changes on every render.
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
            // Only what is TYPED can be removed: a calculated concept has no row to empty, the app
            // derives it and it would be back on the next render.
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

/** Stable by definition: the deductions table has no quantity column to dispatch. */
function noop(): void {}

/** The design's exact widths. The table is `table-fixed` with a `<colgroup>` so it declares them
 *  ONCE and they do not depend on how wide each row's text measures: the CANTIDAD column and the
 *  VALOR one have to line up plumb between the two tables, which are read side by side. */
const CODE_WIDTH = 96;
const QUANTITY_WIDTH = 116;
const VALUE_WIDTH = 150;
/** The fifth column, empty: the gap where the row action lives. Reserving it from now on is what
 *  keeps the columns from shifting the day it appears. */
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
  /** The catalogue concepts this employee does not use yet. Empty = they are all in place. */
  addable: readonly { code: string; label: string }[];
  onAdd: (code: string) => void;
  /** Declares a BONUS row. Absent where there are none (deductions, read-only). */
  onAddExtra?: (kind: PayrollExtraConceptKind) => void;
  footnote?: ReactNode;
  /** Rows that come AFTER the catalogue: the bonus rows this employee declares. */
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
        {/* The legend for the grey. It goes over each table and not once per screen because each
            table is read on its own: whoever looks only at the deductions also needs to know why the
            IESS contribution cannot be typed into. */}
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
          {/* The same fill as the header and INSIDE the table's border: the total closes the grid,
              it is not a separate line that happens to sit below it. */}
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
  /** The concept's place in its catalogue. It travels instead of a per-row function so the parent's
   *  dispatcher can be stable and `memo` can be worth something. */
  index: number;
  code: string;
  tone: "ingreso" | "egreso";
  label: string;
  amount: number;
  /** The amount is typed (captured concept) instead of being derived. */
  amountEditable: boolean;
  /** `null` = this concept is not measured in hours. */
  hours: number | null;
  showQuantity: boolean;
  disabled: boolean;
  /** Whether this row admits a name of its own: only the ones that type their amount. */
  renameable: boolean;
  onAmount: (index: number, value: number) => void;
  onHours: (index: number, value: number) => void;
  onRename: (code: string, label: string) => void;
  /** Absent on the calculated ones: there is no row to remove when the app derives it. */
  onRemove?: (code: string) => void;
}

/** A column's label: micro-uppercase, the header convention of the whole app. */
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
    // `group` is what lets the fifth column's trash can appear on hovering the ROW and not only its
    // own cell, which is 40 px of blank space.
    <GridRow className="group">
      <Cell>
        <ConceptCode code={code} tone={tone} />
      </Cell>
      <Cell>
        {/* The concept was picked when the row was ADDED, so there is nothing left to pick here and
            the cell is the name. A calculated one goes in plain text: its label belongs to the book
            —or to a statutory rate— and nobody writes it. */}
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
          // HOURS, not money. The unit is labelled next to the field because this column carries
          // both things —hours on the overtime rows, an amount on the captured ones— and without
          // saying so hours get typed where dollars were meant: 4,654,651 «hours» pass for a
          // plausible amount and come out converted into fourteen million without anything jarring.
          <NumberFieldCell
            value={hours === 0 ? null : hours}
            disabled={disabled}
            ariaLabel={`Horas de ${label}`}
            format="plain"
            unit="h"
            onCommit={(value) => onHours(index, value)}
          />
        ) : amountEditable ? (
          // What is typed into a captured concept IS its amount, and it goes here and not in VALOR:
          // the whole table reads alike, on the left what you write and on the right what it is
          // worth.
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

      {/* VALOR is ALWAYS the grey column: what the concept is worth, with its symbol, whether typed
          or derived. That the grey means «this is not edited here» without exceptions is what makes
          the header's legend true. */}
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
 * A row's trash can. It appears on hover and not always: twenty-six trash cans lit at once compete
 * with the figures, which is what the table exists to show.
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

/** The two tables together are 26 rows that repaint with every keystroke, because the engine derives
 *  its twenty columns again; memoized with `code` as the key, like `EmployeeRow`. */
const ConceptRow = memo(ConceptRowComponent);

/**
 * The code in a pill tinted by its class — green for income, amber for a deduction —, which is what
 * makes it possible to tell at a glance which table is being read when the two are read in parallel.
 *
 * It is not a `Badge`: that one is `rounded-full` and in small caps, the shape of a STATE. This is an
 * account code, and in this app a code goes in mono and in a sharp-cornered box.
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
 * A `<td>` whose entire area is the field. The `<td>` is written by hand instead of passing `p-0` to
 * `Cell`: that one already carries `px-3.5 py-2`, and which of `p-0` and `px-3.5` wins depends on the
 * order in which Tailwind emits the rules, not on the order of the string.
 */
function NumberFieldCell({
  value,
  disabled,
  ariaLabel,
  format,
  unit,
  onCommit,
}: {
  /** `null` is seeded EMPTY: it is what tells «no overtime hours were worked» from a zero typed by
   *  hand. What comes back through `onCommit` is always a number. */
  value: number | null;
  disabled: boolean;
  ariaLabel: string;
  format: "amount" | "plain";
  /** What is written in this box: «h» for hours, «$» for an amount. It goes NEXT TO the field and not
   *  in the header because the column carries both things depending on the row. */
  unit?: string;
  onCommit: (value: number) => void;
}) {
  return (
    <td className="border-b border-border-soft px-2 py-1.5">
      {/* The box IS VISIBLE even without focus. An input with no border in a table full of grey
          figures is indistinguishable from a computed cell, and the screen stops saying where you
          can write — which is the only question anyone asks on opening it. That is why the outline
          is the affordance and focus only reinforces it. */}
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
 * The full-width, dashed-border button under each table. It deliberately does not use `Button`: that
 * primitive is three sizes of bar control with its own `border`/`bg`, and forcing a dashed stroke and
 * another border colour onto it would compete with it for the same properties, which is settled by
 * the order of the stylesheet and not the order of the string.
 */
const DASHED_ADD_BUTTON =
  "mt-2.5 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-chip-border py-[11px] text-[12.5px] font-semibold text-brand transition-colors hover:border-brand hover:bg-brand-soft";

/** The same button, when it also opens a menu: only who gives it the `ref` and the click changes. */
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
 * ALWAYS a menu, in both tables.
 *
 * It used to insert the first free concept without asking and the row was born with a dropdown to
 * correct it. Picking here, that dropdown is left with no work and the label cell is free for writing
 * the name — which is what makes ALL rows read alike, the bonus one included, which was the only one
 * with that shape.
 *
 * That both tables use the same gesture is not symmetry for its own sake: they are read side by side,
 * and one picking while the other imposed would say they do different things.
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
  // With no free concepts NOR the possibility of declaring a bonus it does not render: a button that
  // can do nothing is in the way.
  if (addable.length === 0 && !onAddExtra) {
    return null;
  }

  return (
    <Dropdown className="w-full">
      <AddConceptTrigger label={label} />
      <DropdownPanel width={300}>
        {/* ONE single list, with the bonuses inside it. They were set apart under a rule fixed at the
            foot of the panel, and that failed in both ways: the user had to look in two places for
            what is a single question —which row do I add—, and the fixed block stayed on top of the
            list while scrolling, covering whichever concept fell underneath. */}
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
                // Where a concept of the book puts its code goes, here, the only thing that separates
                // the two bonuses: the class is picked here because afterwards it cannot be read off
                // the row —the user writes the label—. Short so it takes one line like the rest.
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
 * A row's name field — the same one for a catalogue row and a bonus row, because after this change
 * they are the same thing: a row with a label of its own.
 *
 * Local draft: the label is persisted on LEAVING the field, not on every keystroke — typing
 * «Movilización» would fire thirteen writes and thirteen re-reads of Dexie.
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
 * A BONUS row: the class in the pill, the EDITABLE name in the Concepto column and its amount in
 * Cantidad. It is the same shape as a catalogue row — pill, name, amount, value, trash can —, which
 * is exactly what this change was after.
 *
 * The CLASS goes in the pill and is not changed: changing it would move the amount between bases and
 * with it the IESS contribution and the décimos, without anything in this row showing it. To change
 * it the row is removed and the one of the other class is added.
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
        {/* The Código column is 96 px minus the cell's padding: a short pill fits and «NO APORT.»
            does not, which breaks onto two lines and stretches the row above the others. What goes
            here is the row's CLASS —a bonus—, and WHICH of the two classes is read next to the name,
            in the elastic column, where what that class qualifies also is. */}
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
          {/* In small caps and not in a pill: a second pill on the same row would compete with the
              code's, and this is not a code but a property of the concept. */}
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
 * The cap notice. It WARNS and does not block: the app reproduces what the firm decides
 * —`approvedOvertime` is already typed without validation— and a settlement or a one-off agreement
 * cannot end up blocked.
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
 * What Gerencia approved trims what ADDS UP, not what is shown: `I-02`…`I-04` still show the whole
 * value of the hours worked. Without this line the income column does not square with its own total
 * and the table looks broken.
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
