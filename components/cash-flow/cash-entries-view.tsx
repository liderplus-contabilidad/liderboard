"use client";

import { Coins, Plus, Trash2 } from "lucide-react";
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { Cell, HeadCell } from "@/components/data-table/grid-cells";
import { DataGrid, GridRow } from "@/components/data-table/data-grid";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { EmptyState } from "@/components/ui/empty-state";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select } from "@/components/ui/select";
import {
  CASH_AMOUNT_KEY,
  isValidLoan,
  loanColumnId,
  type CashColumn,
  type CashRow,
  type CashSection,
} from "@/lib/cash-flow/cash-entries";
import * as cashDb from "@/lib/cash-flow/db";
import { money } from "@/lib/cash-flow/derive";
import type { CashEntry, CashFlowCenter, CashLoan, CashSectionId } from "@/lib/cash-flow/types";
import { formatDayMonthYear } from "@/lib/date";
import { useCashFlowData } from "./cash-flow-data-provider";
import { CashFlowEmptyState } from "./cash-flow-empty-state";
import { PayableDetailPanel } from "./payable-detail-panel";

const NONE = "";

const SECTION_HINTS: Record<CashSection["id"], string> = {
  initial: "Lo que abre el período en caja: préstamos entre centros, saldos iniciales.",
  misc: "Bonos, sueldos y otros pagos por caja que no vienen de una cartera.",
  suppliers:
    "Los documentos abiertos marcados «Cash» en Cuentas por pagar, uno por proveedor. Se editan allá.",
};

/**
 * «Cargas cash»: the book's sheet, three matrices with the same columns (`deriveCashMatrix`). The
 * two hand-written ones edit IN LINE — a date, a detail, a monto per center, the loan and an
 * observation on the same row, saved as each cell loses focus — because for a table of ten rows of
 * three fields a drawer per cell is slower than the Excel it replaces. PROVEEDORES is read off the
 * cartera and edits nowhere here: its row opens the document's detail, where the mark lives.
 *
 * Nothing is stored but the typed rows (`db.cashEntries`); every total and the third matrix are
 * derived on each render. The cut date does not touch this tab: it is a live list.
 */
export function CashEntriesView() {
  const { activeClientId, centers, cashMatrix, payables } = useCashFlowData();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = useMemo(
    () => (openId ? (payables.find((payable) => payable.id === openId) ?? null) : null),
    [payables, openId],
  );

  const addRow = useCallback(
    (section: CashSectionId) => {
      if (activeClientId) {
        void cashDb.addCashEntry(activeClientId, section);
      }
    },
    [activeClientId],
  );
  const openSupplier = useCallback((row: CashRow) => {
    setOpenId(row.payableIds?.[0] ?? null);
  }, []);

  if (!activeClientId) {
    return <CashFlowEmptyState />;
  }

  return (
    <CashFlowEmptyState>
      <div className="flex flex-col gap-6 px-7 py-5">
        {cashMatrix.sections.map((section) =>
          section.id === "suppliers" ? (
            <SuppliersSection key={section.id} section={section} onOpen={openSupplier} />
          ) : (
            <ManualSection
              key={section.id}
              section={section}
              centers={centers}
              onAdd={() => addRow(section.id as CashSectionId)}
            />
          ),
        )}
      </div>
      {open && <PayableDetailPanel payable={open} onClose={() => setOpenId(null)} />}
    </CashFlowEmptyState>
  );
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="min-w-0 flex-1">
      <h2 className="text-[13.5px] font-bold text-ink">{title}</h2>
      {hint && <p className="mt-0.5 text-[11.5px] text-faint">{hint}</p>}
    </div>
  );
}

/** The column headers the three matrices share: FECHA · DETALLE · the matrix's · OBSERVACIÓN. */
function MatrixHead({ columns, trailing }: { columns: CashColumn[]; trailing?: ReactNode }) {
  return (
    <thead>
      <tr>
        <HeadCell width={150}>Fecha</HeadCell>
        <HeadCell width={260}>Detalle</HeadCell>
        {columns.map((column) => (
          <HeadCell key={column.id} align="right" width={130}>
            {column.label}
          </HeadCell>
        ))}
        {trailing}
        <HeadCell width={220}>Observación</HeadCell>
        <HeadCell width={44} />
      </tr>
    </thead>
  );
}

