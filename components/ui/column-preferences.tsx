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
import { moveColumn, type ColumnPreferences } from "@/lib/table-columns";

interface PreferencesProps<Id extends string> {
  preferences: ColumnPreferences<Id>;
  onChange: (preferences: ColumnPreferences<Id>) => void;
  columns: readonly { id: Id; label: string }[];
  defaults: ColumnPreferences<Id>;
  label: string;
  requiredColumnId: Id;
  requiredHint: string;
}

/** The same visibility and ordering control for every table. */
export function ColumnPreferencesButton<Id extends string>(props: PreferencesProps<Id>) {
  return (
    <Dropdown>
      <PreferencesContent {...props} />
    </Dropdown>
  );
}

function PreferencesContent<Id extends string>(props: PreferencesProps<Id>) {
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
        aria-label={`Preferencias de columnas de ${props.label}`}
        title="Preferencias de columnas"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
      />
      <DropdownPanel align="right" width={340}>
        <PreferencesList id={panelId} {...props} />
      </DropdownPanel>
    </>
  );
}

function PreferencesList<Id extends string>({
  id,
  preferences,
  onChange,
  columns,
  defaults,
  label,
  requiredColumnId,
  requiredHint,
}: PreferencesProps<Id> & { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { triggerRef } = useDropdown();
  useEffect(() => {
    const trigger = triggerRef.current;
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => trigger?.focus();
  }, [triggerRef]);

  return (
    <div id={id} ref={ref} aria-label={`Columnas de ${label}`}>
      <p className="text-[13px] font-semibold text-ink">Columnas de {label}</p>
      <p className="mt-1 mb-2 text-[11.5px] text-muted">
        Elige cuáles mostrar y usa las flechas para ordenarlas.
      </p>
      <div className="max-h-[360px] overflow-y-auto">
        {preferences.order.map((columnId, index) => {
          const column = columns.find((entry) => entry.id === columnId)!;
          const visible = !preferences.hidden.includes(columnId);
          const required = columnId === requiredColumnId;
          return (
            <div key={columnId} className="flex items-center gap-1 py-0.5">
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={visible}
                disabled={required}
                title={required ? requiredHint : undefined}
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
                onClick={() => onChange(moveColumn(preferences, columnId, -1))}
              />
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon={<ArrowDown size={14} />}
                aria-label={`Mover ${column.label} a la derecha`}
                title="Mover a la derecha"
                disabled={index === preferences.order.length - 1}
                onClick={() => onChange(moveColumn(preferences, columnId, 1))}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11.5px] text-muted">{requiredHint}</p>
      <DropdownFooter>
        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={13} />}
          onClick={() => onChange(defaults)}
        >
          Restablecer
        </Button>
        <DropdownDone />
      </DropdownFooter>
    </div>
  );
}
