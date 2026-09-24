"use client";

import { useFilterState } from "@/components/dashboard/filter-state";

import { useVirtualizer } from "@tanstack/react-virtual";
import { TriangleAlert, Plus, Receipt, Upload } from "lucide-react";
import { memo, useMemo, useRef, useState } from "react";
import { Cell, HeadCell } from "@/components/data-table/grid-cells";
import { GridRow } from "@/components/data-table/data-grid";
import { Badge } from "@/components/ui/badge";
import { DateField } from "@/components/ui/date-field";
import {
  pendingCollections,
  collectionView,
  COLLECTION_FILTERS,
  type CollectionFilter,
  type CollectionOrder,
} from "@/lib/cash-flow/check-collection";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useReminderToday } from "./use-reminder-today";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { StatTile } from "@/components/ui/stat-tile";
import * as cashDb from "@/lib/cash-flow/db";
import { money } from "@/lib/cash-flow/derive";
import {
  checkStatusLabel,
  outstandingByAccount,
  stepIndex,
  unassignedBanks,
} from "@/lib/cash-flow/checks";
import { accountLabel } from "@/lib/cash-flow/flow";
import type { Check } from "@/lib/cash-flow/types";
import { cn } from "@/lib/cn";
import { formatDayMonthYear } from "@/lib/date";
import { pluralize } from "@/lib/format";
import { ConfigureClientButton } from "./cash-flow-client-actions";
import { useCashFlowData } from "./cash-flow-data-provider";
import { CashFlowEmptyState } from "./cash-flow-empty-state";
import { CheckFormPanel } from "./check-form-panel";
import { ChecksUploadModal } from "./checks-upload-modal";

/**
 * Control de cheques: the outstanding amount per account at the cut date (the figure the flow
 * subtracts), the grid of the register, and — when the loaded book named banks that matched no
 * account — the «Sin cuenta» block with its bulk assignment.
 *
 * The grid opens on the cut date's YEAR (`check-filters.ts`): twelve thousand rows since 2017 are
 * the register's history, not its reading. And even one year is hundreds of rows, so **only the
 * rows that fit the viewport are in the DOM** — the same window Datos keeps (`useVirtualizer`,
 * `CHECK_ROW_PX` per row, two spacer rows), which is what leaves it a real `<table>` with a sticky
 * `<thead>` and the native scroll.
 */