/** The TOTAL row the sheet paints green: a figure under every column of the matrix. */
function TotalsRow({ section, span }: { section: CashSection; span: number }) {
  return (
    <tr className="bg-surface-sunken">
      <Cell strong colSpan={2}>
        Total
      </Cell>
      {section.columns.map((column) => (
        <Cell key={column.id} numeric strong>
          {money(section.totals[column.id] ?? 0)}
        </Cell>
      ))}
      <Cell colSpan={span} />
    </tr>
  );
}

const CELL_INPUT =
  "w-full rounded-lg border border-border bg-surface px-[9px] py-1.5 font-sans text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand";

function ManualSection({
  section,
  centers,
  onAdd,
}: {
  section: CashSection;
  centers: CashFlowCenter[];
  onAdd: () => void;
}) {
  const hasCenters = centers.length > 0;
  // With centers the loan is edited in a column of its own (de → a · monto), after the matrix's
  // read-only loan columns and before the observation.
  const trailingSpan = hasCenters ? 3 : 2;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <SectionHeading title={section.title} hint={SECTION_HINTS[section.id]} />
        <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={onAdd}>
          Agregar fila
        </Button>
      </div>
      <DataGrid minWidth={hasCenters ? 1180 : 820}>
        <MatrixHead
          columns={section.columns}
          trailing={hasCenters ? <HeadCell width={300}>Préstamo</HeadCell> : undefined}
        />
        <tbody>
          {section.rows.length === 0 && (
            <GridRow muted>
              <Cell
                colSpan={section.columns.length + trailingSpan + 2}
                className="text-[12px] text-faint"
              >
                Sin filas. «Agregar fila» abre una con la fecha de hoy.
              </Cell>
            </GridRow>
          )}
          {section.rows.map((row) =>
            row.entry ? (
              <ManualRow
                key={row.id}
                entry={row.entry}
                columns={section.columns}
                centers={centers}
              />
            ) : null,
          )}
          <TotalsRow section={section} span={trailingSpan} />
        </tbody>
      </DataGrid>
    </section>
  );
}

