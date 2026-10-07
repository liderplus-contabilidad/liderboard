"use client";

import {
  ArrowRightLeft,
  CheckCircle2,
  Copy,
  Flag,
  Landmark,
  FileText,
  PenLine,
  Banknote,
  Plus,
  Scale,
  RotateCcw,
  Trash2,
  TrendingUp,
  Waves,
  X,
} from "lucide-react";
import { Fragment, memo, type ReactNode, useCallback, useMemo, useState } from "react";
import { useFilterState } from "@/components/dashboard/filter-state";
import { Cell, HeadCell } from "@/components/data-table/grid-cells";
import { DataGrid, GridRow } from "@/components/data-table/data-grid";
import { Button } from "@/components/ui/button";
import { CellNote, NOTE_HOST } from "@/components/ui/cell-note";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { DateField } from "@/components/ui/date-field";
import { EmptyState } from "@/components/ui/empty-state";
import { NumericInput } from "@/components/ui/numeric-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { StatTile } from "@/components/ui/stat-tile";
import { payableNoteKey, type PayableNoteField } from "@/lib/cash-flow/cell-notes";
import * as cashDb from "@/lib/cash-flow/db";
import {
  approvedFromTyped,
  documentLabel,
  hasPaymentSubtotal,
  kindLabel,
  money,
  payableDetail,
  type SupplierGroup,
} from "@/lib/cash-flow/derive";
import { accountLabel, centerName, copyFlowFrom, type FlowLine } from "@/lib/cash-flow/flow";
import { incomeLabels } from "@/lib/cash-flow/income-labels";
import {
  DEFAULT_MARKED_COLUMNS,
  sanitizeMarkedColumns,
  visibleMarkedColumns,
  type MarkedColumn,
  type MarkedColumnId,
} from "@/lib/cash-flow/marked-columns";
import { derivePaymentMatrix, matrixTable, type PaymentMatrix } from "@/lib/cash-flow/matrix";
import type { FlowIncome, FlowPayable, PayPriority } from "@/lib/cash-flow/types";
import { cn } from "@/lib/cn";
import { formatDayMonthYear } from "@/lib/date";
import { pluralize } from "@/lib/format";
import { useCashFlowData } from "./cash-flow-data-provider";
import { OverdraftNotices } from "./overdraft-notices";
import { CashFlowEmptyState } from "./cash-flow-empty-state";
import { FloatingActionMenu } from "@/components/ui/floating-action-menu";
import { FlowCheckPicker } from "./flow-check-picker";
import {
  FlowNotesContext,
  FlowFigureCell,
  FlowFigureNote,
  FlowFigureTile,
} from "./flow-figure-note";
import { FlowBankTable } from "./flow-bank-table";
import { FlowCarteraPicker } from "./flow-cartera-picker";
import { ManualPayablePanel } from "./manual-payable-panel";
import { AccountPicker } from "./account-picker";
import {
  Select as StyledSelect,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { MarkedColumnPreferencesButton } from "./marked-column-preferences";

const NONE = "";
/** A flow without notes: one frozen object instead of a new `{}` per render. */
const NO_NOTES: Readonly<Record<string, string>> = Object.freeze({});

/** The two marks of payment each own a GROUND, the printed flow's and its Excel's too: the whole
 *  column wears it, zeros included, so urgent and pending read as two columns at a glance even on
 *  a flow with nothing urgent. */
const URGENT_GROUND = "bg-urgent";
const PENDING_GROUND = "bg-surface-calc-strong";

const URGENT_TONE = cn(URGENT_GROUND, "font-bold text-ink");

type NoteWriter = (key: string, text: string) => void;

/** The flow's two shapes: the sheet's list (bank block + payments) and COMISERSA's `FLUJO MATRIZ`. */
type FlowShape = "lista" | "matriz";
const FLOW_SHAPES: { value: FlowShape; label: string }[] = [
  { value: "lista", label: "Lista" },
  { value: "matriz", label: "Matriz" },
];

/**
 * The flow OF the cut date — the WORKING sheet: the accounts table (the cells with a field are the
 * CAPTURE — saldo; everything else is `deriveFlow`), the incomes (one bank column per label), the marked documents
 * grouped by supplier and EDITED there (`MarkedSection`), and, for an empresa with centers, the
 * loans between them. It is `FLUJO MATRIZ`, `FJ dd-mm` and `FLUJO DE BANCOS` at once: the columns
 * that were typed are now read from Cheques and from the marks, and the marks are written here or
 * in Cuentas por pagar alike. «Ver como» turns the block into the matrix (`matrix.ts`).
 *
 * Nothing here is stored but the balances and the incomes (`db.saveFlow`, one record per date):
 * every edit of the list goes to the DOCUMENT.
 */
export function FlowView() {
  const { activeClientId, centers, checks, asOf, flow, previous, derived } = useCashFlowData();
  // The shape is a control of ONE card, read by nothing else, so it lives here and is not kept.
  const [shape, setShape] = useState<FlowShape>("lista");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [checksOpen, setChecksOpen] = useState(false);
  const openChecks = useCallback(() => setChecksOpen(true), []);
  const [manualOpen, setManualOpen] = useState(false);
  const openPicker = useCallback(() => setPickerOpen(true), []);
  const openManual = useCallback(() => setManualOpen(true), []);

  const setBalance = useCallback(
    (accountId: string, value: number | null) => {
      if (activeClientId) {
        void cashDb.saveFlow(activeClientId, asOf, { balances: { [accountId]: value ?? 0 } });
      }
    },
    [activeClientId, asOf],
  );
  const setIncomes = useCallback(
    (incomes: FlowIncome[]) => {
      if (activeClientId) {
        void cashDb.saveFlow(activeClientId, asOf, { incomes });
      }
    },
    [activeClientId, asOf],
  );
  // A cell's note is of THIS date: it goes in the date's flow, merged by key (`applyNotes`).
  const setNote = useCallback(
    (key: string, text: string) => {
      if (activeClientId) {
        void cashDb.saveFlow(activeClientId, asOf, { notes: { [key]: text } });
      }
    },
    [activeClientId, asOf],
  );
  const copyPrevious = useCallback(() => {
    if (activeClientId && previous) {
      const copy = copyFlowFrom(previous, asOf);
      void cashDb.saveFlow(activeClientId, asOf, {
        balances: copy.balances,
        incomes: copy.incomes,
      });
    }
  }, [activeClientId, previous, asOf]);

  const incomes = flow?.incomes ?? [];
  const notes = flow?.notes ?? NO_NOTES;
  const hasCenters = centers.length > 0;
  // A column that means nothing for the open data renders nothing: an empresa that keeps no check
  // register (Nomik) has no «cheques no cobrados» to subtract.
  const hasChecks = checks.length > 0;
  const dateLabel = formatDayMonthYear(asOf) ?? asOf;
  const { totals, incomeColumns } = derived;
  const hasIncomes = incomeColumns.length > 0;
  // With nothing marked there is nothing to shape: the switch renders nothing and the list stays.
  const shapeable = derived.lines.length > 0;
  const asMatrix = shapeable && shape === "matriz";
  const matrix = useMemo(
    () => (asMatrix ? derivePaymentMatrix(derived, centers, hasChecks) : null),
    [asMatrix, derived, centers, hasChecks],
  );

  if (!activeClientId) {
    return <CashFlowEmptyState />;
  }

  return (
    <CashFlowEmptyState>
      <FlowNotesContext.Provider value={{ notes, onNote: setNote }}>
        <div className="flex flex-col gap-4 px-7 py-5">
          <OverdraftNotices />
          <div className="flex gap-3">
            <FlowFigureTile
              section="accounts"
              row="total"
              column="Total bancos"
              label="Total bancos"
              value={money(totals.bankTotal)}
              hint={`Saldo ${money(totals.balance)} + sobregiro ${money(totals.overdraft)}`}
            />
            {hasIncomes && (
              <FlowFigureTile
                section="incomes"
                row="total"
                column="Monto"
                label="Total ingresos"
                value={money(totals.incomes)}
              />
            )}
            {hasChecks && (
              <FlowFigureTile
                section="accounts"
                row="total"
                column="Cheques no cobrados"
                label="Cheques no cobrados"
                value={money(totals.outstanding)}
              />
            )}
            <FlowFigureTile
              section="payments"
              row="total"
              column="Saldo"
              label="Marcado para pago"
              value={money(totals.urgent + totals.pending)}
              hint={`Urgente ${money(totals.urgent)} · Pendiente ${money(totals.pending)}`}
            />
            <FlowFigureTile
              section="remaining"
              row="all"
              column="Saldo"
              label={totals.remaining < 0 ? "Saldo faltante" : "Saldo sobrante"}
              value={money(Math.abs(totals.remaining))}
              sign={totals.remaining < 0 ? "negativo" : "positivo"}
            />
          </div>

          {/* Incomes first: they are a capture and they ADD to the bank total the table below opens
            with, so what is typed is read before what it feeds. */}
          <IncomesSection incomes={incomes} onChange={setIncomes} />

          <FlowSection>
            <SectionHeading
              icon={<Landmark size={15} />}
              title={`Flujo de bancos · ${dateLabel}`}
              hint={flow ? undefined : "Sin captura para esta fecha"}
            >
              {shapeable && (
                <span className="flex items-center gap-2">
                  <span className="text-[11.5px] font-semibold text-faint">Ver como</span>
                  <SegmentedControl
                    value={shape}
                    options={FLOW_SHAPES}
                    onChange={setShape}
                    ariaLabel="Ver como"
                  />
                </span>
              )}
              {previous && (
                <Button
                  variant="secondary"
                  size="toolbar"
                  icon={<Copy size={14} />}
                  onClick={copyPrevious}
                >
                  Copiar del {formatDayMonthYear(previous.date)}
                </Button>
              )}
            </SectionHeading>

            {derived.accounts.length === 0 ? (
              <EmptyState icon={<Waves size={22} />}>Ninguna cuenta del centro marcado.</EmptyState>
            ) : matrix ? (
              <PaymentMatrixTable matrix={matrix} />
            ) : (
              <FlowBankTable notes={notes} onNote={setNote} onBalance={setBalance} />
            )}
          </FlowSection>

          {!asMatrix && (
            <MarkedSection
              notes={notes}
              onNote={setNote}
              onPickFromCartera={openPicker}
              onPickFromChecks={openChecks}
              onAddManual={openManual}
            />
          )}

          {/* The sheet's «SALDO FALTANTE» row, right under the TOTAL it is read against: its three
            figures — after everything marked, after only the urgent, after only the pending. */}
          {derived.accounts.length > 0 && (
            <FlowSection>
              <SectionHeading icon={<Scale size={15} />} title="Saldo faltante o sobrante" />
              <div className="grid grid-cols-3 gap-3">
                <Remaining label="Tras todo lo marcado" value={totals.remaining} />
                <Remaining label="Pagando solo lo urgente" value={totals.remainingUrgentOnly} />
                <Remaining label="Pagando solo lo pendiente" value={totals.remainingPendingOnly} />
              </div>
            </FlowSection>
          )}

          <SettledSection />

          {hasCenters && derived.loans.length > 0 && (
            <FlowSection>
              <SectionHeading icon={<ArrowRightLeft size={15} />} title="Préstamos entre centros" />
              <ul className="flex flex-wrap gap-2">
                {derived.loans.map((loan) => (
                  <li
                    key={`${loan.fromCenterId}-${loan.toCenterId}`}
                    className={cn(
                      NOTE_HOST,
                      "rounded-[9px] border border-border bg-surface-muted px-3 py-1.5 text-[12.5px] tabular-nums",
                    )}
                  >
                    <span className="font-semibold text-ink">
                      {centerName(loan.fromCenterId, centers)} →{" "}
                      {centerName(loan.toCenterId, centers)}
                    </span>
                    <FlowFigureNote
                      section="loans"
                      row={`${loan.fromCenterId}-${loan.toCenterId}`}
                      column="Monto"
                      label="Préstamo entre centros"
                    />
                    <span className="ml-2 text-brand">{money(loan.amount)}</span>
                  </li>
                ))}
              </ul>
            </FlowSection>
          )}
        </div>
      </FlowNotesContext.Provider>
      <FlowCarteraPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
      {checksOpen && <FlowCheckPicker onClose={() => setChecksOpen(false)} />}
      {manualOpen && <ManualPayablePanel onClose={() => setManualOpen(false)} />}
    </CashFlowEmptyState>
  );
}

/** Account columns keep the bank figures and beneficiaries growing downwards. */
function PaymentMatrixTable({ matrix }: { matrix: PaymentMatrix }) {
  const table = useMemo(() => matrixTable(matrix), [matrix]);
  const rows = table.rows;
  return (
    <DataGrid minWidth={240 + rows.length * 130}>
      <thead>
        <tr>
          <HeadCell sticky="left" width={240}>
            Concepto · beneficiario
          </HeadCell>
          {rows.map((row) => (
            <HeadCell
              key={row.id}
              align="right"
              width={130}
              sticky={row.id === "total" ? "right" : undefined}
              className="whitespace-normal"
            >
              {row.label}
            </HeadCell>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.columns.map((column, index) => {
          const total = column.startsWith("Total") || column === "Saldo final";
          const ground = total ? "bg-brand [&>td]:bg-brand [&>td]:text-white" : undefined;
          return (
            <tr key={column} className={ground}>
              <Cell sticky="left" strong={total} className={cn("font-semibold", ground)}>
                {column}
              </Cell>
              {rows.map((row) => (
                <FlowFigureCell
                  section="matrix"
                  row={row.id}
                  column={column}
                  label={`${column} de ${row.label}`}
                  key={row.id}
                  numeric
                  strong={total || row.id === "total"}
                  sticky={row.id === "total" ? "right" : undefined}
                  className={ground}
                >
                  {row.values[index] ?? "—"}
                </FlowFigureCell>
              ))}
            </tr>
          );
        })}
      </tbody>
    </DataGrid>
  );
}

/**
 * What was PAID since the previous flow — the memory the `FJ` sheets kept by keeping the sheet:
 * read here, never summed, because the captured balance already reflects it and counting it again
 * would overstate the faltante. It lists what `Cuentas por pagar` archives under «Ver liquidadas»,
 * put where one looks for it.
 */
function SettledSection() {
  const { derived, activeClientId } = useCashFlowData();
  if (derived.settled.length === 0) {
    return null;
  }
  const hasManual = derived.settled.some(
    ({ payable }) => payable.source === "manual" || payable.source === "check",
  );
  const window = derived.settledSince
    ? `desde el ${formatDayMonthYear(derived.settledSince)}`
    : "en la fecha de corte";
  return (
    <FlowSection>
      <SectionHeading
        icon={<CheckCircle2 size={15} />}
        title="Pagado en esta fecha"
        hint={`${pluralize(derived.settled.length, "documento")} liquidados ${window}`}
      />
      <div className="overflow-hidden rounded-[13px] border border-border bg-surface">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 130 }} />
            {hasManual && <col style={{ width: 44 }} />}
          </colgroup>
          <thead>
            <tr>
              <HeadCell>Proveedor · documento</HeadCell>
              <HeadCell>Pagado el</HeadCell>
              <HeadCell align="right">Monto</HeadCell>
              {hasManual && <HeadCell />}
            </tr>
          </thead>
          <tbody>
            {derived.settled.map(({ payable, settledOn }) => (
              <tr key={payable.id} className="opacity-80">
                <Cell>
                  <span className="block truncate font-medium text-ink">{payable.supplier}</span>
                  <span className="block truncate text-[11px] text-faint">
                    {[documentLabel(payable), payableDetail(payable, { center: false })]
                      .filter(Boolean)
                      .join(" — ")}
                  </span>
                </Cell>
                <Cell className="tabular-nums text-muted">{formatDayMonthYear(settledOn)}</Cell>
                <FlowFigureCell
                  numeric
                  section="settled"
                  row={payable.id}
                  column="Monto"
                  label={`Pagado a ${payable.supplier}`}
                  className="text-positive"
                >
                  {money(payable.balance)}
                </FlowFigureCell>
                {hasManual && (
                  <Cell control>
                    {(payable.source === "manual" || payable.source === "check") &&
                      activeClientId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          icon={<RotateCcw size={13} />}
                          aria-label={`Reabrir obligación ${payable.supplier}`}
                          title="Reabrir obligación"
                          onClick={() =>
                            payable.source === "check"
                              ? void cashDb.settleFlowCheck(activeClientId, payable.checkId, null)
                              : void cashDb.reopenManualObligation(activeClientId, payable.id)
                          }
                        />
                      )}
                  </Cell>
                )}
              </tr>
            ))}
            <tr className="bg-surface-sunken">
              <Cell strong colSpan={2}>
                Total pagado
              </Cell>
              <FlowFigureCell
                numeric
                strong
                section="settled"
                row="total"
                column="Monto"
                label="Total pagado"
                className="text-positive"
              >
                {money(derived.settledTotal)}
              </FlowFigureCell>
              {hasManual && <Cell />}
            </tr>
          </tbody>
        </table>
      </div>
    </FlowSection>
  );
}