/** Fixed height includes the editable planned date and its collection warning. */
const CHECK_ROW_PX = 100;
const ROW_OVERSCAN = 12;
export function ChecksView() {
  const { activeClientId, accounts, centers, checks, visibleChecks, checkFilters, asOf } =
    useCashFlowData();
  const [openId, setOpenId] = useState<string | null | "new">(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const today = useReminderToday();
  const [collectionFilter, setCollectionFilter] = useFilterState<CollectionFilter>(
    "checks.collectionFilter",
    activeClientId,
    "all",
  );
  const [collectionOrder, setCollectionOrder] = useFilterState<CollectionOrder>(
    "checks.collectionOrder",
    activeClientId,
    "issued",
  );

  const outstanding = useMemo(() => outstandingByAccount(checks, asOf), [checks, asOf]);
  const outstandingTotal = useMemo(
    () => [...outstanding.values()].reduce((acc, value) => acc + value, 0),
    [outstanding],
  );
  const filtered =
    collectionFilter !== "all" ||
    checkFilters.accountIds.length > 0 ||
    checkFilters.steps.length > 0 ||
    checkFilters.years.length > 0 ||
    checkFilters.search.trim().length > 0;
  const unassigned = useMemo(() => unassignedBanks(checks), [checks]);
  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, accountLabel(account, centers)])),
    [accounts, centers],
  );
  const open = useMemo(
    () => (openId && openId !== "new" ? (checks.find((row) => row.id === openId) ?? null) : null),
    [checks, openId],
  );
  const { rows: sorted, counts: collectionCounts } = useMemo(
    () => collectionView(visibleChecks, today, collectionFilter, collectionOrder),
    [visibleChecks, today, collectionFilter, collectionOrder],
  );
  const visibleTotal = useMemo(
    () => sorted.filter((check) => !check.voided).reduce((acc, check) => acc + check.amount, 0),
    [sorted],
  );

  if (!activeClientId) {
    return <CashFlowEmptyState />;
  }

  // `needsAccounts={false}`: the register reads without a single account declared — what an
  // account adds is WHICH bank's figure each check moves, and until then every check sits under
  // «Sin cuenta» with the notice below, never behind an empty state.
  return (
    <CashFlowEmptyState needsAccounts={false}>
      {/* `h-full` + `min-h-0` on the table: the grid takes whatever height the panel leaves under the
          tiles and scrolls INSIDE its border, so the page itself never scrolls past it. */}
      <div className="flex h-full flex-col gap-4 px-7 py-5">
        {accounts.length === 0 && checks.length > 0 && (
          <div className="flex items-center gap-3 rounded-[13px] border border-warning/40 bg-warning/5 px-4 py-3 text-[12.5px] text-ink">
            <span className="flex-1 font-semibold">Esta empresa no tiene cuentas bancarias.</span>
            <ConfigureClientButton />
          </div>
        )}
        <div className="flex items-stretch gap-3">
          <StatTile
            label="Girados y no cobrados"
            value={money(outstandingTotal)}
            sign={outstandingTotal > 0 ? "negativo" : undefined}
          />
          {/* The sum of what is ON SCREEN, and only while a mark narrows it: with nothing marked the
              grid is the register's year and its total says nothing the tile above does not. */}
          {filtered && (
            <StatTile
              label="Total filtrado"
              value={money(visibleTotal)}
              hint={pluralize(sorted.length, "cheque")}
            />
          )}
        </div>

        {unassigned.length > 0 && <UnassignedBanks clientId={activeClientId} banks={unassigned} />}

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[13.5px] font-bold text-ink">Control de cheques</h2>
            <p className="mt-0.5 text-[11.5px] text-faint">
              {pluralize(sorted.length, "cheque")} en pantalla · {money(visibleTotal)} girados
            </p>
          </div>
          <Button
            variant="secondary"
            size="toolbar"
            icon={<Plus size={14} />}
            onClick={() => setOpenId("new")}
          >
            Nuevo cheque
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            ariaLabel="Filtrar por advertencia de cobro"
            className="flex-wrap"
            value={collectionFilter}
            options={COLLECTION_FILTERS.map(({ value, label }) => ({
              value,
              label: `${label} (${collectionCounts[value]})`,
            }))}
            onChange={(value) => {
              setCollectionFilter(value);
              if (value !== "all") setCollectionOrder("collection");
            }}
          />
          <Select
            size="sm"
            aria-label="Ordenar cheques"
            value={collectionOrder}
            options={[
              { value: "issued", label: "Orden: emisión más reciente" },
              { value: "collection", label: "Orden: cobro más próximo" },
            ]}
            onChange={(event) => setCollectionOrder(event.target.value as CollectionOrder)}
          />
          <span className="text-[11px] text-faint">
            Avisos al {formatDayMonthYear(today)} · Sobre los filtros actuales
          </span>
        </div>

        {sorted.length === 0 ? (
          <EmptyState icon={<Receipt size={22} />}>
            {checks.length === 0 ? (
              <span className="flex flex-col items-center gap-3 text-center">
                <span>Ningún cheque registrado.</span>
                <Button size="sm" icon={<Upload size={14} />} onClick={() => setUploadOpen(true)}>
                  Cargar control de cheques
                </Button>
              </span>
            ) : (
              "Ningún cheque coincide con los filtros."
            )}
          </EmptyState>
        ) : (
          <VirtualChecksTable
            key={`${collectionFilter}:${collectionOrder}`}
            sorted={sorted}
            accountNames={accountNames}
            onOpen={setOpenId}
          />
        )}
      </div>

      {openId === "new" && <CheckFormPanel check={null} onClose={() => setOpenId(null)} />}
      {open && <CheckFormPanel check={open} onClose={() => setOpenId(null)} />}
      <ChecksUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </CashFlowEmptyState>
  );
}

