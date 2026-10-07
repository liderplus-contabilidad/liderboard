"use client";

import { ColumnPreferencesButton } from "@/components/ui/column-preferences";
import {
  DEFAULT_MARKED_COLUMNS,
  MARKED_COLUMNS,
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
    <ColumnPreferencesButton
      preferences={preferences}
      onChange={onChange}
      columns={MARKED_COLUMNS}
      defaults={DEFAULT_MARKED_COLUMNS}
      label="pagos marcados"
      requiredColumnId="document"
      requiredHint="Proveedor · documento permanece visible."
    />
  );
}