/**
 * One block of the page, in its order: ingresos → bancos → pagos marcados → faltante → pagado →
 * préstamos. A hairline above and the same air between them is what tells one from the next —
 * six headings of the same size, one after another, read as one long table.
 */
function FlowSection({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-3 border-t border-border pt-5">{children}</section>;
}

/** A section's heading: its icon on a brand tile, the title, the hint, and the controls of the
 *  section (a total, «Agregar», «Copiar del …») on the right. */
function SectionHeading({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-brand-soft text-brand">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[14px] font-bold text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-[11.5px] text-faint">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** One of the three «SALDO FALTANTE» readings: red with ▼ when short, green with ▲ when over. */
function Remaining({ label, value }: { label: string; value: number }) {
  return (
    <div className={NOTE_HOST}>
      <FlowFigureNote
        section="remaining"
        row={
          label === "Tras todo lo marcado"
            ? "all"
            : label === "Pagando solo lo urgente"
              ? "urgent"
              : "pending"
        }
        column="Saldo"
        label={label}
      />
      <StatTile
        label={
          value < 0
            ? `Saldo faltante · ${label.toLowerCase()}`
            : `Saldo sobrante · ${label.toLowerCase()}`
        }
        value={money(Math.abs(value))}
        sign={value < 0 ? "negativo" : "positivo"}
      />
    </div>
  );
}

/** Editable cells share the table's surface; dividers define their boundaries. */
const INCOME_FIELD =
  "w-full rounded-none border-0 bg-transparent px-2.5 py-2 text-[13px] text-ink outline-none placeholder:text-muted focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand";

function IncomesSection({
  incomes,
  onChange,
}: {
  incomes: FlowIncome[];
  onChange: (incomes: FlowIncome[]) => void;
}) {
  const { accounts, centers, flows } = useCashFlowData();
  const labels = useMemo(() => incomeLabels(flows), [flows]);
  const [focusIncomeId, setFocusIncomeId] = useState<string | null>(null);
  const options = [
    { value: NONE, label: "Sin cuenta" },
    ...accounts.map((account) => ({ value: account.id, label: accountLabel(account, centers) })),
  ];
  const update = (id: string, patch: Partial<FlowIncome>) =>
    onChange(incomes.map((income) => (income.id === id ? { ...income, ...patch } : income)));
  const total = incomes.reduce((acc, income) => acc + income.amount, 0);
  const choosesAccount = accounts.length > 1;

  return (
    <FlowSection>
      <SectionHeading icon={<TrendingUp size={15} />} title="Ingresos">
        <span className={cn(NOTE_HOST, "text-[13px] font-semibold tabular-nums text-brand")}>
          <FlowFigureNote section="incomes" row="total" column="Monto" label="Total ingresos" />
          {money(total)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={13} />}
          onClick={() => {
            const id = crypto.randomUUID();
            setFocusIncomeId(id);
            onChange([
              ...incomes,
              {
                id,
                concept: "",
                amount: 0,
                accountId: accounts.length === 1 ? accounts[0].id : null,
              },
            ]);
          }}
        >
          Agregar
        </Button>
      </SectionHeading>
      {incomes.length > 0 && (
        <DataGrid
          minWidth={choosesAccount ? 760 : 460}
          className="table-fixed [&_tr>:not(:last-child)]:border-r [&_tr>:not(:last-child)]:border-r-border-soft"
        >
          <colgroup>
            <col />
            <col className={choosesAccount ? "w-1/4" : "w-1/3"} />
            {choosesAccount && <col className="w-1/4" />}
            <col className="w-12" />
          </colgroup>
          <thead>
            <tr>
              <HeadCell>Etiqueta</HeadCell>
              <HeadCell align="right">Monto</HeadCell>
              {choosesAccount && <HeadCell>Cuenta</HeadCell>}
              <HeadCell>
                <span className="sr-only">Acciones</span>
              </HeadCell>
            </tr>
          </thead>
          <tbody>
            {incomes.map((income) => (
              <GridRow
                key={income.id}
                className="hover:bg-surface-muted [&:last-child>td]:border-b-0"
              >
                <Cell control>
                  <CreatableSelect
                    value={income.concept}
                    options={labels}
                    ariaLabel="Etiqueta del ingreso"
                    placeholder="Seleccionar o agregar etiqueta"
                    searchLabel="Buscar o agregar etiqueta"
                    searchPlaceholder="Buscar o escribir una etiqueta…"
                    createLabel="Agregar etiqueta"
                    clearLabel="Sin etiqueta"
                    variant="cell"
                    openOnMount={focusIncomeId === income.id}
                    onChange={(concept) => {
                      setFocusIncomeId(null);
                      if (concept !== income.concept) update(income.id, { concept });
                    }}
                  />
                </Cell>
                <Cell numeric control className={NOTE_HOST}>
                  <FlowFigureNote
                    section="incomes"
                    row={income.id}
                    column="Monto"
                    label={`Ingreso ${income.concept || "sin etiqueta"}`}
                  />
                  <NumericInput
                    value={income.amount}
                    format="currency"
                    ariaLabel="Monto del ingreso"
                    placeholder="0.00"
                    onCommit={(value) => update(income.id, { amount: value ?? 0 })}
                    className={INCOME_FIELD}
                  />
                </Cell>
                {choosesAccount && (
                  <Cell control>
                    <Select
                      size="sm"
                      aria-label="Cuenta del ingreso"
                      value={income.accountId ?? NONE}
                      options={options}
                      onChange={(event) =>
                        update(income.id, { accountId: event.target.value || null })
                      }
                      className="rounded-none border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand"
                    />
                  </Cell>
                )}
                <Cell control className="text-center">
                  <Button
                    variant="danger"
                    size="sm"
                    iconOnly
                    icon={<Trash2 size={13} />}
                    aria-label="Quitar ingreso"
                    onClick={() => onChange(incomes.filter((row) => row.id !== income.id))}
                  />
                </Cell>
              </GridRow>
            ))}
          </tbody>
        </DataGrid>
      )}
    </FlowSection>
  );
}

/**
 * The marked documents, grouped by supplier, in the sheet's own columns — SALDO · URGENTE ·
 * PENDIENTE, the amount under the mark it carries — and closed by the TOTAL row the sheet paints
 * green: it is what «Saldo faltante» is read against, so it sits at the END of the list, filled,
 * and not in a corner of the header.
 */
/**
 * «Pagos marcados» — the WORKING list, the sheet's `FECHA · ESTADO · PAGOS PENDIENTES · SALDO ·
 * URGENTE · PENDIENTE · FECHA DE PAGO` block. Every editable cell writes ONE field of the document
 * (`priority`, `payFromAccountId`, `approved`, `payOn`) through `db.ts` as it loses focus — a
 * drawer per cell is slower than the sheet it replaces — and the provider's live query re-derives
 * the flow, so the bank table above recomputes as the tiles do. It is a second SURFACE for the same
 * mark Cartera writes for imported documents. Manual obligations write their own table, owned
 * by Flujo; both use the same amount rules.
 *
 * Of Urgente and Pendiente the EDITABLE cell is the one the priority makes editable; the other is
 * what `markedSplit` leaves. Both write `approved` through `approvedFromTyped` (the saldo itself is
 * the whole, stored as `null`).
 */
function MarkedSection({
  notes,
  onNote,
  onPickFromCartera,
  onPickFromChecks,
  onAddManual,
}: {
  notes: Readonly<Record<string, string>>;
  onNote: NoteWriter;
  onPickFromCartera: () => void;
  onPickFromChecks: () => void;
  onAddManual: () => void;
}) {
  const { derived, asOf, activeClientId } = useCashFlowData();
  const [savedColumns, setColumns] = useFilterState(
    "cash-flow:marked-columns",
    null,
    DEFAULT_MARKED_COLUMNS,
  );
  const preferences = useMemo(() => sanitizeMarkedColumns(savedColumns), [savedColumns]);
  const columns = useMemo(() => visibleMarkedColumns(preferences), [preferences]);
  const minWidth = columns.reduce((width, column) => width + column.width, 76);
  const lineById = useMemo(
    () => new Map(derived.lines.map((line) => [line.payable.id, line])),
    [derived.lines],
  );
  const patch = useCallback(
    (id: string, fields: cashDb.PayablePatch) => {
      const payable = lineById.get(id)?.payable;
      if (payable?.source === "check") {
        if (!activeClientId) return;
        if (fields.priority === null) {
          void cashDb.setFlowCheckLinks(activeClientId, [payable.checkId], null);
        } else {
          void cashDb.updateFlowCheck(activeClientId, payable.checkId, fields);
        }
      } else if (payable?.source === "manual") {
        if (!activeClientId) return;
        if (fields.priority === null) {
          void cashDb.deleteManualObligation(activeClientId, id);
        } else {
          void cashDb.updateManualObligation(activeClientId, id, fields);
        }
      } else {
        void cashDb.updatePayable(id, fields);
      }
    },
    [activeClientId, lineById],
  );
  const sources = useMemo(
    () => [
      {
        id: "cartera",
        label: "Cartera",
        description: "Documentos por pagar",
        icon: <FileText size={21} />,
        run: onPickFromCartera,
      },
      {
        id: "checks",
        label: "Cheques",
        description: "Cheques registrados",
        icon: <Banknote size={21} />,
        run: onPickFromChecks,
      },
      {
        id: "manual",
        label: "Manual",
        description: "Concepto y monto",
        icon: <PenLine size={21} />,
        run: onAddManual,
      },
    ],
    [onPickFromCartera, onPickFromChecks, onAddManual],
  );

  return (
    <FlowSection>
      <SectionHeading
        icon={<Flag size={15} />}
        title="Pagos marcados"
        hint={pluralize(derived.lines.length, "pago")}
      >
        <div className="flex items-center gap-2">
          <MarkedColumnPreferencesButton preferences={preferences} onChange={setColumns} />
          <FloatingActionMenu label="Agregar pago" actions={sources} />
        </div>
      </SectionHeading>
      {derived.groups.length === 0 ? (
        <EmptyState icon={<Flag size={22} />}>
          <span className="flex flex-col items-center gap-3 text-center">
            <span>Sin pagos agregados. Usa «Agregar pago» para comenzar.</span>
          </span>
        </EmptyState>
      ) : (
        <DataGrid minWidth={minWidth} className="table-fixed">
          <colgroup>
            {columns.map((column) => (
              <col
                key={column.id}
                style={column.id === "document" ? undefined : { width: column.width }}
              />
            ))}
            <col style={{ width: 76 }} />
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) => (
                <HeadCell key={column.id} align={column.numeric ? "right" : "left"}>
                  {column.label}
                </HeadCell>
              ))}
              <HeadCell />
            </tr>
          </thead>
          <tbody>
            {derived.groups.map((group) => (
              <GroupRows
                key={group.key}
                group={group}
                columns={columns}
                asOf={asOf}
                lineById={lineById}
                notes={notes}
                onNote={onNote}
                onPatch={patch}
              />
            ))}
            <MarkedSummaryRow
              columns={columns}
              label="Total"
              row="total"
              urgent={derived.totals.urgent}
              pending={derived.totals.pending}
              total
            />
          </tbody>
        </DataGrid>
      )}
    </FlowSection>
  );
}