function VirtualChecksTable({
  sorted,
  accountNames,
  onOpen,
}: {
  sorted: Check[];
  accountNames: Map<string, string>;
  onOpen: (id: string) => void;
}) {
  const today = useReminderToday();
  const notices = useMemo(
    () => new Map(pendingCollections(sorted, today).map((notice) => [notice.check.id, notice])),
    [sorted, today],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => CHECK_ROW_PX,
    overscan: ROW_OVERSCAN,
  });
  const window = virtualizer.getVirtualItems();
  const first = window[0];
  const last = window[window.length - 1];
  const topPad = first ? first.start : 0;
  const bottomPad = last ? virtualizer.getTotalSize() - last.end : 0;

  return (
    <div className="flex min-h-[180px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
        <table
          className="w-full table-fixed border-separate border-spacing-0"
          style={{ minWidth: 1080 }}
        >
          <colgroup>
            <col style={{ width: 90 }} />
            <col style={{ width: 170 }} />
            <col />
            <col style={{ width: 100 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 240 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 170 }} />
          </colgroup>
          <thead>
            <tr>
              <HeadCell className="sticky top-0 z-[2]">Egreso</HeadCell>
              <HeadCell className="sticky top-0 z-[2]">Cuenta</HeadCell>
              <HeadCell className="sticky top-0 z-[2]">Beneficiario</HeadCell>
              <HeadCell className="sticky top-0 z-[2]">Cheque</HeadCell>
              <HeadCell className="sticky top-0 z-[2]" align="right">
                Valor
              </HeadCell>
              <HeadCell className="sticky top-0 z-[2]">Cobro / advertencia</HeadCell>
              <HeadCell className="sticky top-0 z-[2]">Emisión</HeadCell>
              <HeadCell className="sticky top-0 z-[2]">Avance</HeadCell>
            </tr>
          </thead>
          <tbody>
            {topPad > 0 && <SpacerRow height={topPad} />}
            {window.map((item) => {
              const check = sorted[item.index];
              return (
                <CheckRow
                  key={check.id}
                  check={check}
                  notice={notices.get(check.id)}
                  accountName={
                    accountNames.get(check.accountId ?? "") ?? `${check.bank || "—"} · sin cuenta`
                  }
                  onOpen={onOpen}
                />
              );
            })}
            {bottomPad > 0 && <SpacerRow height={bottomPad} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SpacerRow({ height }: { height: number }) {
  return (
    <tr aria-hidden style={{ height }}>
      <td aria-hidden />
    </tr>
  );
}

/** The four dots of the timeline plus the step's label — «Anulado» greys the lot. */
export function StepDots({ check }: { check: Pick<Check, "step" | "voided"> }) {
  const reached = stepIndex(check.step);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn(
              "size-[7px] rounded-full",
              check.voided
                ? "bg-zero"
                : index <= reached
                  ? index === 3
                    ? "bg-positive"
                    : "bg-brand"
                  : "bg-zero",
            )}
          />
        ))}
      </span>
      <span
        className={cn(
          "text-[11.5px] font-semibold",
          check.voided ? "text-faint line-through" : "text-muted",
        )}
      >
        {checkStatusLabel(check)}
      </span>
    </span>
  );
}

