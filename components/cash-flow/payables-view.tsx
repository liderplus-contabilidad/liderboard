"use client";

import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Coins,
  FileText,
  Flag,
  Plus,
  Upload,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Cell, HeadCell } from "@/components/data-table/grid-cells";
import { GridRow } from "@/components/data-table/data-grid";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { agingOf } from "@/lib/cash-flow/aging";
import * as cashDb from "@/lib/cash-flow/db";
import {
  documentLabel,
  groupBySupplier,
  money,
  payableDetail,
  type SupplierGroup,
} from "@/lib/cash-flow/derive";
import { hasActiveFilters } from "@/lib/cash-flow/filters";
import type { Payable, PayPriority } from "@/lib/cash-flow/types";
import { cn } from "@/lib/cn";
import { formatDayMonthYear } from "@/lib/date";
import { pluralize } from "@/lib/format";
import { useCashFlowData } from "./cash-flow-data-provider";
import { CashFlowEmptyState } from "./cash-flow-empty-state";
import { ManualPayablePanel } from "./manual-payable-panel";
import { AgingBadge, ApprovalDots, CashBadge, PriorityBadge } from "./payable-badges";
import { PayableDetailPanel } from "./payable-detail-panel";
import { PayablesUploadModal } from "./payables-upload-modal";

const SOURCE_LABELS = { contifico: "Contífico", dingoo: "Dingoo", manual: "Manual" } as const;

/**
 * Cuentas por pagar: the tiles, the bulk bar and the grid, one group per supplier with its subtotal.
 * Everything on screen is `visiblePayables` — what the bar left — so the tiles always square with
 * the rows under them.
 *
 * The MARK is the grid's job (select rows → «Marcar urgente» · «Pendiente» · «Programar» ·
 * «Marcar pagado»), because that is decided over many rows at once; the four working columns are
 * the detail drawer's, because they are written one document at a time.
 */
