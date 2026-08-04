"use client";

import { ChipBar, FilterChip } from "@/components/ui/filter-chip";
import { periodSlotLabel } from "@/lib/profit-loss/analytics/period";
import { usePygData } from "./pyg-data-provider";

/**
 * The active-filter strip under the FILTROS row: one removable chip per marked client, account,
 * center, year and period, plus "Quitar todo". Rendered in all three tabs (it lives in the shared toolbar),
 * and only when something is actually marked — an ever-present empty strip would sit over the
 * table for no reason.
 */
export function ActiveFilterChips() {
  const {
    filters,
    accountOptions,
    views,
    clientOptions,
    toggleCode,
    toggleCenter,
    toggleClient,
    toggleYear,
    togglePeriod,
    clearFilters,
  } = usePygData();

  const total =
    filters.clientIds.length +
    filters.codes.length +
    filters.centerIds.length +
    filters.years.length +
    filters.periods.length;
  if (total === 0) {
    return null;
  }

  return (
    <ChipBar
      onClearAll={clearFilters}
      className="border-t border-border-soft bg-surface-sunken px-7 py-2.5"
    >
      {filters.clientIds.map((id) => (
        <FilterChip
          key={`client-${id}`}
          label={clientOptions.find((option) => option.id === id)?.name ?? id}
          onRemove={() => toggleClient(id)}
        />
      ))}
      {filters.codes.map((code) => (
        <FilterChip
          key={`code-${code}`}
          label={accountOptions.find((option) => option.code === code)?.name ?? code}
          onRemove={() => toggleCode(code)}
        />
      ))}
      {filters.centerIds.map((id) => {
        const view = views.find((candidate) => candidate.id === id);
        return (
          <FilterChip
            key={`center-${id}`}
            label={view?.name ?? id}
            dotColor={view?.color}
            onRemove={() => toggleCenter(id)}
          />
        );
      })}
      {filters.years.map((year) => (
        <FilterChip key={`year-${year}`} label={String(year)} onRemove={() => toggleYear(year)} />
      ))}
      {filters.periods.map((period) => (
        <FilterChip
          key={`period-${period.index}`}
          label={periodSlotLabel(period)}
          onRemove={() => togglePeriod(period)}
        />
      ))}
    </ChipBar>
  );
}