const CheckRow = memo(function CheckRow({
  check,
  accountName,
  notice,
  onOpen,
}: {
  check: Check;
  accountName: string;
  notice?: ReturnType<typeof pendingCollections>[number];
  onOpen: (id: string) => void;
}) {
  const [error, setError] = useState<string>();
  return (
    <GridRow
      onClick={() => onOpen(check.id)}
      className={cn("h-[100px]", check.voided && "opacity-60")}
    >
      <Cell className="font-mono text-[12px] text-muted">{check.voucher}</Cell>
      <Cell className={cn("truncate", !check.accountId && "text-warning")}>{accountName}</Cell>
      <Cell className="truncate">
        {/* The row's accessible way in: a real button on the payee, so the drawer opens from the
            keyboard. */}
        <button
          type="button"
          onClick={() => onOpen(check.id)}
          className="block max-w-full truncate text-left font-medium text-ink hover:text-brand"
        >
          {check.payee || "—"}
        </button>
      </Cell>
      <Cell className="font-mono text-[12px] text-muted">{check.number || "—"}</Cell>
      <Cell numeric strong value={check.amount}>
        {money(check.amount)}
      </Cell>
      <Cell
        control
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "tabular-nums",
          notice?.variant === "negative"
            ? "bg-negative/5"
            : notice?.variant === "warning" && "bg-warning/5",
        )}
      >
        {notice ? (
          <div className="flex flex-col gap-1 px-2 py-1">
            <DateField
              value={check.expectedCashOn ?? null}
              nullable
              variant="cell"
              ariaLabel={`Cobro previsto del cheque ${check.number || check.voucher}`}
              onChange={(expectedCashOn) => {
                void cashDb.updateCheck(check.id, { expectedCashOn }).then(
                  () => setError(undefined),
                  () => setError("No se guardó la fecha. Intenta de nuevo."),
                );
              }}
            />
            {error ? (
              <span role="alert" title={error} className="truncate text-[11px] text-negative">
                {error}
              </span>
            ) : (
              <Badge
                variant={notice.variant}
                className="self-start whitespace-nowrap gap-1"
                title="Días calculados desde hoy"
              >
                <TriangleAlert size={13} aria-hidden />
                {notice.label}
              </Badge>
            )}
            <span className="text-[11px] font-semibold text-muted">
              Revisar fondos: {money(check.amount)}
            </span>
          </div>
        ) : (
          <span className="px-3.5 text-muted">
            {check.voided
              ? "Anulado"
              : `Cobrado${check.cashedOn ? ` · ${formatDayMonthYear(check.cashedOn)}` : ""}`}
          </span>
        )}
      </Cell>
      <Cell className="tabular-nums text-muted">{formatDayMonthYear(check.issuedOn) ?? "—"}</Cell>
      <Cell>
        <StepDots check={check} />
      </Cell>
    </GridRow>
  );
});

/** «Sin cuenta»: one row per bank label the book named that matched no account, assignable in bulk. */
function UnassignedBanks({
  clientId,
  banks,
}: {
  clientId: string;
  banks: { bank: string; count: number }[];
}) {
  const { accounts, centers } = useCashFlowData();
  const options = [
    { value: "", label: "Asignar a…" },
    ...accounts.map((account) => ({ value: account.id, label: accountLabel(account, centers) })),
  ];
  return (
    <div className="rounded-[13px] border border-warning/40 bg-warning/5 px-4 py-3">
      <p className="text-[12.5px] font-semibold text-ink">Cheques sin cuenta</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {banks.map((entry) => (
          <li
            key={entry.bank}
            className="flex items-center gap-2 rounded-[9px] border border-border bg-surface px-3 py-1.5 text-[12.5px]"
          >
            <span className="font-semibold text-ink">{entry.bank || "(sin banco)"}</span>
            <span className="text-faint">{pluralize(entry.count, "cheque")}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void cashDb.createAccountsForBanks(clientId, [entry.bank])}
            >
              Crear cuenta {entry.bank}
            </Button>
            {accounts.length > 0 && (
              <Select
                size="sm"
                aria-label={`Asignar ${entry.bank} a una cuenta`}
                value=""
                options={options}
                onChange={(event) => {
                  if (event.target.value) {
                    void cashDb.assignBankToAccount(clientId, entry.bank, event.target.value);
                  }
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
