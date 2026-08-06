"use client";

import type { KeyboardEvent } from "react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { formatAmount, formatNumber, parseCurrency } from "@/lib/format";

interface NumericInputProps {
  /** `null` se pinta VACÍO, nunca como cero — la distinción que `PAGADO` necesita para que un
   *  período sin conciliar no afirme que no se pagó nada. */
  value: number | null;
  /** Solo se llama cuando el valor CAMBIA. Emite `null` únicamente con `nullable`. */
  onCommit: (value: number | null) => void;
  /** `amount` = dos decimales siempre («1,234.00»), que es lo que se compara contra una hoja de
   *  cálculo celda por celda; `plain` = número agrupado sin relleno («30»), para una cantidad. */
  format?: "amount" | "plain";
  /** Con `true`, vaciar el campo emite `null`; sin él, vaciarlo revierte al valor anterior en vez
   *  de inventar un cero. */
  nullable?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
  align?: "left" | "right";
  className?: string;
}

/**
 * Un input de importe o cantidad con BORRADOR local: mientras tiene el foco escribe sobre su propio
 * texto y solo confirma al salir o con Enter, así una re-render de arriba —el motor del rol deriva
 * veinte columnas con cada tecla— no puede arrancarle el cursor. Escape descarta el borrador.
 *
 * El texto se siembra con los formateadores de `@/lib/format`, que es lo que hace que el valor dé
 * la vuelta completa: `formatAmount(1234.5)` → «1,234.50» → `parseCurrency` → `1234.5`. Un texto
 * que no parsea NO se confirma: revertir es más honesto que escribir un cero que nadie tecleó.
 *
 * Es la misma mecánica que la celda diaria de Ocupaciones, extraída aquí porque el detalle de
 * nómina la necesita en dos formas distintas —campo de ficha y celda de tabla— y una segunda copia
 * podría separarse de la primera en qué considera «vacío».
 */
export function NumericInput({
  value,
  onCommit,
  format = "amount",
  nullable = false,
  disabled = false,
  ariaLabel,
  placeholder = "–",
  align = "right",
  className,
}: NumericInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const seed =
    value === null ? "" : format === "amount" ? formatAmount(value) : formatNumber(value);

  const commit = useCallback(
    (text: string) => {
      setDraft(null);
      const trimmed = text.trim();
      if (trimmed === "") {
        if (nullable && value !== null) {
          onCommit(null);
        }
        return;
      }
      const parsed = parseCurrency(trimmed);
      if (parsed !== null && parsed !== value) {
        onCommit(parsed);
      }
    },
    [nullable, onCommit, value],
  );

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") {
      setDraft(null);
      event.currentTarget.blur();
    }
  }, []);

  return (
    <input
      inputMode="decimal"
      value={draft ?? seed}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={handleKeyDown}
      className={cn(
        "w-full bg-transparent font-mono text-ink outline-none transition-colors placeholder:text-faint disabled:cursor-not-allowed disabled:text-muted",
        align === "right" ? "text-right tabular-nums" : "text-left tabular-nums",
        className,
      )}
    />
  );
}
