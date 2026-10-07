"use client";

import { useFilterState } from "@/components/dashboard/filter-state";

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  TriangleAlert,
  Plus,
  Receipt,
  Upload,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
} from "lucide-react";
import { memo, useMemo, useRef, useState } from "react";
import { Cell } from "@/components/data-table/grid-cells";
import { GridRow } from "@/components/data-table/data-grid";
import { Tooltip } from "@/components/ui/tooltip";
import { DateField } from "@/components/ui/date-field";
import {
  pendingCollections,
  collectionView,
  COLLECTION_FILTERS,
  type CollectionFilter,
} from "@/lib/cash-flow/check-collection";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { sortChecks, type CheckSort, type CheckSortKey } from "@/lib/cash-flow/check-sort";
import { SearchInput } from "@/components/ui/search-input";
import { withCheckSearch } from "@/lib/cash-flow/check-filters";
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
 * The paginated grid opens on the cut date's YEAR (`check-filters.ts`): twelve thousand rows since 2017 are
 * the register's history, not its reading. And even one year is hundreds of rows, so **only the
 * rows that fit the viewport are in the DOM** — the same window Datos keeps (`useVirtualizer`,
 * `CHECK_ROW_PX` per row, two spacer rows), which is what leaves it a real `<table>` with a sticky
 * `<thead>` and the native scroll.
 */

