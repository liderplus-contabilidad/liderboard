"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The tab bar of ANY view — icon, label and the active one's `brand` underline, over a `surface`
 * strip closed off at the bottom.
 *
 * It exists because the same look is needed by two places that share no structure: `ModuleTabs`
 * (a module's Datos · Gráficos · Análisis, read from the registry in `lib/modules.ts`) and the inner
 * tabs of Rol de Pagos' período detail, which are neither a module nor in that registry. Writing them
 * twice is what makes one fall behind when the other changes —and it had already happened: the detail
 * used a `SegmentedControl`, which in this app means another thing (choosing how ONE card is seen,
 * like Ocupaciones' «Ver por»), not switching view.
 *
 * What it does NOT own is the horizontal margin: each place sets it through `className`, because the
 * width the strip aligns to belongs to the surrounding content, not to the bar.
 */

export interface TabBarItem<Id extends string = string> {
  id: Id;
  label: string;
  icon: LucideIcon;
}

interface TabBarProps<Id extends string> {
  items: readonly TabBarItem<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  ariaLabel: string;
  /**
   * Prefix of each tab's `id` and of the `aria-controls` pointing at its panel. Whoever renders the
   * panel must give it `id={`${idPrefix}-panel`}` and `aria-labelledby={`${idPrefix}-tab-${value}`}`
   * to close the pair.
   */
  idPrefix: string;
  /** Aligned with the labels' height, not the underline's — that way the same slot works outside the
   *  bar without dragging the offset along. */
  rightSlot?: ReactNode;
  className?: string;
}

export function TabBar<Id extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  idPrefix,
  rightSlot,
  className,
}: TabBarProps<Id>) {
  return (
    <div
      className={cn(
        "flex items-end justify-between gap-6 border-b border-border bg-surface",
        className,
      )}
    >
      <div role="tablist" aria-label={ariaLabel} className="flex items-end gap-6">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.id === value;

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${item.id}`}
              aria-selected={active}
              aria-controls={`${idPrefix}-panel`}
              onClick={() => onChange(item.id)}
              className={cn(
                "relative flex items-center gap-2 py-2.5 text-sm font-semibold transition-colors",
                active ? "text-brand" : "text-faint hover:text-muted",
              )}
            >
              <Icon size={16} strokeWidth={1.9} />
              {item.label}
              {active && (
                <span className="absolute inset-x-0 -bottom-px h-[2.5px] rounded-[3px] bg-brand" />
              )}
            </button>
          );
        })}
      </div>

      <div className="pb-[11px]">{rightSlot}</div>
    </div>
  );
}
