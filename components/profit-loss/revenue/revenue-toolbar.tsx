"use client";

import { CalendarDays, CalendarRange, SlidersHorizontal, Layers } from "lucide-react";
import type { ReactNode } from "react";
import {
  Dropdown,
  DropdownChoice,
  DropdownNote,
  DropdownOption,
  DropdownPanel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { ChipBar, FilterChip } from "@/components/ui/filter-chip";
import { Toolbar, ToolbarLabel } from "@/components/ui/toolbar";
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";
import { SPAN_KINDS, spanKindLabel, type NamedSpan, type SpanKind } from "@/lib/period";
import {
  activeMarkCount,
  availableSpans,
  markedSpanOf,
  namedSpanLabel,
  spanIsMarked,
} from "@/lib/revenue/filters";
import { useRevenueData } from "./revenue-data-provider";

/**
 * The module's selection surface: **Año · Mes**, the active marks and the page's actions.
 *
 * There is no «Centro de costo» and no «Cuenta contable». The reading is one account —the raíz 4—
 * and it is of the COMPANY, summing every center like the workbook this replaces; offering to narrow
 * either would be offering a question this screen does not answer.
 *
 * **The years leave NO chip**, unlike the months — and the reason is that the screen OPENS with every
 * one of them marked: a chip per year would fill the strip before the user has touched anything, and
 * a strip of active marks that is full by default says nothing. The dropdown's own label already
 * carries the whole selection.
 */
export function RevenueToolbar({ actions }: { actions?: ReactNode }) {
  const { universe, filters, toggleYear, clearYears, toggleMonth, clearMonths, toggleSpan } =
    useRevenueData();
  const markedYears = new Set(filters.years);
  const markedMonths = new Set(filters.months);
  // DERIVED, never stored: if the marks ARE a named span the strip says «Q1» instead of five month
  // chips. There is no fourth mark to keep in sync, which is what lets the shortcut stay a shortcut.
  const span = markedSpanOf(filters.months);

  return (
    // EDGE TO EDGE and not a card: it reads as a continuation of the header instead of a control
    // floating over the page — the same bar PyG hangs under its tabs.
    <div className="border-b border-border bg-surface">
      <Toolbar>
        {universe.years.length > 0 && (
          <>
            <ToolbarLabel icon={<SlidersHorizontal size={15} />}>Filtros</ToolbarLabel>

            <Dropdown>
              <DropdownTrigger active icon={<CalendarDays size={15} />}>
                {`Año · ${filters.years.join(", ") || "—"}`}
              </DropdownTrigger>
              <DropdownPanel width={230}>
                {universe.years.length > 1 && (
                  <div className="-mx-1 mb-1">
                    {/* It EMPTIES the marks, exactly as «Todos los meses cargados» does: no mark
                        already means all of them, and it is where the screen opens. */}
                    <DropdownChoice
                      selected={markedYears.size === universe.years.length}
                      onSelect={clearYears}
                    >
                      Todos los años
                    </DropdownChoice>
                  </div>
                )}
                <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
                  {[...universe.years]
                    .sort((a, b) => b - a)
                    .map((year) => (
                      <DropdownOption
                        key={year}
                        selected={markedYears.has(year)}
                        onToggle={() => toggleYear(year)}
                      >
                        <span className="font-mono tabular-nums">{year}</span>
                      </DropdownOption>
                    ))}
                </div>
                <DropdownNote>
                  Sin marcas se ven todos. Marca uno para leer el año mes a mes, o varios para
                  compararlos: el más reciente es la referencia del crecimiento.
                </DropdownNote>
              </DropdownPanel>
            </Dropdown>

            {universe.months.length > 0 && (
              <Dropdown>
                <DropdownTrigger active={markedMonths.size > 0} icon={<CalendarRange size={15} />}>
                  {markedMonths.size > 0
                    ? `Mes · ${filters.months.map((month) => MONTHS_SHORT_ES[month]).join(", ")}`
                    : "Mes"}
                </DropdownTrigger>
                <DropdownPanel width={230}>
                  <div className="-mx-1 mb-1">
                    <DropdownChoice selected={markedMonths.size === 0} onSelect={clearMonths}>
                      Todos los meses cargados
                    </DropdownChoice>
                  </div>
                  <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
                    {universe.months.map((month) => (
                      <DropdownOption
                        key={month}
                        selected={markedMonths.has(month)}
                        onToggle={() => toggleMonth(month)}
                      >
                        {MONTHS_FULL_ES[month]}
                      </DropdownOption>
                    ))}
                  </div>
                  {/* What marking does here is not obvious and is said where it is decided: it is
                      what makes a comparison comparable. */}
                  <DropdownNote>
                    Acota el mismo tramo en TODOS los años marcados, para no comparar siete meses de
                    uno contra doce de otro.
                  </DropdownNote>
                </DropdownPanel>
              </Dropdown>
            )}

            {/* Semestre y quimestre son ATAJOS: marcan meses y no abren un cuarto eje. Un tramo sin
                ningún mes cargado NO se dibuja, la regla de la barra para un control que no significa
                nada para los datos abiertos. */}
            {SPAN_KINDS.map((kind) => (
              <SpanFilter
                key={kind}
                kind={kind}
                spans={availableSpans(kind, universe.months)}
                isMarked={(entry) => spanIsMarked(filters, entry, universe.months)}
                onToggle={toggleSpan}
              />
            ))}
          </>
        )}

        {actions && <div className="ml-auto flex shrink-0 items-center gap-2.5">{actions}</div>}
      </Toolbar>

      {activeMarkCount(filters) > 0 && (
        <ChipBar
          onClearAll={clearMonths}
          className="border-t border-border-soft bg-surface-sunken px-7 py-2.5"
        >
          {span ? (
            <FilterChip label={namedSpanLabel(span)} onRemove={clearMonths} />
          ) : (
            filters.months.map((month) => (
              <FilterChip
                key={month}
                label={MONTHS_FULL_ES[month]}
                onRemove={() => toggleMonth(month)}
              />
            ))
          )}
        </ChipBar>
      )}
    </div>
  );
}

/**
 * One span kind as a dropdown — «Semestre», «Quimestre».
 *
 * The trigger names the marked tramo and not the kind, so a bar with «Q1 · Ene–May» on it says what
 * is narrowed without the reader opening anything. Marking a span marks its LOADED months only: a
 * shortcut cannot select a month the data does not have.
 */
function SpanFilter({
  kind,
  spans,
  isMarked,
  onToggle,
}: {
  kind: SpanKind;
  spans: NamedSpan[];
  isMarked: (span: NamedSpan) => boolean;
  onToggle: (span: NamedSpan) => void;
}) {
  if (spans.length === 0) {
    return null;
  }
  const marked = spans.filter(isMarked);

  return (
    <Dropdown>
      <DropdownTrigger active={marked.length > 0} icon={<Layers size={15} />}>
        {marked.length > 0
          ? `${spanKindLabel(kind)} · ${marked.map((span) => span.code).join(", ")}`
          : spanKindLabel(kind)}
      </DropdownTrigger>
      <DropdownPanel width={230}>
        <div className="-mx-1">
          {spans.map((span) => (
            <DropdownOption
              key={span.code}
              selected={isMarked(span)}
              onToggle={() => onToggle(span)}
            >
              {namedSpanLabel(span)}
            </DropdownOption>
          ))}
        </div>
        <DropdownNote>
          {kind === "quimestre"
            ? "El quimestre son cinco meses y el año tiene doce: Q3 son los dos que sobran, nov–dic. Marca los mismos meses que «Mes» — es un atajo, no otro filtro."
            : "Marca los meses del semestre en todos los años marcados. Es un atajo sobre «Mes», no un filtro aparte."}
        </DropdownNote>
      </DropdownPanel>
    </Dropdown>
  );
}