function MarkedSummaryRow({
  columns,
  label,
  row,
  urgent,
  pending,
  total = false,
}: {
  columns: readonly MarkedColumn[];
  label: ReactNode;
  row: string;
  urgent: number;
  pending: number;
  total?: boolean;
}) {
  // Only adjacent descriptive columns can share a heading; an amount must keep its own cell
  // wherever the user's order puts it. The default layout retains its five-column label.
  const documentIndex = columns.findIndex((column) => column.id === "document");
  const nextAmount = columns.findIndex((column, index) => index > documentIndex && column.numeric);
  const labelEnd = nextAmount === -1 ? columns.length : nextAmount;
  return (
    <GridRow
      className={
        total
          ? "bg-brand text-white"
          : "bg-surface [&>td]:border-t-2 [&>td]:border-t-brand/30 [&>td]:py-3"
      }
    >
      {columns.map((column, index) => {
        if (index > documentIndex && index < labelEnd) return null;
        if (column.id === "document") {
          return (
            <Cell
              key={column.id}
              colSpan={labelEnd - documentIndex}
              className={
                total
                  ? "border-b-0 py-3 text-[13px] font-bold uppercase tracking-[0.4px] text-white"
                  : "font-bold text-brand"
              }
            >
              {label}
            </Cell>
          );
        }
        if (!column.numeric) {
          return <Cell key={column.id} className={total ? "border-b-0" : undefined} />;
        }
        const amount =
          column.id === "urgent" ? urgent : column.id === "pending" ? pending : urgent + pending;
        const ground =
          column.id === "urgent"
            ? total
              ? "bg-urgent-total"
              : URGENT_GROUND
            : column.id === "pending"
              ? total
                ? "bg-pending-total"
                : PENDING_GROUND
              : "";
        return (
          <FlowFigureCell
            key={column.id}
            section="payments"
            row={row}
            column={column.label}
            label={total ? `Total ${column.label.toLowerCase()}` : `${column.label} del proveedor`}
            numeric
            strong={!total && column.id === "balance"}
            className={cn(
              ground,
              total
                ? "border-b-0 py-3 text-[14px] font-bold text-white"
                : column.id === "urgent"
                  ? URGENT_TONE
                  : "font-semibold text-ink",
            )}
          >
            {total || column.id === "balance" || amount > 0 ? money(amount) : ""}
          </FlowFigureCell>
        );
      })}
      <Cell className={total ? "border-b-0" : undefined} />
    </GridRow>
  );
}

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgente" },
  { value: "pending", label: "Pendiente" },
];

