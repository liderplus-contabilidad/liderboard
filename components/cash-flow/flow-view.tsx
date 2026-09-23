"use client";

import {
  ArrowRightLeft,
  CheckCircle2,
  Copy,
  Flag,
  Landmark,
  ListPlus,
  Plus,
  Scale,
  Trash2,
  TrendingUp,
  Waves,
  X,
} from "lucide-react";
import { memo, type ReactNode, useCallback, useMemo, useState } from "react";
import { Cell, HeadCell } from "@/components/data-table/grid-cells";
import { DataGrid, GridRow } from "@/components/data-table/data-grid";
import { Button } from "@/components/ui/button";
import { CellNote, NOTE_HOST } from "@/components/ui/cell-note";
import { DateField } from "@/components/ui/date-field";
import { EmptyState } from "@/components/ui/empty-state";
import { NumericInput } from "@/components/ui/numeric-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { StatTile } from "@/components/ui/stat-tile";
import {
  balanceNoteKey,
  overdraftNoteKey,
  payableNoteKey,
  type PayableNoteField,
} from "@/lib/cash-flow/cell-notes";
import * as cashDb from "@/lib/cash-flow/db";
import {
  approvedFromTyped,
  documentLabel,
  kindLabel,
  money,
  payableDetail,
  type SupplierGroup,
} from "@/lib/cash-flow/derive";
import { accountLabel, centerName, copyFlowFrom, type FlowLine } from "@/lib/cash-flow/flow";
import { derivePaymentMatrix, type PaymentMatrix } from "@/lib/cash-flow/matrix";
import type { FlowIncome, PayPriority } from "@/lib/cash-flow/types";
import { cn } from "@/lib/cn";
import { formatDayMonthYear } from "@/lib/date";
import { pluralize } from "@/lib/format";
import { useCashFlowData } from "./cash-flow-data-provider";
import { OverdraftNotices } from "./overdraft-notices";
import { CashFlowEmptyState } from "./cash-flow-empty-state";
import { FlowCarteraPicker } from "./flow-cartera-picker";
import { ManualPayablePanel } from "./manual-payable-panel";

const NONE = "";
/** A flow without notes: one frozen object instead of a new `{}` per render. */
const NO_NOTES: Readonly<Record<string, string>> = Object.freeze({});

/** The two marks of payment each own a GROUND, the printed flow's and its Excel's too: the whole
 *  column wears it, zeros included, so urgent and pending read as two columns at a glance even on
 *  a flow with nothing urgent. */
const URGENT_GROUND = "bg-marked";
const PENDING_GROUND = "bg-surface-calc-strong";

/** The urgent is ALWAYS bold, its zeros too — it is the column read first — in plain ink: the
 *  amber is its ground, never its figures. */
const URGENT_TONE = cn(URGENT_GROUND, "font-bold text-ink");

