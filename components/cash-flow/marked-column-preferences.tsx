"use client";

import { ArrowDown, ArrowUp, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dropdown,
  DropdownDone,
  DropdownFooter,
  DropdownPanel,
  useDropdown,
} from "@/components/ui/dropdown";
import {
  DEFAULT_MARKED_COLUMNS,
  MARKED_COLUMNS,
  moveMarkedColumn,
  type MarkedColumnPreferences,
} from "@/lib/cash-flow/marked-columns";

export function MarkedColumnPreferencesButton({
  preferences,
  onChange,
}: {
  preferences: MarkedColumnPreferences;
  onChange: (preferences: MarkedColumnPreferences) => void;
}) {
  return (
    <Dropdown>
      <PreferencesContent preferences={preferences} onChange={onChange} />
    </Dropdown>
  );
}

function PreferencesContent({
  preferences,
  onChange,
}: {
  preferences: MarkedColumnPreferences;
  onChange: (preferences: MarkedColumnPreferences) => void;
}) {
  const { open, setOpen, triggerRef } = useDropdown();
  const panelId = useId();
  return (
    <>
      <Button
        ref={triggerRef}
        variant="secondary"
        size="sm"
        iconOnly
        icon={<SlidersHorizontal size={15} />}
        aria-label="Preferencias de columnas de pagos marcados"
        title="Preferencias de columnas"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
      />
      <DropdownPanel align="right" width={340}>
        <PreferencesList id={panelId} preferences={preferences} onChange={onChange} />
      </DropdownPanel>
    </>
  );
}

function PreferencesList({
  id,
  preferences,
  onChange,
}: {
  id: string;
  preferences: MarkedColumnPreferences;
  onChange: (preferences: MarkedColumnPreferences) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { triggerRef } = useDropdown();
  useEffect(() => {
    const trigger = triggerRef.current;
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => trigger?.focus();
  }, [triggerRef]);

  return (
    <div id={id} ref={ref} aria-label="Columnas de pagos marcados">
      <p className="text-[13px] font-semibold text-ink">Columnas de pagos marcados</p>
      <p className="mt-1 mb-2 text-[11.5px] text-muted">
        Elige cuáles mostrar y usa las flechas para ordenarlas.
      </p>
      <div className="max-h-[360px] overflow-y-auto">
        {preferences.order.map((columnId, index) => {
          const column = MARKED_COLUMNS.find((entry) => entry.id === columnId)!;
          const visible = !preferences.hidden.includes(columnId);
          const required = columnId === "document";
          return (
            <div key={columnId} className="flex items-center gap-1 py-0.5">
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={visible}
                disabled={required}
                title={required ? "Siempre visible para identificar el pago" : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-[9px] px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-canvas disabled:cursor-default disabled:text-muted focus-visible:outline-2 focus-visible:outline-brand"
                onClick={() =>
                  onChange({
                    ...preferences,
                    hidden: visible
                      ? [...preferences.hidden, columnId]
                      : preferences.hidden.filter((hidden) => hidden !== columnId),
                  })
                }
              >
                <Checkbox checked={visible} size={17} />
                <span>{column.label}</span>
              </button>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon={<ArrowUp size={14} />}
                aria-label={`Mover ${column.label} a la izquierda`}
                title="Mover a la izquierda"
                disabled={index === 0}
                onClick={() => onChange(moveMarkedColumn(preferences, columnId, -1))}
              />
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon={<ArrowDown size={14} />}
                aria-label={`Mover ${column.label} a la derecha`}
                title="Mover a la derecha"
                disabled={index === preferences.order.length - 1}
                onClick={() => onChange(moveMarkedColumn(preferences, columnId, 1))}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11.5px] text-muted">Proveedor · documento permanece visible.</p>
      <DropdownFooter>
        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={13} />}
          onClick={() => onChange(DEFAULT_MARKED_COLUMNS)}
        >
          Restablecer
        </Button>
        <DropdownDone />
      </DropdownFooter>
    </div>
  );
}