export function PayablesView() {
  const {
    activeClientId,
    visiblePayables,
    payables,
    payableFilters,
    totals,
    asOf,
    cuts,
    centers,
    accounts,
  } = useCashFlowData();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const groups = useMemo(() => groupBySupplier(visiblePayables), [visiblePayables]);
  const allCollapsed = groups.length > 0 && groups.every((group) => collapsed.has(group.key));
  // The grid FLATTENED: what the window is cut from. A collapsed group contributes its header only.
  const items = useMemo<GridItem[]>(() => {
    const list: GridItem[] = [];
    for (const group of groups) {
      const isCollapsed = collapsed.has(group.key);
      list.push({ kind: "group", key: `g-${group.key}`, group, collapsed: isCollapsed });
      if (!isCollapsed) {
        for (const payable of group.payables) {
          list.push({ kind: "payable", key: payable.id, payable });
        }
      }
    }
    list.push({ kind: "total", key: "total" });
    return list;
  }, [groups, collapsed]);
  const open = useMemo(
    () => (openId ? (payables.find((row) => row.id === openId) ?? null) : null),
    [payables, openId],
  );
  const visibleIds = useMemo(
    () => new Set(visiblePayables.map((row) => row.id)),
    [visiblePayables],
  );
  // A selection is pruned on read: a row the bar hid is not acted on in silence.
  const selectedVisible = useMemo(
    () => [...selected].filter((id) => visibleIds.has(id)),
    [selected, visibleIds],
  );

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  const toggleGroup = useCallback((key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);
  const selectAll = useCallback(() => {
    setSelected((current) =>
      current.size >= visibleIds.size && visibleIds.size > 0 ? new Set() : new Set(visibleIds),
    );
  }, [visibleIds]);

  const cutLabel = cuts
    .map(
      (cut) => `${SOURCE_LABELS[cut.source]} al ${formatDayMonthYear(cut.cutDate) ?? cut.cutDate}`,
    )
    .join(" · ");

  if (!activeClientId) {
    return <CashFlowEmptyState />;
  }

  return (
    <CashFlowEmptyState needsAccounts={false}>
      <div className="flex h-full flex-col gap-4 px-7 py-5">
        <div className="flex gap-3">
          <StatTile
            label="Total por pagar"
            value={money(totals.total)}
            hint={pluralize(totals.count, "documento")}
          />
          <StatTile
            label="Vencido"
            value={money(totals.overdue)}
            hint="Antes de la fecha de corte"
            sign={totals.overdue > 0 ? "negativo" : undefined}
          />
          <StatTile label="Por vencer" value={money(totals.due)} hint="Desde la fecha de corte" />
          <StatTile
            label="Marcado para pago"
            value={money(totals.urgent + totals.pending)}
            hint={`Urgente ${money(totals.urgent)} · Pendiente ${money(totals.pending)}`}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[13.5px] font-bold text-ink">Cartera por pagar</h2>
            <p className="mt-0.5 truncate text-[11.5px] text-faint">
              {cutLabel || "Ninguna cartera cargada todavía"} ·
            </p>
          </div>
          {groups.length > 1 && (
            <Button
              variant="secondary"
              size="toolbar"
              icon={allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
              onClick={() =>
                setCollapsed(allCollapsed ? new Set() : new Set(groups.map((group) => group.key)))
              }
            >
              {allCollapsed ? "Expandir todo" : "Colapsar todo"}
            </Button>
          )}
          <Button
            variant="secondary"
            size="toolbar"
            icon={<Plus size={14} />}
            onClick={() => setManualOpen(true)}
          >
            Agregar obligación
          </Button>
        </div>

        {selectedVisible.length > 0 && (
          <BulkBar
            ids={selectedVisible}
            asOf={asOf}
            accounts={accounts.map((account) => account.id)}
            onDone={() => setSelected(new Set())}
          />
        )}

        {visiblePayables.length === 0 ? (
          <EmptyState icon={<FileText size={22} />}>
            {payables.length === 0 ? (
              <span className="flex flex-col items-center gap-3 text-center">
                <span>
                  Carga la cartera por pagar de Contífico o de Dingoo, o agrega una obligación a
                  mano.
                </span>
                <Button size="sm" icon={<Upload size={14} />} onClick={() => setUploadOpen(true)}>
                  Cargar cartera
                </Button>
              </span>
            ) : hasActiveFilters(payableFilters) || payableFilters.search ? (
              "Ningún documento coincide con los filtros."
            ) : (
              "Todo está liquidado. Marca «Ver liquidadas» para verlo."
            )}
          </EmptyState>
        ) : (
          <VirtualPayablesGrid
            items={items}
            asOf={asOf}
            hasCenters={centers.length > 0}
            selected={selected}
            allSelected={selectedVisible.length === visibleIds.size && visibleIds.size > 0}
            totalLabel={`Total ${hasActiveFilters(payableFilters) ? "filtrado" : ""}`}
            total={totals.total}
            onSelectAll={selectAll}
            onToggleGroup={toggleGroup}
            onToggle={toggle}
            onOpen={setOpenId}
          />
        )}

        <p className="flex items-center gap-2 text-[11.5px] text-faint">
          <ApprovalDots filled />
          Aprobación: observación · 1ª revisión · revisión final · notificación. Clic en una fila
          para abrir el detalle.
        </p>
      </div>

      {open && <PayableDetailPanel payable={open} onClose={() => setOpenId(null)} />}
      {manualOpen && <ManualPayablePanel onClose={() => setManualOpen(false)} />}
      <PayablesUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </CashFlowEmptyState>
  );
}

/** The bulk bar over a selection: the marks that are decided over many rows at once. */
function BulkBar({
  ids,
  asOf,
  accounts,
  onDone,
}: {
  ids: string[];
  asOf: string;
  accounts: string[];
  onDone: () => void;
}) {
  const [payOn, setPayOn] = useState(asOf);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }, []);
  // With ONE account there is nothing to choose: marking assigns it, so the flow sums it in its row.
  const onlyAccount = accounts.length === 1 ? accounts[0] : undefined;
  const mark = (priority: PayPriority | null) =>
    run(() =>
      cashDb.updatePayables(ids, {
        priority,
        ...(priority && onlyAccount ? { payFromAccountId: onlyAccount } : {}),
      }),
    );

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-[13px] bg-brand px-4 py-2.5 text-white">
      <span className="text-[12.5px] font-bold">
        {pluralize(ids.length, "documento")} seleccionados
      </span>
      <span className="flex-1" />
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        icon={<Flag size={13} />}
        onClick={() => void mark("urgent")}
      >
        Marcar urgente
      </Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void mark("pending")}>
        Pendiente
      </Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void mark(null)}>
        Sin marcar
      </Button>
      {/* The cash LABEL, beside the priority: put on and taken off without touching the mark. */}
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        icon={<Coins size={13} />}
        onClick={() => void run(() => cashDb.updatePayables(ids, { cash: true }))}
      >
        Cash
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => void run(() => cashDb.updatePayables(ids, { cash: false }))}
      >
        Quitar cash
      </Button>
      <span className="inline-flex items-center gap-1.5 rounded-[9px] border border-white/30 px-2 text-[12px] font-semibold">
        Programar
        <DateField
          value={payOn}
          variant="dark"
          ariaLabel="Fecha programada"
          onChange={(date) => date && setPayOn(date)}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void run(() => cashDb.updatePayables(ids, { payOn }))}
        >
          Aplicar
        </Button>
      </span>
      <Button
        size="sm"
        disabled={busy}
        className="bg-positive hover:bg-positive/90"
        onClick={() => void run(() => cashDb.settlePayables(ids, asOf).then(onDone))}
      >
        Marcar pagado
      </Button>
      <button
        type="button"
        onClick={onDone}
        className="px-1 text-[12.5px] font-semibold text-white/75 hover:text-white"
      >
        Quitar selección
      </button>
    </div>
  );
}