function pendingTone(amount: number): string {
  return cn(PENDING_GROUND, amount > 0 && "font-semibold");
}

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
      <div className="flex flex-col gap-4 px-7 py-5">
        <OverdraftNotices />
        <div className="flex gap-3">
          <StatTile
            label="Total bancos"
            value={money(totals.bankTotal)}
            hint={`Saldo ${money(totals.balance)} + sobregiro ${money(totals.overdraft)}`}
          />
          {hasIncomes && <StatTile label="Total ingresos" value={money(totals.incomes)} />}
          {hasChecks && <StatTile label="Cheques no cobrados" value={money(totals.outstanding)} />}
          <StatTile
            label="Marcado para pago"
            value={money(totals.urgent + totals.pending)}
            hint={`Urgente ${money(totals.urgent)} · Pendiente ${money(totals.pending)}`}
          />
          <StatTile
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
            <DataGrid
              minWidth={
                (hasChecks ? 980 : 860) + (hasIncomes ? (incomeColumns.length + 1) * 130 : 0)
              }
            >
              <thead>
                <tr>
                  <HeadCell width={220}>Cuenta</HeadCell>
                  <HeadCell align="right" width={130}>
                    Saldo
                  </HeadCell>
                  <HeadCell align="right" width={130}>
                    Sobregiro
                  </HeadCell>
                  <HeadCell align="right">Total bancos</HeadCell>
                  {/* One column per income label, then their sum: the banks first, what comes in
                      after, and the saldo final adds the two. */}
                  {incomeColumns.map((column) => (
                    <HeadCell
                      key={column.key}
                      align="right"
                      width={130}
                      className="whitespace-normal leading-[1.2]"
                    >
                      {column.label}
                    </HeadCell>
                  ))}
                  {hasIncomes && (
                    <HeadCell align="right" width={130}>
                      Total ingresos
                    </HeadCell>
                  )}
                  {hasChecks && <HeadCell align="right">Cheques no cobr.</HeadCell>}
                  <HeadCell align="right">Urgente</HeadCell>
                  <HeadCell align="right">Pendiente</HeadCell>
                  <HeadCell align="right" sticky="right">
                    Saldo final
                  </HeadCell>
                </tr>
              </thead>
              <tbody>
                {derived.accounts.map((row) => (
                  <tr key={row.account.id}>
                    {/* One line, as the sheet's row: the account and, after the dot, its center. */}
                    <Cell>
                      <span className="block truncate font-semibold text-ink">
                        {accountLabel(row.account, [])}
                        {hasCenters && (
                          <span className="font-normal text-faint">
                            {" · "}
                            {row.account.centerId
                              ? centerName(row.account.centerId, centers)
                              : "De la empresa"}
                          </span>
                        )}
                      </span>
                    </Cell>
                    <Cell numeric control className={cn("bg-marked/40", NOTE_HOST)}>
                      <CellNote
                        note={notes[balanceNoteKey(row.account.id)]}
                        label={`Saldo de ${accountLabel(row.account, centers)}`}
                        onChange={(text) => setNote(balanceNoteKey(row.account.id), text)}
                      />
                      <NumericInput
                        value={flow?.balances[row.account.id] ?? null}
                        nullable
                        format="currency"
                        placeholder="0.00"
                        ariaLabel={`Saldo de ${accountLabel(row.account, centers)}`}
                        onCommit={(value) => setBalance(row.account.id, value)}
                      />
                    </Cell>
                    {/* The overdraft is the ACCOUNT's (it does not change from one date to the next),
                      but it is captured here, where the sheet writes it, and not only in Configurar. */}
                    <Cell numeric control className={cn("bg-marked/40", NOTE_HOST)}>
                      <CellNote
                        note={notes[overdraftNoteKey(row.account.id)]}
                        label={`Sobregiro de ${accountLabel(row.account, centers)}`}
                        onChange={(text) => setNote(overdraftNoteKey(row.account.id), text)}
                      />
                      <NumericInput
                        value={row.account.overdraft}
                        format="currency"
                        placeholder="0.00"
                        ariaLabel={`Sobregiro de ${accountLabel(row.account, centers)}`}
                        onCommit={(value) =>
                          void cashDb.updateAccount(row.account.id, { overdraft: value ?? 0 })
                        }
                      />
                    </Cell>
                    <Cell numeric strong value={row.bankTotal}>
                      {money(row.bankTotal)}
                    </Cell>
                    {incomeColumns.map((column) => (
                      <Cell key={column.key} numeric>
                        {money(column.byAccount[row.account.id] ?? 0)}
                      </Cell>
                    ))}
                    {hasIncomes && (
                      <Cell numeric strong>
                        {money(row.incomes)}
                      </Cell>
                    )}
                    {hasChecks && (
                      <Cell numeric className="text-crosslink">
                        {money(row.outstanding)}
                      </Cell>
                    )}
                    <Cell numeric className={URGENT_TONE}>
                      {money(row.urgent)}
                    </Cell>
                    <Cell numeric className={pendingTone(row.pending)}>
                      {money(row.pending)}
                    </Cell>
                    <Cell numeric strong sticky="right" value={row.remaining}>
                      {money(row.remaining)}
                    </Cell>
                  </tr>
                ))}
                {(derived.unassignedMarked.urgent > 0 ||
                  derived.unassignedMarked.pending > 0 ||
                  derived.unassignedIncomes > 0) && (
                  <GridRow muted>
                    <Cell className="text-[11.5px] text-faint" colSpan={4}>
                      Sin cuenta asignada
                    </Cell>
                    {incomeColumns.map((column) => (
                      <Cell key={column.key} numeric>
                        {money(column.unassigned)}
                      </Cell>
                    ))}
                    {hasIncomes && <Cell numeric>{money(derived.unassignedIncomes)}</Cell>}
                    {hasChecks && <Cell />}
                    <Cell numeric className={URGENT_TONE}>
                      {money(derived.unassignedMarked.urgent)}
                    </Cell>
                    <Cell numeric className={pendingTone(derived.unassignedMarked.pending)}>
                      {money(derived.unassignedMarked.pending)}
                    </Cell>
                    <Cell sticky="right" />
                  </GridRow>
                )}
                <tr className="bg-surface-sunken">
                  <Cell strong>Total</Cell>
                  <Cell numeric strong value={totals.balance}>
                    {money(totals.balance)}
                  </Cell>
                  <Cell numeric strong>
                    {money(totals.overdraft)}
                  </Cell>
                  <Cell numeric strong>
                    {money(totals.bankTotal)}
                  </Cell>
                  {incomeColumns.map((column) => (
                    <Cell key={column.key} numeric strong>
                      {money(column.total)}
                    </Cell>
                  ))}
                  {hasIncomes && (
                    <Cell numeric strong>
                      {money(totals.incomes)}
                    </Cell>
                  )}
                  {hasChecks && (
                    <Cell numeric strong className="text-crosslink">
                      {money(totals.outstanding)}
                    </Cell>
                  )}
                  <Cell numeric className={URGENT_TONE}>
                    {money(totals.urgent)}
                  </Cell>
                  <Cell numeric strong>
                    {money(totals.pending)}
                  </Cell>
                  <Cell numeric strong sticky="right" value={totals.remaining}>
                    {money(totals.remaining)}
                  </Cell>
                </tr>
              </tbody>
            </DataGrid>
          )}
        </FlowSection>

        {!asMatrix && (
          <MarkedSection
            notes={notes}
            onNote={setNote}
            onPickFromCartera={openPicker}
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
                  className="rounded-[9px] border border-border bg-surface-muted px-3 py-1.5 text-[12.5px] tabular-nums"
                >
                  <span className="font-semibold text-ink">
                    {centerName(loan.fromCenterId, centers)} →{" "}
                    {centerName(loan.toCenterId, centers)}
                  </span>
                  <span className="ml-2 text-brand">{money(loan.amount)}</span>
                </li>
              ))}
            </ul>
          </FlowSection>
        )}
      </div>
      <FlowCarteraPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
      {manualOpen && <ManualPayablePanel markAs="urgent" onClose={() => setManualOpen(false)} />}
    </CashFlowEmptyState>
  );
}

