"use client";

import { ChevronRight } from "lucide-react";
import { memo, type ReactNode } from "react";
import { ChartGuideTip } from "@/components/ui/chart-guide-tip";
import { EmptyState } from "@/components/ui/empty-state";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { periodLabel } from "@/lib/profit-loss/analytics/period";
import type { AccountOption } from "@/lib/profit-loss/filter";
import { GUIDE_VERTICAL } from "@/lib/profit-loss/charts/guides";
import type { VerticalAnalysis, VerticalRow } from "@/lib/profit-loss/charts/vertical";
import { AccountBasePicker } from "../account-base-picker";

export interface VerticalAnalysisCardProps {
  table: VerticalAnalysis;
  /** The tree the base picker offers — the resolved center's own accounts. */
  accounts: AccountOption[];
  baseCode: string;
  /** Named in the subtitle so a reader knows which center's structure this is. */
  centerName: string;
  year: number;
  /** True when the account filter left the table with nothing to show. */
  filteredEmpty: boolean;
  onChangeBase: (code: string) => void;
  onToggleCollapse: (code: string) => void;
}

/**
 * «Análisis vertical»: what share of a chosen base account each account represents, period by
 * period. It is a TABLE and not a chart, so it does not go through `ChartCard` — that component
 * only shows its table twin alongside an `option` with series, and there is no chart here to be
 * the twin of. The shell is copied deliberately (radius, border, header tone) so it reads as
 * one of the tab's cards and not as a stray component.
 */
export function VerticalAnalysisCard({
  table,
  accounts,
  baseCode,
  centerName,
  year,
  filteredEmpty,
  onChangeBase,
  onToggleCollapse,
}: VerticalAnalysisCardProps) {
  const subtitle = table.base
    ? `% sobre ${table.base.code} ${table.base.label} · ${centerName} · ${year}`
    : `${centerName} · ${year}`;

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-[13px] border border-border bg-surface">
      <header className="flex items-start justify-between gap-3 border-b border-border bg-surface-header px-[18px] py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">Análisis vertical</h3>
          <p className="mt-0.5 truncate text-[11.5px] text-muted">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <AccountBasePicker accounts={accounts} value={baseCode} onChange={onChangeBase} />
          <ChartGuideTip title="Análisis vertical" guide={GUIDE_VERTICAL} />
        </div>
      </header>

      <div className="px-[18px] py-3.5">
        {table.warnings.length > 0 && (
          <NoticeBanner className="mb-3">
            {table.warnings.length === 1 ? (
              table.warnings[0]
            ) : (
              <ul className="space-y-1">
                {table.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </NoticeBanner>
        )}

        {table.rows.length === 0 ? (
          <EmptyState className="py-8">
            {filteredEmpty
              ? "El filtro de cuentas marcadas no deja ninguna cuenta que mostrar en esta tabla."
              : "No hay cuentas que mostrar en este periodo."}
          </EmptyState>
        ) : (
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-[12px]">
              <thead>
                <tr>
                  <Th align="left" className="sticky left-0 z-[3] min-w-[300px]">
                    Cuenta
                  </Th>
                  {table.periods.map((period) => (
                    <Th key={period.index} align="right">
                      {periodLabel(period)}
                    </Th>
                  ))}
                  <Th align="right" className="border-l border-border">
                    Total año
                  </Th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <VerticalTableRow
                    key={row.code}
                    row={row}
                    isBase={row.code === table.base?.code}
                    onToggleCollapse={onToggleCollapse}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * One account row. Memoized because the real statement carries 131 of them and the provider
 * rebuilds its sources on every cell edit — the same reason `datos-table-row.tsx` is memoized.
 */
const VerticalTableRow = memo(function VerticalTableRow({
  row,
  isBase,
  onToggleCollapse,
}: {
  row: VerticalRow;
  isBase: boolean;
  onToggleCollapse: (code: string) => void;
}) {
  return (
    <tr className="group hover:bg-surface-muted">
      <th
        scope="row"
        className={cn(
          "sticky left-0 z-[1] border-b border-border-faint bg-surface px-4 py-1.5 text-left font-normal group-hover:bg-surface-muted",
          isBase && "font-semibold text-ink",
        )}
        style={{ paddingLeft: 16 + (row.level - 1) * 14 }}
      >
        <span className="flex items-center gap-2">
          {row.hasChildren ? (
            <button
              type="button"
              onClick={() => onToggleCollapse(row.code)}
              aria-label={`Plegar o desplegar ${row.code} ${row.label}`}
              className="flex h-5 w-4 shrink-0 items-center justify-center rounded text-faint transition-colors hover:text-brand"
            >
              <ChevronRight size={13} />
            </button>
          ) : (
            <span className="w-4 shrink-0" aria-hidden />
          )}
          <span className="font-mono text-[11px] text-faint">{row.code}</span>
          <span className="truncate text-ink-soft">{row.label}</span>
        </span>
      </th>
      {row.values.map((value, index) => (
        <Cell key={index} value={value} />
      ))}
      <Cell value={row.total} className="border-l border-border font-medium" />
    </tr>
  );
});

/** A share, or the `zero` dash — never `0,0 %`, which would claim a number nobody computed. */
function Cell({ value, className }: { value: number | null; className?: string }) {
  return (
    <td
      className={cn(
        "border-b border-border-faint px-4 py-1.5 text-right tabular-nums",
        value === null ? "text-zero" : "text-ink",
        className,
      )}
    >
      {value === null ? "–" : formatPercent(value)}
    </td>
  );
}

function Th({
  align,
  className,
  children,
}: {
  align: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  return (
    <th
      className={cn(
        "sticky top-0 z-[2] whitespace-nowrap border-b border-border bg-surface-header px-4 py-2.5 text-[11px] font-semibold text-muted",
        align === "left" ? "text-left uppercase tracking-[0.5px]" : "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}
