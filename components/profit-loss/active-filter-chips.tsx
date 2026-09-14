"use client";

import { ChipBar, FilterChip } from "@/components/ui/filter-chip";
import { periodSlotLabel } from "@/lib/profit-loss/analytics/period";
import { findPreset } from "@/lib/profit-loss/charts/preset-views";
import { usePygData } from "./pyg-data-provider";

/**
 * The active-filter strip under the FILTROS row: one removable chip per marked client, account,
 * center and period, plus "Quitar todo". Rendered in all three tabs (it lives in the shared toolbar),
 * and only when something is actually marked — an ever-present empty strip would sit over the
 * table for no reason.
 *
 * YEARS are not chipped, as in Ventas' bar: there is always a year on screen, so a chip for it
 * would be the one mark that cannot be removed —unmarking the only year resolves right back to
 * it— and its trigger already names what is on screen (`Año · 2026`). «Quitar todo» still resets
 * them, to the most recent year.
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
    togglePeriod,
    clearPreset,
    clearFilters,
  } = usePygData();
  const presetLabel = findPreset(filters.preset)?.label;

  const total =
    filters.clientIds.length +
    filters.codes.length +
    filters.centerIds.length +
    filters.periods.length +
    (filters.preset === null ? 0 : 1);
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
      {presetLabel === undefined ? null : <FilterChip label={presetLabel} onRemove={clearPreset} />}
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