const GROUP_ROW_PX = 38;
const PAYABLE_ROW_PX = 46;
const TOTAL_ROW_PX = 41;
const ROW_OVERSCAN = 10;

/** One line of the flattened grid: a supplier's header, one of its documents, or the total. */
type GridItem =
  | { kind: "group"; key: string; group: SupplierGroup; collapsed: boolean }
  | { kind: "payable"; key: string; payable: Payable }
  | { kind: "total"; key: "total" };

const GroupRow = memo(function GroupRow({
  group,
  collapsed,
  onToggleGroup,
}: {
  group: SupplierGroup;
  collapsed: boolean;
  onToggleGroup: (key: string) => void;
}) {
  const Caret = collapsed ? ChevronRight : ChevronDown;
  return (
    // The supplier's row is a HEADING, not a document: it wears the brand tint and the brand ink so
    // the eye finds where one supplier ends and the next begins without reading the labels.
    <GridRow
      onClick={() => onToggleGroup(group.key)}
      className="h-[40px] bg-brand-soft hover:bg-brand-soft"
    >
      <Cell />
      <Cell>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand">
          <Caret size={14} className="text-brand" />
          {group.label}
          {group.taxId && (
            <span className="font-mono text-[11px] font-normal text-muted">{group.taxId}</span>
          )}
        </span>
      </Cell>
      <Cell colSpan={4}>
        <span className="text-[11.5px] font-semibold text-muted">
          {pluralize(group.payables.length, "documento")}
        </span>
      </Cell>
      <Cell numeric strong value={group.balance}>
        {money(group.balance)}
      </Cell>
      <Cell colSpan={2} />
    </GridRow>
  );
});

function SpacerRow({ height }: { height: number }) {
  return (
    <tr aria-hidden style={{ height }}>
      <td aria-hidden />
    </tr>
  );
}

/**
 * The grid as a WINDOW: only the rows that fit the viewport are in the DOM (`useVirtualizer`, a
 * declared height per kind of row, two spacer rows), the same as Datos and Cheques, so a cartera
 * of hundreds of documents opens and scrolls at once. The rows are the flattened `items` — a
 * collapsed supplier contributes its header only — and the `<table>` stays real: sticky head,
 * native scroll, and the card's own border around it.
 */
