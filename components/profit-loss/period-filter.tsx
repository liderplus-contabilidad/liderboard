"use client";

import { CalendarRange, FileSpreadsheet } from "lucide-react";
import {
  DropdownDone,
  DropdownFooter,
  DropdownOption,
  Dropdown,
  DropdownPanel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { periodSlotLabel } from "@/lib/profit-loss/analytics/period";
import type { PeriodSlot } from "@/lib/profit-loss/analytics/types";

export interface PeriodFilterProps {
  /** Every period of the active granularity, in calendar order; [] with no dataset loaded. */
  periods: readonly PeriodSlot[];
  selected: readonly PeriodSlot[];
  onToggle: (period: PeriodSlot) => void;
  onClear: () => void;
}

/**
 * "Periodo" filter: checkboxes over the periods of the current "Ver por" granularity, contiguous
 * or not. Marking narrows the X axis every card and the Datos columns share — it never turns a
 * period into its own series, which is the dimension this filter replaces.
 */
export function PeriodFilter({ periods, selected, onToggle, onClear }: PeriodFilterProps) {
  const picked = new Set(selected.map((period) => period.index));

  return (
    <Dropdown>
      <DropdownTrigger active={picked.size > 0} icon={<CalendarRange size={15} />}>
        {picked.size > 0 ? `Periodo · ${picked.size}` : "Periodo"}
      </DropdownTrigger>
      <DropdownPanel width={216}>
        {periods.length === 0 ? (
          <EmptyState icon={<FileSpreadsheet size={22} />}>
            Carga un Excel de Pérdidas y Ganancias para filtrar por periodo.
          </EmptyState>
        ) : (
          <>
            <div className="-mx-1 max-h-72 overflow-auto">
              {periods.map((period) => (
                <DropdownOption
                  key={period.index}
                  selected={picked.has(period.index)}
                  onToggle={() => onToggle(period)}
                >
                  {periodSlotLabel(period)}
                </DropdownOption>
              ))}
            </div>
            <DropdownFooter>
              <Button variant="ghost" size="sm" onClick={onClear}>
                Quitar selección
              </Button>
              <DropdownDone />
            </DropdownFooter>
          </>
        )}
      </DropdownPanel>
    </Dropdown>
  );
}
