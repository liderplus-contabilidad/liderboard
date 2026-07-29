"use client";

import { ChevronRight, FileSpreadsheet } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/cn";
import { type AccountOption, visibleAccountOptions } from "@/lib/profit-loss/filter";

export interface AccountTreeListProps {
  /** Accounts parsed from the loaded Excel; empty shows `emptyMessage`. */
  accounts: AccountOption[];
  /** Which codes read as picked — a set for the filter, a single code for the base picker. */
  isSelected: (code: string) => boolean;
  onPick: (code: string) => void;
  /** `true` draws a checkbox (several can be picked); `false` draws a single-choice row. */
  multiple: boolean;
  emptyMessage: ReactNode;
  /** Codes the list must not offer — the base picker hides nothing today, but a derived row would. */
  excludeCodes?: ReadonlySet<string>;
}

/**
 * The account tree both account controls are made of: search, per-level indent, a chevron that
 * folds a branch, and the empty state for a workspace with no file yet.
 *
 * It is shared rather than copied because the two controls differ only in how a row reads as
 * picked — a checkbox for the filter, a single mark for the vertical analysis base. Two copies
 * of a tree drift; this one cannot. The dropdown shell around it (trigger, footer) stays with
 * each control, since that part IS different.
 *
 * Collapse is view-only and local: folding a branch never touches what is picked, and this
 * fold state is the LIST's, unrelated to the Datos tree's.
 */
export function AccountTreeList({
  accounts,
  isSelected,
  onPick,
  multiple,
  emptyMessage,
  excludeCodes,
}: AccountTreeListProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const offered = useMemo(
    () =>
      excludeCodes && excludeCodes.size > 0
        ? accounts.filter((account) => !excludeCodes.has(account.code))
        : accounts,
    [accounts, excludeCodes],
  );

  const searching = query.trim().length > 0;
  const visible = useMemo(() => {
    const q = query.trim();
    if (q.length > 0) {
      const lower = q.toLowerCase();
      return offered.filter(
        (account) => account.name.toLowerCase().includes(lower) || account.code.includes(q),
      );
    }
    return visibleAccountOptions(offered, collapsed);
  }, [offered, collapsed, query]);

  const toggleCollapse = useCallback((code: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  if (accounts.length === 0) {
    return <EmptyState icon={<FileSpreadsheet size={22} />}>{emptyMessage}</EmptyState>;
  }

  return (
    <>
      <SearchInput
        size="sm"
        value={query}
        onChange={setQuery}
        placeholder="Buscar cuenta o código…"
        className="mb-2"
      />
      <div className="-mx-1 max-h-72 overflow-auto">
        {visible.map((account) => (
          <AccountTreeRow
            key={account.code}
            option={account}
            selected={isSelected(account.code)}
            collapsed={collapsed.has(account.code)}
            showChevron={!searching}
            indentLevel={searching ? 0 : account.level - 1}
            multiple={multiple}
            onPick={() => onPick(account.code)}
            onToggleCollapse={() => toggleCollapse(account.code)}
          />
        ))}
      </div>
    </>
  );
}

/**
 * One tree row: an optional chevron (parents only) that folds the branch, next to the
 * selectable mark + code + name. The chevron and the selectable area are sibling buttons
 * so clicking to collapse never picks the row, and vice versa. Leaves render a spacer
 * the width of the chevron so codes stay aligned. `indentLevel` steps the row right per depth.
 */
function AccountTreeRow({
  option,
  selected,
  collapsed,
  showChevron,
  indentLevel,
  multiple,
  onPick,
  onToggleCollapse,
}: {
  option: AccountOption;
  selected: boolean;
  collapsed: boolean;
  showChevron: boolean;
  indentLevel: number;
  multiple: boolean;
  onPick: () => void;
  onToggleCollapse: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center rounded-lg pr-2 text-[12.5px] transition-colors",
        selected ? "bg-brand-soft font-medium text-brand" : "text-ink hover:bg-canvas",
      )}
      style={{ paddingLeft: 8 + indentLevel * 14 }}
    >
      {showChevron && option.hasChildren ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={`${collapsed ? "Expandir" : "Contraer"} ${option.code} ${option.name}`}
          aria-expanded={!collapsed}
          className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-faint transition-colors hover:text-brand"
        >
          <ChevronRight
            size={14}
            className={cn("transition-transform", !collapsed && "rotate-90")}
          />
        </button>
      ) : (
        <span className="w-5 shrink-0" aria-hidden />
      )}
      <button
        type="button"
        onClick={onPick}
        role={multiple ? undefined : "radio"}
        aria-checked={multiple ? undefined : selected}
        className="flex min-w-0 flex-1 items-center gap-[9px] py-1.5 text-left"
      >
        {multiple ? (
          <Checkbox checked={selected} size={17} />
        ) : (
          // Single choice: a dot, not a checkbox — a checkbox promises several can be picked.
          <span
            aria-hidden
            className={cn(
              "flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border transition-colors",
              selected ? "border-brand" : "border-border",
            )}
          >
            {selected && <span className="h-[7px] w-[7px] rounded-full bg-brand" />}
          </span>
        )}
        <span className="font-mono text-[11px] text-faint">{option.code}</span>
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {option.name}
        </span>
      </button>
    </div>
  );
}
