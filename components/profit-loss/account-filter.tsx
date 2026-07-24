"use client";

import { ChevronRight, FileSpreadsheet, ListTree } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dropdown, DropdownFooter, DropdownPanel, DropdownTrigger } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/cn";
import { type AccountOption, visibleAccountOptions } from "@/lib/profit-loss/filter";

export interface AccountFilterProps {
  /** Accounts parsed from the loaded Excel; empty shows the "carga un Excel" state. */
  accounts: AccountOption[];
  /** Focus selection (empty = no filter). */
  selected: ReadonlySet<string>;
  onToggle: (code: string) => void;
  onClear: () => void;
}

/**
 * "Cuenta contable" filter. The account list comes from the uploaded P&L Excel via
 * PygDataProvider; until one is loaded `accounts` is empty and the panel shows an empty
 * state. Selection is prop-driven so the Datos table can focus the chosen accounts.
 *
 * The list is a collapsible tree: it starts fully expanded and each parent carries a chevron
 * to fold its branch (indented per level). Collapse is view-only — folding a branch never
 * touches its selection. Typing a search bypasses the tree and shows the flat matches.
 */
export function AccountFilter({ accounts, selected, onToggle, onClear }: AccountFilterProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const searching = query.trim().length > 0;
  const visible = useMemo(() => {
    const q = query.trim();
    if (q.length > 0) {
      const lower = q.toLowerCase();
      return accounts.filter(
        (account) => account.name.toLowerCase().includes(lower) || account.code.includes(q),
      );
    }
    return visibleAccountOptions(accounts, collapsed);
  }, [accounts, collapsed, query]);

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

  return (
    <Dropdown>
      <DropdownTrigger active={selected.size > 0} icon={<ListTree size={15} />}>
        {selected.size > 0 ? `Cuenta · ${selected.size}` : "Cuenta contable"}
      </DropdownTrigger>
      <DropdownPanel width={344}>
        {accounts.length === 0 ? (
          <EmptyState icon={<FileSpreadsheet size={22} />}>
            Carga un Excel de Pérdidas y Ganancias para filtrar por cuenta contable.
          </EmptyState>
        ) : (
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
                <AccountRow
                  key={account.code}
                  option={account}
                  selected={selected.has(account.code)}
                  collapsed={collapsed.has(account.code)}
                  showChevron={!searching}
                  indentLevel={searching ? 0 : account.level - 1}
                  onToggle={() => onToggle(account.code)}
                  onToggleCollapse={() => toggleCollapse(account.code)}
                />
              ))}
            </div>
            <DropdownFooter>
              <Button variant="ghost" size="sm" onClick={onClear}>
                Quitar selección
              </Button>
              <Button variant="primary" size="sm">
                Listo
              </Button>
            </DropdownFooter>
          </>
        )}
      </DropdownPanel>
    </Dropdown>
  );
}

/**
 * One tree row: an optional chevron (parents only) that folds the branch, next to the
 * selectable checkbox + code + name. The chevron and the selectable area are sibling buttons
 * so clicking to collapse never toggles the checkbox, and vice versa. Leaves render a spacer
 * the width of the chevron so codes stay aligned. `indentLevel` steps the row right per depth.
 */
function AccountRow({
  option,
  selected,
  collapsed,
  showChevron,
  indentLevel,
  onToggle,
  onToggleCollapse,
}: {
  option: AccountOption;
  selected: boolean;
  collapsed: boolean;
  showChevron: boolean;
  indentLevel: number;
  onToggle: () => void;
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
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-[9px] py-1.5 text-left"
      >
        <Checkbox checked={selected} size={17} />
        <span className="font-mono text-[11px] text-faint">{option.code}</span>
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {option.name}
        </span>
      </button>
    </div>
  );
}