/** Fixed height fits the single-line register and its inline collection date. */
const CHECK_ROW_PX = 48;
const ROW_OVERSCAN = 12;
export function ChecksView() {
  const {
    activeClientId,
    accounts,
    centers,
    checks,
    visibleChecks,
    checkFilters,
    setCheckFilters,
    asOf,
  } = useCashFlowData();
  const [openId, setOpenId] = useState<string | null | "new">(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const today = useReminderToday();
  const [collectionFilter, setCollectionFilter] = useFilterState<CollectionFilter>(
    "checks.collectionFilter",
    activeClientId,
    "all",
  );
  const [tableSort, setTableSort] = useFilterState<CheckSort>("checks.tableSort", activeClientId, {
    key: "issued",
    direction: "desc",
  });

  const outstanding = useMemo(() => outstandingByAccount(checks, asOf), [checks, asOf]);
  const outstandingTotal = useMemo(
    () => [...outstanding.values()].reduce((acc, value) => acc + value, 0),
    [outstanding],
  );
  const unassigned = useMemo(() => unassignedBanks(checks), [checks]);
  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, accountLabel(account, centers)])),
    [accounts, centers],
  );
  const open = useMemo(
    () => (openId && openId !== "new" ? (checks.find((row) => row.id === openId) ?? null) : null),
    [checks, openId],
  );
  const { rows: filtered, counts: collectionCounts } = useMemo(
    () => collectionView(visibleChecks, today, collectionFilter, "issued"),
    [visibleChecks, today, collectionFilter],
  );
  const sorted = useMemo(
    () => sortChecks(filtered, tableSort, accountNames, today),
    [filtered, tableSort, accountNames, today],
  );
  const onSort = (key: CheckSortKey) =>
    setTableSort((previous) => ({
      key,
      direction:
        previous.key === key
          ? previous.direction === "asc"
            ? "desc"
            : "asc"
          : key === "issued" || key === "amount"
            ? "desc"
            : "asc",
    }));
  const visibleTotal = useMemo(
    () => filtered.filter((check) => !check.voided).reduce((acc, check) => acc + check.amount, 0),
    [filtered],
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
          <StatTile label="Total girado" value={money(visibleTotal)} />
        </div>

        {unassigned.length > 0 && <UnassignedBanks clientId={activeClientId} banks={unassigned} />}

        <div className="flex items-center gap-3">
          <SearchInput
            size="sm"
            value={checkFilters.search}
            placeholder="Beneficiario, cheque o egreso"
            onChange={(value) => setCheckFilters((f) => withCheckSearch(f, value))}
            className="mr-auto w-[320px]"
          />
          <Button
            variant="secondary"
            size="toolbar"
            icon={<Plus size={14} />}
            onClick={() => setOpenId("new")}
          >
            Nuevo cheque
          </Button>
        </div>

        <SegmentedControl
          ariaLabel="Filtrar por advertencia de cobro"
          className="self-start flex-wrap shrink-0"
          value={collectionFilter}
          options={COLLECTION_FILTERS.map(({ value, label }) => ({
            value,
            label: `${label} (${collectionCounts[value]})`,
          }))}
          onChange={(value) => {
            setCollectionFilter(value);
            if (value !== "all") setTableSort({ key: "collection", direction: "asc" });
          }}
        />

        {checks.length === 0 ? (
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
            key={`${activeClientId}:${JSON.stringify(checkFilters)}:${collectionFilter}:${JSON.stringify(tableSort)}`}
            sort={tableSort}
            onSort={onSort}
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

const CHECK_COLUMNS: { key: CheckSortKey; label: string; numeric?: boolean }[] = [
  { key: "voucher", label: "Egreso" },
  { key: "account", label: "Cuenta" },
  { key: "payee", label: "Beneficiario" },
  { key: "number", label: "Cheque" },
  { key: "amount", label: "Valor", numeric: true },
  { key: "collection", label: "Cobro" },
  { key: "issued", label: "Emisión" },
  { key: "step", label: "Avance" },
];

function VirtualChecksTable({
  sorted,
  accountNames,
  onOpen,
  sort,
  onSort,
}: {
  sort: CheckSort;
  onSort: (key: CheckSortKey) => void;
  sorted: Check[];
  accountNames: Map<string, string>;
  onOpen: (id: string) => void;
}) {
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);
  const today = useReminderToday();
  const notices = useMemo(
    () => new Map(pendingCollections(sorted, today).map((notice) => [notice.check.id, notice])),
    [sorted, today],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: pageRows.length,
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
            <col style={{ width: 100 }} />
            <col style={{ width: 140 }} />
            <col />
            <col style={{ width: 100 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 170 }} />
          </colgroup>
          <thead>
            <tr>
              {CHECK_COLUMNS.map(({ key, label, numeric }) => (
                <th
                  key={key}
                  aria-sort={
                    sort.key === key
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className="sticky top-0 z-[2] border-b border-border bg-surface-header px-3.5 py-2.5 text-table-header font-semibold uppercase tracking-[0.4px] text-muted"
                >
                  <div className={cn("flex items-center gap-4", numeric && "justify-end")}>
                    {[{ key, label }].map((column) => (
                      <button
                        key={column.key}
                        type="button"
                        onClick={() => onSort(column.key)}
                        title={`Ordenar por ${column.label.toLowerCase()}`}
                        aria-label={`Ordenar por ${column.label.toLowerCase()}`}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-[7px] py-1 text-left uppercase hover:text-brand focus-visible:outline-2 focus-visible:outline-brand",
                          sort.key === column.key && "text-brand",
                        )}
                      >
                        {column.label}
                        {sort.key === column.key ? (
                          sort.direction === "asc" ? (
                            <ArrowUp size={14} className="shrink-0" />
                          ) : (
                            <ArrowDown size={14} className="shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown size={14} className="shrink-0 text-faint" />
                        )}
                      </button>
                    ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={CHECK_COLUMNS.length}
                  className="px-4 py-8 text-center text-[12.5px] text-muted"
                >
                  Ningún cheque coincide con los filtros.
                </td>
              </tr>
            )}
            {topPad > 0 && <SpacerRow height={topPad} />}
            {window.map((item) => {
              const check = pageRows[item.index];
              if (!check) return null;
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
      <div className="flex shrink-0 items-center justify-between border-t border-border px-3.5 py-2">
        <span className="text-[12px] tabular-nums text-muted" aria-live="polite">
          {sorted.length === 0
            ? "0 cheques"
            : `${start + 1}–${Math.min(start + pageSize, sorted.length)} de ${pluralize(sorted.length, "cheque")}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={currentPage === 0}
            onClick={() => {
              scroller.current?.scrollTo({ top: 0 });
              setPage(currentPage - 1);
            }}
          >
            Anterior
          </Button>
          <span className="text-[12px] tabular-nums text-muted">
            {currentPage + 1} / {pageCount}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={currentPage + 1 >= pageCount}
            onClick={() => {
              scroller.current?.scrollTo({ top: 0 });
              setPage(currentPage + 1);
            }}
          >
            Siguiente
          </Button>
        </div>
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
  const collected = !check.voided && (check.step === "cashed" || !!check.cashedOn);
  const collectionDate = collected ? check.cashedOn : (check.expectedCashOn ?? null);
  const dateHint =
    notice?.label ??
    (check.voided ? "Cheque anulado · Fecha programada de cobro" : "Fecha efectiva de cobro");

  return (
    <GridRow
      onClick={() => onOpen(check.id)}
      className={cn("h-[48px]", check.voided && "opacity-60")}
    >
      <Cell className="font-mono text-[12px] text-muted">{check.voucher}</Cell>
      <Cell className={cn("truncate", !check.accountId && "text-warning")}>
        <span title={accountName}>{accountName}</span>
      </Cell>
      <Cell className="truncate">
        {/* The row's accessible way in: a real button on the payee, so the drawer opens from the
            keyboard. */}
        <button
          type="button"
          onClick={() => onOpen(check.id)}
          title={check.payee}
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
            ? "bg-negative/15"
            : notice?.variant === "warning" && "bg-warning/15",
        )}
      >
        <div className="flex flex-col px-2 py-1">
          <Tooltip content={dateHint}>
            {(descriptionId) => (
              <div className="flex items-center gap-1.5 text-muted">
                <DateField
                  value={collectionDate}
                  nullable={!collected}
                  placeholder="—"
                  variant="inline"
                  ariaLabel={`${collected ? "Fecha efectiva de cobro" : "Cobro previsto"} del cheque ${check.number || check.voucher}`}
                  ariaDescribedBy={descriptionId}
                  onChange={(date) => {
                    const patch = collected ? { cashedOn: date } : { expectedCashOn: date };
                    void cashDb.updateCheck(check.id, patch).then(
                      () => setError(undefined),
                      () => setError("No se guardó la fecha. Intenta de nuevo."),
                    );
                  }}
                />
                {notice && notice.variant !== "outline" && (
                  <TriangleAlert
                    size={13}
                    aria-hidden
                    className={cn(
                      "shrink-0",
                      notice.variant === "negative" ? "text-negative" : "text-warning",
                    )}
                  />
                )}
              </div>
            )}
          </Tooltip>
          {error && (
            <span role="alert" title={error} className="truncate text-[11px] text-negative">
              {error}
            </span>
          )}
        </div>
      </Cell>
      <Cell
        control
        onClick={(event) => event.stopPropagation()}
        className="tabular-nums text-muted"
      >
        <div className="px-2 py-1">
          <DateField
            value={check.issuedOn}
            nullable
            placeholder="—"
            variant="inline"
            ariaLabel={`Fecha de emisión del cheque ${check.number || check.voucher}`}
            onChange={(issuedOn) => {
              void cashDb.updateCheck(check.id, { issuedOn }).then(
                () => setError(undefined),
                () => setError("No se guardó la fecha. Intenta de nuevo."),
              );
            }}
          />
        </div>
      </Cell>
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
