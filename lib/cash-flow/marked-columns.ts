export const MARKED_COLUMNS = [
  { id: "document", label: "Proveedor · documento", width: 290, numeric: false },
  { id: "dueOn", label: "Vence", width: 96, numeric: false },
  { id: "priority", label: "Estado", width: 132, numeric: false },
  { id: "account", label: "Cuenta", width: 210, numeric: false },
  { id: "payOn", label: "Fecha de pago", width: 128, numeric: false },
  { id: "balance", label: "Saldo", width: 112, numeric: true },
  { id: "urgent", label: "Urgente", width: 124, numeric: true },
  { id: "pending", label: "Pendiente", width: 124, numeric: true },
] as const;

export type MarkedColumnId = (typeof MARKED_COLUMNS)[number]["id"];
export type MarkedColumn = (typeof MARKED_COLUMNS)[number];
export interface MarkedColumnPreferences {
  order: MarkedColumnId[];
  hidden: MarkedColumnId[];
}

export const DEFAULT_MARKED_COLUMNS: MarkedColumnPreferences = {
  order: MARKED_COLUMNS.map((column) => column.id),
  hidden: [],
};

const byId = new Map<MarkedColumnId, MarkedColumn>(
  MARKED_COLUMNS.map((column) => [column.id, column]),
);

/** Preferences can outlive the column catalogue. Keep valid choices, then append new columns.
 * The document stays visible: it identifies the row and opens manual obligations for editing. */
export function sanitizeMarkedColumns(value: unknown): MarkedColumnPreferences {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const validIds = (entries: unknown): MarkedColumnId[] =>
    Array.isArray(entries)
      ? [...new Set(entries.filter((id): id is MarkedColumnId => byId.has(id)))]
      : [];
  const order = validIds(saved.order);
  return {
    order: [...order, ...DEFAULT_MARKED_COLUMNS.order.filter((id) => !order.includes(id))],
    hidden: validIds(saved.hidden).filter((id) => id !== "document"),
  };
}

export function visibleMarkedColumns(preferences: MarkedColumnPreferences): MarkedColumn[] {
  return preferences.order
    .filter((id) => !preferences.hidden.includes(id))
    .map((id) => byId.get(id)!);
}

export function moveMarkedColumn(
  preferences: MarkedColumnPreferences,
  id: MarkedColumnId,
  direction: -1 | 1,
): MarkedColumnPreferences {
  const index = preferences.order.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= preferences.order.length) return preferences;
  const order = [...preferences.order];
  [order[index], order[target]] = [order[target], order[index]];
  return { ...preferences, order };
}
