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
  /** Las que el estado abierto admite. `allowedFrequencies` las devuelve DE LA BASE HACIA ARRIBA:
   * los periodos se agregan, nunca se parten, así que la primera ES la base. */
  allowed: readonly Frequency[];
  onChange: (frequency: Frequency) => void;
}

/**
 * «Ver por»: con qué grano se lee el eje del tiempo.
 *
 * Vive en la BARRA y no en la cabecera de una tarjeta porque lo leen las tres pestañas —Datos lo
 * usa para sus columnas, Gráficos para su eje y Análisis para sus periodos—, que es la misma regla
 * por la que «Ocultar meses en 0» vive fuera de ella.
 *
 * Es un desplegable y no el track de píldoras que fue, por dos motivos. Uno es que la barra sea de
 * un solo material: era el único control con otra forma, y encima colgado al otro extremo de la
 * fila, lejos de «Año» y «Periodo», que gobiernan ese mismo eje. El otro es que una píldora apagada
 * no tiene dónde decir POR QUÉ lo está — un estado trimestral no puede enseñar meses, y eso antes
 * había que adivinarlo—, mientras que aquí la opción se queda en su sitio, deshabilitada, con el
 * motivo escrito debajo.
 *
 * No se pinta nunca en estado `brand`: no es una marca, no produce chip y siempre vale algo. Lo que
 * el rótulo dice es su valor.
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
