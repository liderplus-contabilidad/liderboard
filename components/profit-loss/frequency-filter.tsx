"use client";

import { CalendarClock } from "lucide-react";
import {
  Dropdown,
  DropdownChoice,
  DropdownNote,
  DropdownPanel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { FREQUENCY_ORDER, frequencyLabel } from "@/lib/period";
import type { Frequency } from "@/lib/profit-loss/types";

export interface FrequencyFilterProps {
  value: Frequency;
  /** The ones the open statement admits. `allowedFrequencies` returns them FROM THE BASE UPWARDS:
   * periods aggregate, they never split, so the first one IS the base. */
  allowed: readonly Frequency[];
  onChange: (frequency: Frequency) => void;
}

/**
 * «Ver por»: with what grain the time axis is read.
 *
 * It lives in the BAR and not in a card's header because all three tabs read it —Datos uses it for
 * its columns, Gráficos for its axis and Análisis for its periods—, which is the same rule by which
 * «Ocultar meses en 0» lives outside it.
 *
 * It is a dropdown and not the pill track it used to be, for two reasons. One is that the bar should
 * be of a single material: it was the only control with another shape, and hung at the far end of the
 * row besides, away from «Año» and «Periodo», which govern that same axis. The other is that a
 * switched-off pill has nowhere to say WHY it is off —a quarterly statement cannot show months, and
 * that used to have to be guessed—, whereas here the option stays in place, disabled, with the reason
 * written underneath.
 *
 * It is never painted in the `brand` state: it is not a mark, it produces no chip and it always holds
 * a value. What the label says is its value.
 */
export function FrequencyFilter({ value, allowed, onChange }: FrequencyFilterProps) {
  const base = allowed[0];
  const capped = allowed.length < FREQUENCY_ORDER.length;

  return (
    <Dropdown>
      <DropdownTrigger icon={<CalendarClock size={15} />}>
        Ver por · {frequencyLabel(value)}
      </DropdownTrigger>
      <DropdownPanel width={224}>
        <div className="px-1.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faintest">
          Agrupar los periodos
        </div>
        <div className="-mx-1">
          {FREQUENCY_ORDER.map((frequency) => (
            <DropdownChoice
              key={frequency}
              selected={frequency === value}
              disabled={!allowed.includes(frequency)}
              onSelect={() => onChange(frequency)}
            >
              {frequencyLabel(frequency)}
            </DropdownChoice>
          ))}
        </div>
        {base && capped && (
          <DropdownNote>
            El estado abierto es {frequencyLabel(base).toLowerCase()}: sus periodos se pueden sumar,
            pero no partir en otros más finos.
          </DropdownNote>
        )}
      </DropdownPanel>
    </Dropdown>
  );
}
