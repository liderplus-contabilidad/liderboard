"use client";

import { Cell, HeadCell } from "@/components/data-table/grid-cells";
import { DataGrid } from "@/components/data-table/data-grid";
import { CellNote, NOTE_HOST } from "@/components/ui/cell-note";
import { NumericInput } from "@/components/ui/numeric-input";
import { balanceNoteKey, overdraftNoteKey } from "@/lib/cash-flow/cell-notes";
import * as cashDb from "@/lib/cash-flow/db";
import { money } from "@/lib/cash-flow/derive";
import { accountLabel, type DerivedFlow } from "@/lib/cash-flow/flow";
import { cn } from "@/lib/cn";
import { FlowFigureCell } from "./flow-figure-note";
import { useCashFlowData } from "./cash-flow-data-provider";

type BankRow = DerivedFlow["accounts"][number];

/** Concepts grow downwards; captures stay under the account they belong to. */
export function FlowBankTable({
  notes,
  onNote,
  onBalance,
}: {
  notes: Readonly<Record<string, string>>;
  onNote: (key: string, text: string) => void;
  onBalance: (id: string, value: number | null) => void;
}) {
  const { derived, flow, centers, checks } = useCashFlowData();
  const { totals } = derived;
  const loose =
    derived.unassignedMarked.urgent > 0 ||
    derived.unassignedMarked.pending > 0 ||
    derived.unassignedIncomes > 0;
  const rows: {
    id: string;
    label: string;
    value: (row: BankRow) => number;
    total: number;
    loose?: number;
    capture?: "balance" | "overdraft";
    ground?: string;
    strong?: boolean;
  }[] = [
    {
      id: "balance",
      label: "Saldo",
      value: (r) => r.balance,
      total: totals.balance,
      capture: "balance",
    },
    {
      id: "overdraft",
      label: "Sobregiro",
      value: (r) => r.account.overdraft,
      total: totals.overdraft,
      capture: "overdraft",
    },
    {
      id: "bankTotal",
      label: "Total bancos",
      value: (r) => r.bankTotal,
      total: totals.bankTotal,
      strong: true,
      ground: "bg-brand [&>td]:bg-brand [&>td]:text-white",
    },
    ...derived.incomeColumns.map((column) => ({
      id: `income-${column.key}`,
      label: column.label,
      value: (r: BankRow) => column.byAccount[r.account.id] ?? 0,
      total: column.total,
      loose: column.unassigned,
    })),
    ...(derived.incomeColumns.length
      ? [
          {
            id: "incomes",
            label: "Total ingresos",
            value: (r: BankRow) => r.incomes,
            total: totals.incomes,
            loose: derived.unassignedIncomes,
            strong: true,
            ground: "bg-brand [&>td]:bg-brand [&>td]:text-white",
          },
        ]
      : []),
    ...(checks.length
      ? [
          {
            id: "checks",
            label: "Cheques no cobrados",
            value: (r: BankRow) => r.outstanding,
            total: totals.outstanding,
          },
        ]
      : []),
    {
      id: "urgent",
      label: "Urgente",
      value: (r) => r.urgent,
      total: totals.urgent,
      loose: derived.unassignedMarked.urgent,
      ground: "bg-urgent [&>td]:bg-urgent",
    },
    {
      id: "pending",
      label: "Pendiente",
      value: (r) => r.pending,
      total: totals.pending,
      loose: derived.unassignedMarked.pending,
      ground: "bg-surface-calc-strong [&>td]:bg-surface-calc-strong",
    },
    {
      id: "remaining",
      label: "Saldo final",
      value: (r) => r.remaining,
      total: totals.remaining,
      strong: true,
      ground: "bg-brand [&>td]:bg-brand [&>td]:text-white",
    },
  ];
  const accounts = derived.accounts;
  const showLoose = loose;
  return (
    <DataGrid minWidth={240 + (accounts.length + (showLoose ? 1 : 0) + 1) * 130}>
      <thead>
        <tr>
          <HeadCell sticky="left" width={240}>
            Concepto
          </HeadCell>
          {accounts.map((row) => (
            <HeadCell key={row.account.id} align="right" width={130} className="whitespace-normal">
              {accountLabel(row.account, centers)}
            </HeadCell>
          ))}
          {showLoose && (
            <HeadCell align="right" width={130}>
              Sin cuenta
            </HeadCell>
          )}
          <HeadCell sticky="right" align="right" width={130}>
            Total
          </HeadCell>
        </tr>
      </thead>
      <tbody>
        {rows.map((concept) => (
          <tr key={concept.id} className={concept.ground}>
            <Cell
              sticky="left"
              strong={concept.strong}
              className={cn("font-semibold", concept.ground)}
            >
              {concept.label}
            </Cell>
            {accounts.map((row) => {
              const name = accountLabel(row.account, centers);
              if (concept.capture) {
                const balance = concept.capture === "balance";
                const key = balance
                  ? balanceNoteKey(row.account.id)
                  : overdraftNoteKey(row.account.id);
                return (
                  <Cell key={row.account.id} numeric control className={NOTE_HOST}>
                    <CellNote
                      note={notes[key]}
                      label={`${concept.label} de ${name}`}
                      onChange={(text) => onNote(key, text)}
                    />
                    <NumericInput
                      value={
                        balance ? (flow?.balances[row.account.id] ?? null) : row.account.overdraft
                      }
                      nullable={balance}
                      format="currency"
                      placeholder="0.00"
                      ariaLabel={`${concept.label} de ${name}`}
                      onCommit={(value) =>
                        balance
                          ? onBalance(row.account.id, value)
                          : void cashDb.updateAccount(row.account.id, {
                              overdraft: value ?? 0,
                            })
                      }
                    />
                  </Cell>
                );
              }
              return (
                <FlowFigureCell
                  section="accounts"
                  row={row.account.id}
                  column={concept.label}
                  label={`${concept.label} de ${name}`}
                  key={row.account.id}
                  numeric
                  value={concept.value(row)}
                >
                  {money(concept.value(row))}
                </FlowFigureCell>
              );
            })}
            {showLoose &&
              (concept.loose === undefined ? (
                <Cell numeric>—</Cell>
              ) : (
                <FlowFigureCell
                  numeric
                  section="accounts"
                  row="unassigned"
                  column={concept.label}
                  label={`${concept.label} sin cuenta`}
                >
                  {money(concept.loose)}
                </FlowFigureCell>
              ))}
            <FlowFigureCell
              section="accounts"
              row="total"
              column={concept.label}
              label={`Total ${concept.label.toLowerCase()}`}
              numeric
              sticky="right"
              value={concept.total}
              className={
                concept.label === "Urgente"
                  ? "!bg-urgent-total !text-white"
                  : concept.label === "Pendiente"
                    ? "!bg-pending-total !text-white"
                    : concept.ground
              }
            >
              {money(concept.total)}
            </FlowFigureCell>
          </tr>
        ))}
      </tbody>
    </DataGrid>
  );
}
