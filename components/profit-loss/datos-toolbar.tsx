"use client";

import { PygExcelActions } from "./pyg-excel-actions";

/**
 * Datos-tab action bar, rendered under the FILTROS row for Pérdidas y Ganancias › Datos: the
 * Excel actions — upload, a download menu, and an accepted-files info tip. Which center Datos
 * shows is the "Centro de costo" filter's job now (in the shared FILTROS row); tree depth is the
 * "Nivel" filter's (see PygToolbar) — this bar carries no selector of its own.
 */
export function DatosToolbar() {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-b border-border bg-surface-sunken px-7 py-2.5">
      <PygExcelActions />
    </div>
  );
}