function VirtualPayablesGrid({
  items,
  asOf,
  hasCenters,
  selected,
  allSelected,
  totalLabel,
  total,
  onSelectAll,
  onToggleGroup,
  onToggle,
  onOpen,
}: {
  items: GridItem[];
  asOf: string;
  hasCenters: boolean;
  selected: ReadonlySet<string>;
  allSelected: boolean;
  totalLabel: string;
  total: number;
  onSelectAll: () => void;
  onToggleGroup: (key: string) => void;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => {
      const kind = items[index]?.kind;
      return kind === "group" ? GROUP_ROW_PX : kind === "total" ? TOTAL_ROW_PX : PAYABLE_ROW_PX;
    },
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
          style={{ minWidth: 1100 }}
        >
          {/* Widths declared, not measured: with an automatic layout the document column took
                the slack of the whole card and pushed the figures out of sight. */}
          <colgroup>
            <col style={{ width: 44 }} />
            <col />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 96 }} />
          </colgroup>
          <thead>
            <tr>
              <HeadCell className="sticky top-0 z-[2]">
                <Checkbox
                  size={16}
                  checked={allSelected}
                  ariaLabel="Seleccionar todo lo visible"
                  onChange={onSelectAll}
                />
              </HeadCell>
              <HeadCell className="sticky top-0 z-[2]">Proveedor · documento</HeadCell>
              <HeadCell className="sticky top-0 z-[2]">Emisión</HeadCell>
              <HeadCell className="sticky top-0 z-[2]">Vence</HeadCell>
              <HeadCell className="sticky top-0 z-[2]" align="right">
                Valor doc.
              </HeadCell>
              <HeadCell className="sticky top-0 z-[2]" align="right">
                Abonos
              </HeadCell>
              <HeadCell className="sticky top-0 z-[2]" align="right">
                Saldo
              </HeadCell>
              <HeadCell className="sticky top-0 z-[2]">Programado</HeadCell>
              <HeadCell className="sticky top-0 z-[2]">Aprobación</HeadCell>
            </tr>
          </thead>
          <tbody>
            {topPad > 0 && <SpacerRow height={topPad} />}
            {window.map((item) => {
              const row = items[item.index];
              if (row.kind === "group") {
                return (
                  <GroupRow
                    key={row.key}
                    group={row.group}
                    collapsed={row.collapsed}
                    onToggleGroup={onToggleGroup}
                  />
                );
              }
              if (row.kind === "payable") {
                return (
                  <PayableRow
                    key={row.key}
                    payable={row.payable}
                    asOf={asOf}
                    hasCenters={hasCenters}
                    checked={selected.has(row.payable.id)}
                    onToggle={onToggle}
                    onOpen={onOpen}
                  />
                );
              }
              // The same closing row the flow's PROVEEDORES table paints: brand ground, white
              // figure — the one row of the grid that is a sum and not a document.
              return (
                <tr key="total" className="h-[41px] bg-brand text-white">
                  <Cell className="border-b-0" />
                  <Cell
                    colSpan={5}
                    className="border-b-0 text-[13px] font-bold uppercase tracking-[0.4px] text-white"
                  >
                    {totalLabel}
                  </Cell>
                  <Cell numeric className="border-b-0 text-[14px] font-bold text-white">
                    {money(total)}
                  </Cell>
                  <Cell colSpan={2} className="border-b-0" />
                </tr>
              );
            })}
            {bottomPad > 0 && <SpacerRow height={bottomPad} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PayableRow = memo(function PayableRow({
  payable,
  asOf,
  hasCenters,
  checked,
  onToggle,
  onOpen,
}: {
  payable: Payable;
  asOf: string;
  hasCenters: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const settled = payable.status === "settled";
  const aging = agingOf(payable.dueOn, asOf);
  // The detail line: the description, the class of a manual obligation and the center — never the
  // source: which system a document came from is in the header's cut line.
  const sub = payableDetail(payable, { center: hasCenters || payable.source !== "manual" });
  return (
    <GridRow onClick={() => onOpen(payable.id)} className={cn("h-[46px]", settled && "opacity-60")}>
      {/* Selecting must not open: the checkbox cell swallows its click. */}
      <Cell onClick={(event) => event.stopPropagation()}>
        <Checkbox
          size={16}
          checked={checked}
          ariaLabel={`Seleccionar ${payable.supplier}`}
          onChange={() => onToggle(payable.id)}
        />
      </Cell>
      <Cell>
        {/* The row's accessible way in: a real button on its title, so the detail opens from the
            keyboard; the whole row opens it on click, the checkbox beside it selects without opening. */}
        {/* The document and its two states on ONE line: what it is, how late it is, whether it is
            marked — read left to right without hunting two columns to the right. */}
        <span className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onOpen(payable.id)}
            className="min-w-0 truncate text-left font-mono text-[12px] text-ink hover:text-brand"
          >
            {documentLabel(payable) || payable.supplier}
          </button>
          <AgingBadge aging={aging} settled={settled} />
          {payable.priority && <PriorityBadge priority={payable.priority} />}
          {payable.cash && <CashBadge />}
        </span>
        {sub && <span className="block truncate text-[11.5px] text-muted">{sub}</span>}
      </Cell>
      <Cell>
        <span className="tabular-nums text-ink-soft">
          {formatDayMonthYear(payable.issuedOn) ?? "—"}
        </span>
      </Cell>
      <Cell>
        <span className="tabular-nums text-ink-soft">
          {formatDayMonthYear(payable.dueOn) ?? "—"}
        </span>
      </Cell>
      <Cell numeric>
        <span className="text-muted">{money(payable.amount)}</span>
      </Cell>
      <Cell numeric>
        <span className="text-muted">{money(payable.payments)}</span>
      </Cell>
      <Cell numeric strong value={payable.balance}>
        {money(payable.balance)}
      </Cell>
      <Cell>
        <span className="tabular-nums text-ink-soft">
          {formatDayMonthYear(payable.payOn) ?? "—"}
        </span>
      </Cell>
      <Cell>
        <ApprovalDots payable={payable} />
      </Cell>
    </GridRow>
  );
});
