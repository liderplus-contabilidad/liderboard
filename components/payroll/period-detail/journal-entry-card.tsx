"use client";

import { Eye, EyeOff } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { DataGrid, GridRow } from "@/components/data-table/data-grid";
import { Cell, HeadCell } from "@/components/data-table/grid-cells";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatAmount, pluralize } from "@/lib/format";
import { movingJournalLines, type JournalEntry } from "@/lib/payroll/journal";
import { periodLongLabel } from "@/lib/payroll/periods";
import { JournalEntryRow } from "./journal-entry-row";

interface JournalEntryCardProps {
  entry: JournalEntry;
  /** El período que la tarjeta rotula. */
  year: number;
  monthIndex: number;
  /** Los importes vienen de datos de muestra y no del período. Mientras sea `true` la cabecera lo
   *  declara. */
  sample: boolean;
}

/**
 * La tarjeta del asiento contable del rol: cabecera con totales + distintivo de cuadre, tabla de
 * cuentas y pie «SUMAN». «Ocultar ceros» solo decide qué filas se PINTAN — el pie y los totales de
 * la cabecera siempre leen `entry.debit`/`entry.credit`, nunca la suma de lo visible.
 */
export function JournalEntryCard({ entry, year, monthIndex, sample }: JournalEntryCardProps) {
  const [hideZero, setHideZero] = useState(false);

  const visibleLines = useMemo(
    () => (hideZero ? movingJournalLines(entry) : entry.lines),
    [entry, hideZero],
  );
  const hiddenCount = entry.lines.length - visibleLines.length;
  // Redondeada al centavo: el cuadre (`entry.balanced`) se decide con `sameToTheCentavo`, que
  // compara redondeando, así que sin este redondeo la cabecera podía leer «Descuadra 0.00».
  const difference = Math.round((entry.debit - entry.credit) * 100) / 100;

  const toggleHideZero = useCallback(() => setHideZero((value) => !value), []);

  return (
    <div className="overflow-hidden rounded-[13px] border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-header px-[18px] py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">Asiento contable del rol</p>
          <p className="truncate text-[11.5px] text-faint">
            Consolidado del rol · {periodLongLabel(year, monthIndex)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <TotalFigure label="Debe" value={entry.debit} />
          <TotalFigure label="Haber" value={entry.credit} />

          {entry.balanced ? (
            <Badge variant="positive">Cuadra</Badge>
          ) : (
            <span className="flex items-center gap-1.5">
              <Badge variant="warning">Descuadra</Badge>
              <span className="font-mono text-[11.5px] font-semibold tabular-nums text-warning">
                {formatAmount(difference)}
              </span>
            </span>
          )}

          {sample && <Badge variant="warning">Datos de muestra</Badge>}

          {/* Vive en la cabecera de esta tarjeta y no en la barra: lo lee una sola tarjeta, igual
              que el «Ver por» de Ocupaciones y el «Base» de Análisis. */}
          <Button
            size="sm"
            variant="secondary"
            aria-pressed={hideZero}
            onClick={toggleHideZero}
            icon={hideZero ? <Eye size={14} /> : <EyeOff size={14} />}
            className={cn(
              "font-medium",
              hideZero && "border-brand/40 bg-brand-soft text-brand hover:bg-brand-soft",
            )}
          >
            {hideZero ? "Mostrar ceros" : "Ocultar ceros"}
          </Button>
        </div>
      </header>

      <DataGrid minWidth={680}>
        <thead>
          <tr>
            <HeadCell width={110}>Código</HeadCell>
            <HeadCell width={280}>Cuenta</HeadCell>
            <HeadCell align="right" width={140}>
              Debe
            </HeadCell>
            <HeadCell align="right" width={140}>
              Haber
            </HeadCell>
          </tr>
        </thead>
        <tbody>
          {visibleLines.map((line) => (
            <JournalEntryRow key={line.id} line={line} />
          ))}
        </tbody>
        <tfoot>
          <GridRow muted>
            <Cell />
            <Cell>
              <span className="font-semibold text-ink">SUMAN</span>
            </Cell>
            <Cell numeric>
              <span className="font-mono font-semibold text-ink">{formatAmount(entry.debit)}</span>
            </Cell>
            <Cell numeric>
              <span className="font-mono font-semibold text-ink">{formatAmount(entry.credit)}</span>
            </Cell>
          </GridRow>
        </tfoot>
      </DataGrid>

      {hideZero && hiddenCount > 0 && (
        <p className="border-t border-border bg-surface-header px-[18px] py-2 text-[11.5px] text-faint">
          {pluralize(hiddenCount, "cuenta oculta", "cuentas ocultas")}
        </p>
      )}
    </div>
  );
}

function TotalFigure({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-right">
      <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">{label}</p>
      <p className="font-mono text-[13px] font-semibold tabular-nums text-ink">
        {formatAmount(value)}
      </p>
    </div>
  );
}
