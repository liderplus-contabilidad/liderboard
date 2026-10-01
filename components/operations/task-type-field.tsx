"use client";

import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { searchText } from "@/lib/operations/model";

export function TaskTypeField({
  value,
  options,
  onCommit,
  id,
  appearance = "field",
  completed = false,
  disabled = false,
}: {
  value: string;
  options: readonly SearchableSelectOption[];
  onCommit: (title: string) => Promise<void>;
  id?: string;
  appearance?: "field" | "inline";
  completed?: boolean;
  disabled?: boolean;
}) {
  return (
    <SearchableSelect
      id={id}
      label="Proceso"
      ariaLabel="Tipo de tarea"
      value={searchText(value)}
      options={options}
      fallbackLabel={value || undefined}
      allowAll={false}
      allLabel="Elegir o crear proceso"
      searchPlaceholder="Buscar o crear proceso…"
      appearance={appearance}
      completed={completed}
      disabled={disabled}
      className="w-full"
      onChange={async (next) => {
        const option = options.find((option) => option.value === next);
        if (option) await onCommit(option.label);
      }}
      onCreate={onCommit}
    />
  );
}