function GroupRows({
  group,
  columns,
  asOf,
  lineById,
  notes,
  onNote,
  onPatch,
}: {
  group: SupplierGroup<FlowPayable>;
  columns: readonly MarkedColumn[];
  asOf: string;
  lineById: Map<string, FlowLine>;
  notes: Readonly<Record<string, string>>;
  onNote: NoteWriter;
  onPatch: (id: string, fields: cashDb.PayablePatch) => void;
}) {
  const sum = (key: "urgent" | "pending") =>
    group.payables.reduce((acc, payable) => acc + (lineById.get(payable.id)?.[key] ?? 0), 0);
  const urgent = sum("urgent");
  const pending = sum("pending");
  // Manual obligations stand on their own; only cartera documents need a supplier subtotal.
  const hasCarteraDocuments = hasPaymentSubtotal(group.payables);
  return (
    <>
      {hasCarteraDocuments && (
        <MarkedSummaryRow
          columns={columns}
          label={
            <>
              {group.label}
              {group.payables[0]?.kind && (
                <span className="ml-2 text-[11px] font-normal text-faint">
                  {kindLabel(group.payables[0].kind)}
                </span>
              )}
            </>
          }
          row={`g-${group.key}`}
          urgent={urgent}
          pending={pending}
        />
      )}
      {group.payables.map((payable, index) => {
        const line = lineById.get(payable.id);
        return line ? (
          <MarkedRow
            key={payable.id}
            line={line}
            columns={columns}
            showSupplier={!hasCarteraDocuments}
            startsGroup={!hasCarteraDocuments && (index === 0 || payable.source === "manual")}
            asOf={asOf}
            notes={notes}
            onNote={onNote}
            onPatch={onPatch}
          />
        ) : null;
      })}
    </>
  );
}