const ManualRow = memo(function ManualRow({
  entry,
  columns,
  centers,
}: {
  entry: CashEntry;
  columns: CashColumn[];
  centers: CashFlowCenter[];
}) {
  const patch = useCallback(
    (update: Parameters<typeof cashDb.updateCashEntry>[1]) =>
      void cashDb.updateCashEntry(entry.id, update),
    [entry.id],
  );
  const setAmount = useCallback(
    (key: string, value: number | null) => {
      const amounts = { ...entry.amounts };
      if (value) {
        amounts[key] = value;
      } else {
        delete amounts[key];
      }
      patch({ amounts });
    },
    [entry.amounts, patch],
  );
  const setLoan = useCallback(
    (update: Partial<CashLoan>) => {
      const next: CashLoan = {
        fromCenterId: entry.loan?.fromCenterId ?? NONE,
        toCenterId: entry.loan?.toCenterId ?? NONE,
        amount: entry.loan?.amount ?? 0,
        ...update,
      };
      // A loan with no ends and no amount is no loan: the row goes back to `null`.
      patch({
        loan: next.fromCenterId || next.toCenterId || next.amount ? next : null,
      });
    },
    [entry.loan, patch],
  );
  const hasCenters = centers.length > 0;
  const centerOptions = [
    { value: NONE, label: "—" },
    ...centers.map((center) => ({ value: center.id, label: center.name })),
  ];
  const loan = isValidLoan(entry.loan, centers) ? entry.loan : null;

  return (
    <tr>
      <Cell className="p-1">
        <DateField
          value={entry.date}
          variant="cell"
          ariaLabel="Fecha"
          onChange={(date) => date && patch({ date })}
        />
      </Cell>
      <Cell className="p-1">
        <input
          defaultValue={entry.detail}
          placeholder="Detalle"
          aria-label="Detalle"
          onBlur={(event) =>
            event.target.value !== entry.detail && patch({ detail: event.target.value })
          }
          className={CELL_INPUT}
        />
      </Cell>
      {columns.map((column) =>
        column.kind === "loan" ? (
          // The loan's column is READ: its figure comes from the row's loan, edited beside.
          <Cell key={column.id} numeric tone="muted">
            {loan && loanColumnId(loan) === column.id ? money(loan.amount) : ""}
          </Cell>
        ) : (
          <Cell key={column.id} numeric className="bg-marked/40 p-1">
            <NumericInput
              value={entry.amounts[column.id] ?? null}
              nullable
              format="amount"
              placeholder="0.00"
              ariaLabel={`${column.label} de ${entry.detail || "la fila"}`}
              onCommit={(value) => setAmount(hasCenters ? column.id : CASH_AMOUNT_KEY, value)}
            />
          </Cell>
        ),
      )}
      {hasCenters && (
        <Cell className="p-1">
          <div className="grid grid-cols-[1fr_1fr_110px] items-center gap-1">
            <Select
              size="sm"
              aria-label="Préstamo de"
              value={entry.loan?.fromCenterId ?? NONE}
              options={centerOptions}
              onChange={(event) => setLoan({ fromCenterId: event.target.value })}
            />
            <Select
              size="sm"
              aria-label="Préstamo a"
              value={entry.loan?.toCenterId ?? NONE}
              options={centerOptions}
              onChange={(event) => setLoan({ toCenterId: event.target.value })}
            />
            <NumericInput
              value={entry.loan?.amount || null}
              nullable
              format="amount"
              placeholder="0.00"
              ariaLabel="Monto del préstamo"
              onCommit={(value) => setLoan({ amount: value ?? 0 })}
            />
          </div>
        </Cell>
      )}
      <Cell className="p-1">
        <input
          defaultValue={entry.observation}
          placeholder="Observación"
          aria-label="Observación"
          onBlur={(event) =>
            event.target.value !== entry.observation && patch({ observation: event.target.value })
          }
          className={CELL_INPUT}
        />
      </Cell>
      <Cell className="p-1">
        <Button
          variant="danger"
          size="sm"
          iconOnly
          icon={<Trash2 size={13} />}
          aria-label="Quitar fila"
          onClick={() => void cashDb.deleteCashEntry(entry.id)}
        />
      </Cell>
    </tr>
  );
});

function SuppliersSection({
  section,
  onOpen,
}: {
  section: CashSection;
  onOpen: (row: CashRow) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <SectionHeading title={section.title} hint={SECTION_HINTS.suppliers} />
      </div>
      {section.rows.length === 0 ? (
        <EmptyState icon={<Coins size={22} />}>
          Ningún documento marcado «Cash». Márcalos en Cuentas por pagar y aparecen aquí.
        </EmptyState>
      ) : (
        <DataGrid minWidth={820}>
          <MatrixHead columns={section.columns} />
          <tbody>
            {section.rows.map((row) => (
              <GridRow key={row.id} onClick={() => onOpen(row)}>
                <Cell className="tabular-nums" tone="muted">
                  {formatDayMonthYear(row.date) ?? row.date}
                </Cell>
                <Cell>
                  <span className="block font-semibold text-ink">{row.detail}</span>
                  {row.payableIds && row.payableIds.length > 1 && (
                    <span className="block text-[11px] text-faint">
                      {row.payableIds.length} documentos
                    </span>
                  )}
                </Cell>
                {section.columns.map((column) => (
                  <Cell key={column.id} numeric className="bg-marked/40">
                    {row.cells[column.id] !== undefined ? money(row.cells[column.id]) : ""}
                  </Cell>
                ))}
                <Cell tone="muted" />
                <Cell />
              </GridRow>
            ))}
            <TotalsRow section={section} span={2} />
          </tbody>
        </DataGrid>
      )}
    </section>
  );
}