/**
 * COMISERSA's `FLUJO MATRIZ` on screen: the bank figures, one column per beneficiario, what each
 * account pays and what it keeps. Read-only (`matrix.ts` says why); the first column and the last
 * stay in view while the beneficiarios scroll under them.
 */
function PaymentMatrixTable({ matrix }: { matrix: PaymentMatrix }) {
  const hasIncomes = matrix.incomeColumns.length > 0;
  const leading =
    3 + (hasIncomes ? matrix.incomeColumns.length + 1 : 0) + (matrix.hasChecks ? 1 : 0);
  return (
    <DataGrid minWidth={480 + leading * 120 + matrix.beneficiaries.length * 130}>
      <thead>
        <tr>
          <HeadCell sticky="left" width={220}>
            Cuenta
          </HeadCell>
          <HeadCell align="right" width={120}>
            Saldo
          </HeadCell>
          <HeadCell align="right" width={120}>
            Sobregiro
          </HeadCell>
          <HeadCell align="right" width={120}>
            Total bancos
          </HeadCell>
          {matrix.incomeColumns.map((column) => (
            <HeadCell
              key={column.key}
              align="right"
              width={120}
              className="whitespace-normal leading-[1.2]"
            >
              {column.label}
            </HeadCell>
          ))}
          {hasIncomes && (
            <HeadCell align="right" width={120}>
              Total ingresos
            </HeadCell>
          )}
          {matrix.hasChecks && (
            <HeadCell align="right" width={120}>
              Cheques no cobr.
            </HeadCell>
          )}
          {matrix.beneficiaries.map((column) => (
            <HeadCell
              key={column.key}
              align="right"
              width={130}
              className="whitespace-normal leading-[1.2]"
            >
              {column.label}
            </HeadCell>
          ))}
          <HeadCell align="right" width={130}>
            Total marcado
          </HeadCell>
          <HeadCell align="right" width={130} sticky="right">
            Saldo final
          </HeadCell>
        </tr>
      </thead>
      <tbody>
        {matrix.rows.map((row) => {
          const total = row.kind === "total";
          const loose = row.kind === "unassigned";
          const cells = (
            <>
              <Cell
                sticky="left"
                strong={total}
                className={loose ? "text-[11.5px] text-faint" : "font-semibold text-ink"}
              >
                {row.label}
              </Cell>
              <Cell numeric strong={total}>
                {loose ? "" : money(row.bank.balance)}
              </Cell>
              <Cell numeric strong={total}>
                {loose ? "" : money(row.bank.overdraft)}
              </Cell>
              <Cell numeric strong={total}>
                {loose ? "" : money(row.bank.bankTotal)}
              </Cell>
              {matrix.incomeColumns.map((column) => (
                <Cell key={column.key} numeric strong={total}>
                  {money(row.bank.incomeCells[column.key] ?? 0)}
                </Cell>
              ))}
              {hasIncomes && (
                <Cell numeric strong>
                  {money(row.bank.incomes)}
                </Cell>
              )}
              {matrix.hasChecks && (
                <Cell numeric strong={total}>
                  {loose ? "" : money(row.bank.outstanding)}
                </Cell>
              )}
              {matrix.beneficiaries.map((column) => {
                const value = row.cells[column.key] ?? 0;
                return (
                  <Cell
                    key={column.key}
                    numeric
                    strong={total}
                    className={value > 0 ? "text-warning" : "text-faint"}
                  >
                    {value > 0 ? money(value) : "—"}
                  </Cell>
                );
              })}
              <Cell numeric strong className="text-warning">
                {money(row.marked)}
              </Cell>
              <Cell
                numeric
                strong
                sticky="right"
                {...(row.remaining !== null ? { value: row.remaining } : {})}
              >
                {row.remaining === null ? "" : money(row.remaining)}
              </Cell>
            </>
          );
          return total ? (
            <tr key={row.id} className="bg-surface-muted">
              {cells}
            </tr>
          ) : (
            <GridRow key={row.id} muted={loose}>
              {cells}
            </GridRow>
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
  const { derived } = useCashFlowData();
  if (derived.settled.length === 0) {
    return null;
  }
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
          </colgroup>
          <thead>
            <tr>
              <HeadCell>Proveedor · documento</HeadCell>
              <HeadCell>Pagado el</HeadCell>
              <HeadCell align="right">Monto</HeadCell>
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
                <Cell numeric className="text-positive">
                  {money(payable.balance)}
                </Cell>
              </tr>
            ))}
            <tr className="bg-surface-sunken">
              <Cell strong colSpan={2}>
                Total pagado
              </Cell>
              <Cell numeric strong className="text-positive">
                {money(derived.settledTotal)}
              </Cell>
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
    <StatTile
      label={
        value < 0
          ? `Saldo faltante · ${label.toLowerCase()}`
          : `Saldo sobrante · ${label.toLowerCase()}`
      }
      value={money(Math.abs(value))}
      sign={value < 0 ? "negativo" : "positivo"}
    />
  );
}

/** One income line: etiqueta · monto · cuenta · quitar — the header row reads the same grid. The
 *  three fields SHARE the width (2 : 1 : 1), so the card is filled and no field sits far from the
 *  others. */
const INCOME_ROW = "grid items-center gap-3";
const INCOME_COLUMNS = "grid-cols-[minmax(0,2fr)_minmax(160px,1fr)_minmax(200px,1fr)_auto]";
/** With ONE account there is nothing to choose: no «Cuenta» column, and the monto takes its share. */
const INCOME_COLUMNS_ONE_ACCOUNT = "grid-cols-[minmax(0,2fr)_minmax(160px,1fr)_auto]";
/** A typed field of the line: a box with its border, so what can be written is seen at once. */
const INCOME_FIELD =
  "rounded-lg border border-border bg-surface px-[9px] py-1.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand";

function IncomesSection({
  incomes,
  onChange,
}: {
  incomes: FlowIncome[];
  onChange: (incomes: FlowIncome[]) => void;
}) {
  const { accounts, centers } = useCashFlowData();
  const options = [
    { value: NONE, label: "Sin cuenta" },
    ...accounts.map((account) => ({ value: account.id, label: accountLabel(account, centers) })),
  ];
  const update = (id: string, patch: Partial<FlowIncome>) =>
    onChange(incomes.map((income) => (income.id === id ? { ...income, ...patch } : income)));
  const total = incomes.reduce((acc, income) => acc + income.amount, 0);
  const choosesAccount = accounts.length > 1;
  const row = cn(INCOME_ROW, choosesAccount ? INCOME_COLUMNS : INCOME_COLUMNS_ONE_ACCOUNT);

  return (
    <FlowSection>
      <SectionHeading icon={<TrendingUp size={15} />} title="Ingresos">
        <span className="text-[13px] font-semibold tabular-nums text-brand">{money(total)}</span>
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={13} />}
          onClick={() =>
            onChange([
              ...incomes,
              {
                id: crypto.randomUUID(),
                concept: "",
                amount: 0,
                accountId: accounts.length === 1 ? accounts[0].id : null,
              },
            ])
          }
        >
          Agregar
        </Button>
      </SectionHeading>
      {incomes.length > 0 && (
        <ul className="divide-y divide-border-soft rounded-[13px] border border-border bg-surface px-4 py-1">
          {/* The fields are named once, above, so the amount reads as a field and not as a figure.
              Every name starts where its field's text starts (the fields' 9 px): a right-aligned
              «Monto» ran into the «Cuenta» beside it and read as one label. */}
          <li
            aria-hidden
            className={cn(
              row,
              "pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint [&>span]:px-[9px]",
            )}
          >
            <span>Etiqueta</span>
            <span>Monto</span>
            {choosesAccount && <span>Cuenta</span>}
            <span />
          </li>
          {incomes.map((income) => (
            <li key={income.id} className={cn(row, "py-1.5")}>
              <input
                defaultValue={income.concept}
                placeholder="Etiqueta (p. ej. Reservas)"
                aria-label="Etiqueta del ingreso"
                onBlur={(event) =>
                  event.target.value !== income.concept &&
                  update(income.id, { concept: event.target.value })
                }
                className={cn(INCOME_FIELD, "font-sans")}
              />
              <NumericInput
                value={income.amount}
                format="currency"
                ariaLabel="Monto del ingreso"
                placeholder="0.00"
                onCommit={(value) => update(income.id, { amount: value ?? 0 })}
                className={INCOME_FIELD}
              />
              {choosesAccount && (
                <Select
                  size="sm"
                  aria-label="Cuenta del ingreso"
                  value={income.accountId ?? NONE}
                  options={options}
                  onChange={(event) => update(income.id, { accountId: event.target.value || null })}
                />
              )}
              <Button
                variant="danger"
                size="sm"
                iconOnly
                icon={<Trash2 size={13} />}
                aria-label="Quitar ingreso"
                onClick={() => onChange(incomes.filter((row) => row.id !== income.id))}
              />
            </li>
          ))}
        </ul>
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
 * mark Cuentas por pagar writes, never a copy: the flow stores nothing of it.
 *
 * Of Urgente and Pendiente the EDITABLE cell is the one the priority makes editable; the other is
 * what `markedSplit` leaves. Both write `approved` through `approvedFromTyped` (the saldo itself is
 * the whole, stored as `null`).
 */
function MarkedSection({
  notes,
  onNote,
  onPickFromCartera,
  onAddManual,
}: {
  notes: Readonly<Record<string, string>>;
  onNote: NoteWriter;
  onPickFromCartera: () => void;
  onAddManual: () => void;
}) {
  const { derived, accounts, centers, asOf } = useCashFlowData();
  const accountOptions = useMemo(
    () => [
      { value: NONE, label: "Sin cuenta" },
      ...accounts.map((account) => ({ value: account.id, label: accountLabel(account, centers) })),
    ],
    [accounts, centers],
  );
  const lineById = useMemo(
    () => new Map(derived.lines.map((line) => [line.payable.id, line])),
    [derived.lines],
  );
  const patch = useCallback((id: string, fields: cashDb.PayablePatch) => {
    void cashDb.updatePayable(id, fields);
  }, []);
  const total = derived.totals.urgent + derived.totals.pending;
  const adders = (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={<ListPlus size={13} />}
        onClick={onPickFromCartera}
      >
        Agregar de la cartera
      </Button>
      <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={onAddManual}>
        Agregar obligación
      </Button>
    </>
  );

  return (
    <FlowSection>
      <SectionHeading
        icon={<Flag size={15} />}
        title="Pagos marcados"
        hint={pluralize(derived.lines.length, "documento")}
      >
        {adders}
      </SectionHeading>
      {derived.groups.length === 0 ? (
        <EmptyState icon={<Flag size={22} />}>
          <span className="flex flex-col items-center gap-3 text-center">
            <span>Sin pagos marcados.</span>
            <span className="flex items-center gap-2">{adders}</span>
          </span>
        </EmptyState>
      ) : (
        <DataGrid minWidth={1260} className="table-fixed">
          {/* The fixed columns take 970 px; the document keeps at least ~290 px, and below that the
              grid scrolls sideways rather than squeezing the detail into a column of words. */}
          <colgroup>
            <col />
            <col style={{ width: 96 }} />
            <col style={{ width: 132 }} />
            <col style={{ width: 210 }} />
            <col style={{ width: 128 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 124 }} />
            <col style={{ width: 124 }} />
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <HeadCell>Proveedor · documento</HeadCell>
              <HeadCell>Vence</HeadCell>
              <HeadCell>Estado</HeadCell>
              <HeadCell>Cuenta</HeadCell>
              <HeadCell>Fecha de pago</HeadCell>
              <HeadCell align="right">Saldo</HeadCell>
              <HeadCell align="right">Urgente</HeadCell>
              <HeadCell align="right">Pendiente</HeadCell>
              <HeadCell />
            </tr>
          </thead>
          <tbody>
            {derived.groups.map((group) => (
              <GroupRows
                key={group.key}
                group={group}
                asOf={asOf}
                accountOptions={accountOptions}
                lineById={lineById}
                notes={notes}
                onNote={onNote}
                onPatch={patch}
              />
            ))}
            <tr className="bg-brand text-white">
              <Cell
                colSpan={5}
                className="border-b-0 py-3 text-[13px] font-bold uppercase tracking-[0.4px] text-white"
              >
                Total
              </Cell>
              <Cell numeric className="border-b-0 py-3 text-[14px] font-bold text-white">
                {money(total)}
              </Cell>
              <Cell numeric className="border-b-0 py-3 text-[14px] font-bold text-white">
                {money(derived.totals.urgent)}
              </Cell>
              <Cell numeric className="border-b-0 py-3 text-[14px] font-bold text-white">
                {money(derived.totals.pending)}
              </Cell>
              <Cell className="border-b-0" />
            </tr>
          </tbody>
        </DataGrid>
      )}
    </FlowSection>
  );
}

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgente" },
  { value: "pending", label: "Pendiente" },
];

function GroupRows({
  group,
  asOf,
  accountOptions,
  lineById,
  notes,
  onNote,
  onPatch,
}: {
  group: SupplierGroup;
  asOf: string;
  accountOptions: { value: string; label: string }[];
  lineById: Map<string, FlowLine>;
  notes: Readonly<Record<string, string>>;
  onNote: NoteWriter;
  onPatch: (id: string, fields: cashDb.PayablePatch) => void;
}) {
  const sum = (key: "urgent" | "pending") =>
    group.payables.reduce((acc, payable) => acc + (lineById.get(payable.id)?.[key] ?? 0), 0);
  const urgent = sum("urgent");
  const pending = sum("pending");
  return (
    <>
      <GridRow muted>
        <Cell className="font-semibold text-ink" colSpan={5}>
          {group.label}
          {group.payables[0]?.kind && (
            <span className="ml-2 text-[11px] font-normal text-faint">
              {kindLabel(group.payables[0].kind)}
            </span>
          )}
        </Cell>
        <Cell numeric strong value={urgent + pending}>
          {money(urgent + pending)}
        </Cell>
        {/* The two marks' columns run unbroken through the supplier's heading, as on paper. */}
        <Cell numeric className={URGENT_TONE}>
          {urgent > 0 ? money(urgent) : ""}
        </Cell>
        <Cell numeric className={cn(PENDING_GROUND, "font-semibold text-ink")}>
          {pending > 0 ? money(pending) : ""}
        </Cell>
        <Cell />
      </GridRow>
      {group.payables.map((payable) => {
        const line = lineById.get(payable.id);
        return line ? (
          <MarkedRow
            key={payable.id}
            line={line}
            asOf={asOf}
            accountOptions={accountOptions}
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
  asOf,
  accountOptions,
  notes,
  onNote,
  onPatch,
}: {
  line: FlowLine;
  asOf: string;
  accountOptions: { value: string; label: string }[];
  notes: Readonly<Record<string, string>>;
  onNote: NoteWriter;
  onPatch: (id: string, fields: cashDb.PayablePatch) => void;
}) {
  const { payable } = line;
  const docLabel = documentLabel(payable) || payable.supplier;
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
  return (
    <tr className="h-[42px]">
      {/* The sheet's «PAGOS PENDIENTES» cell: the number and what it is for. On one line where it
          fits; where it does not, the detail WRAPS under the number instead of being clipped — what
          a payment is for is read before paying it, on any screen. */}
      <Cell className="pl-7">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-0.5">
          <span className="shrink-0 whitespace-nowrap font-mono text-[12px] text-ink">
            {docLabel}
          </span>
          {detail && (
            <span className="min-w-0 break-words text-[11.5px] leading-[1.35] text-muted">
              {detail}
            </span>
          )}
        </span>
      </Cell>
      <Cell
        className={cn(
          "tabular-nums",
          payable.dueOn && payable.dueOn < asOf ? "font-semibold text-negative" : "text-muted",
        )}
      >
        {formatDayMonthYear(payable.dueOn) ?? "—"}
      </Cell>
      <Cell control className={NOTE_HOST}>
        {note("priority", "Estado")}
        <Select
          size="sm"
          aria-label={`Estado de ${payable.supplier}`}
          value={line.priority}
          options={PRIORITY_OPTIONS}
          onChange={(event) => onPatch(payable.id, { priority: event.target.value as PayPriority })}
        />
      </Cell>
      <Cell control className={NOTE_HOST}>
        {note("account", "Cuenta")}
        <Select
          size="sm"
          aria-label={`Cuenta que paga ${payable.supplier}`}
          value={payable.payFromAccountId ?? NONE}
          options={accountOptions}
          onChange={(event) =>
            onPatch(payable.id, { payFromAccountId: event.target.value || null })
          }
        />
      </Cell>
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
      <Cell numeric>{money(payable.balance)}</Cell>
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
      <Cell control>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={<X size={13} />}
          aria-label={`Quitar ${payable.supplier} del flujo`}
          title="Quitar del flujo"
          onClick={() => onPatch(payable.id, { priority: null })}
        />
      </Cell>
    </tr>
  );
});