/** One marked document, its cells writing the document's own fields as they lose focus. */
const MarkedRow = memo(function MarkedRow({
  line,
  columns,
  showSupplier,
  startsGroup,
  asOf,
  notes,
  onNote,
  onPatch,
}: {
  line: FlowLine;
  columns: readonly MarkedColumn[];
  showSupplier: boolean;
  startsGroup: boolean;
  asOf: string;
  notes: Readonly<Record<string, string>>;
  onNote: NoteWriter;
  onPatch: (id: string, fields: cashDb.PayablePatch) => void;
}) {
  const { payable } = line;
  const { activeClientId } = useCashFlowData();
  const [editing, setEditing] = useState(false);
  const isManual = payable.source === "manual";
  const isCheck = payable.source === "check";
  const docLabel = isManual ? payable.supplier : documentLabel(payable) || payable.supplier;
  const detail = payableDetail(payable, { center: false });
  /** The note corner of one working cell of this document, of this date. */
  const note = (field: PayableNoteField, what: string) => {
    const key = payableNoteKey(payable.id, field);
    return (
      <CellNote
        note={notes[key]}
        label={`${what} de ${docLabel}`}
        onChange={(text) => onNote(key, text)}
      />
    );
  };
  const urgentEditable = line.priority === "urgent";
  const commitAmount = (typed: number | null) =>
    onPatch(payable.id, { approved: approvedFromTyped(typed, payable.balance) });
  const cells: Record<MarkedColumnId | "actions", ReactNode> = {
    document: (
      <Cell className={cn(!isManual && !showSupplier && "pl-7")}>
        {showSupplier && !isManual && (
          <span className="block pb-1 font-semibold text-brand">{payable.supplier}</span>
        )}
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-0.5">
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted">
            {isManual ? "Manual" : isCheck ? "Cheque" : "Cartera"}
          </span>
          {isManual ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Editar obligación ${payable.supplier}`}
              className="shrink-0 text-left text-[12px] font-semibold text-ink hover:text-brand hover:underline"
            >
              {docLabel}
            </button>
          ) : (
            <span className="shrink-0 whitespace-nowrap font-mono text-[12px] text-ink">
              {docLabel}
            </span>
          )}
          {detail && (
            <span className="min-w-0 break-words text-[11.5px] leading-[1.35] text-muted">
              {detail}
            </span>
          )}
        </span>
        {editing && payable.source === "manual" && (
          <ManualPayablePanel obligation={payable} onClose={() => setEditing(false)} />
        )}
      </Cell>
    ),
    dueOn: (
      <Cell
        className={cn(
          "tabular-nums",
          payable.dueOn && payable.dueOn < asOf ? "font-semibold text-negative" : "text-muted",
        )}
      >
        {formatDayMonthYear(payable.dueOn) ?? "—"}
      </Cell>
    ),
    priority: (
      <Cell control className={NOTE_HOST}>
        {note("priority", "Estado")}
        <StyledSelect
          value={line.priority}
          items={PRIORITY_OPTIONS}
          onValueChange={(priority) => {
            if (priority) onPatch(payable.id, { priority: priority as PayPriority });
          }}
        >
          <SelectTrigger size="sm" aria-label={`Estado de ${payable.supplier}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectGroup>
              {PRIORITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </StyledSelect>
      </Cell>
    ),
    account: (
      <Cell control className={NOTE_HOST}>
        {note("account", "Cuenta")}
        <AccountPicker
          variant="cell"
          label={`Cuenta que paga ${payable.supplier}`}
          value={payable.payFromAccountId}
          onChange={(accountId) => onPatch(payable.id, { payFromAccountId: accountId })}
        />
      </Cell>
    ),
    payOn: (
      <Cell control className={NOTE_HOST}>
        {note("payOn", "Fecha de pago")}
        <DateField
          value={payable.payOn}
          nullable
          variant="cell"
          placeholder="—"
          ariaLabel={`Fecha de pago de ${payable.supplier}`}
          onChange={(payOn) => onPatch(payable.id, { payOn })}
        />
      </Cell>
    ),
    balance: (
      <FlowFigureCell
        numeric
        section="payments"
        row={payable.id}
        column="Saldo"
        label={`Saldo de ${payable.supplier}`}
      >
        {money(payable.balance)}
      </FlowFigureCell>
    ),
    urgent: (
      <Cell numeric control={urgentEditable} className={cn(URGENT_GROUND, NOTE_HOST)}>
        {note("urgent", "Urgente")}
        {urgentEditable ? (
          <NumericInput
            value={line.urgent}
            nullable
            format="amount"
            placeholder="0.00"
            ariaLabel={`Urgente de ${payable.supplier}`}
            onCommit={commitAmount}
            className="font-bold"
          />
        ) : (
          <span className="font-bold text-ink">{line.urgent > 0 ? money(line.urgent) : ""}</span>
        )}
      </Cell>
    ),
    pending: (
      <Cell numeric control={!urgentEditable} className={cn(PENDING_GROUND, NOTE_HOST)}>
        {note("pending", "Pendiente")}
        {urgentEditable ? (
          <span className="text-faint">{line.pending > 0 ? money(line.pending) : ""}</span>
        ) : (
          <NumericInput
            value={line.pending}
            nullable
            format="amount"
            placeholder="0.00"
            ariaLabel={`Pendiente de ${payable.supplier}`}
            onCommit={commitAmount}
          />
        )}
      </Cell>
    ),
    actions: (
      <Cell control>
        <div className="flex items-center justify-end">
          {(isManual || isCheck) && activeClientId && (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={<CheckCircle2 size={13} />}
              aria-label={
                isCheck
                  ? `Marcar cobrado cheque de ${payable.supplier}`
                  : `Marcar pagada obligación ${payable.supplier}`
              }
              title={isCheck ? "Marcar cobrado" : "Marcar pagado"}
              onClick={() =>
                payable.source === "check"
                  ? void cashDb.settleFlowCheck(activeClientId, payable.checkId, asOf)
                  : void cashDb.settleManualObligation(activeClientId, payable.id, asOf)
              }
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<X size={13} />}
            aria-label={`Quitar ${payable.supplier} del flujo`}
            title="Quitar del flujo"
            onClick={() => onPatch(payable.id, { priority: null })}
          />
        </div>
      </Cell>
    ),
  };
  return (
    <tr className={cn("h-[42px]", startsGroup && "[&>td]:border-t-2 [&>td]:border-t-brand/40")}>
      {columns.map((column) => (
        <Fragment key={column.id}>{cells[column.id]}</Fragment>
      ))}
      {cells.actions}
    </tr>
  );
});
