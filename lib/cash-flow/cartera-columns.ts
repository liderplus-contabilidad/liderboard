import { moveColumn, sanitizeColumnPreferences, type ColumnPreferences } from "@/lib/table-columns";

export const CARTERA_COLUMNS = [
  { id: "document", label: "Proveedor · documento", width: 460, numeric: false },
  { id: "detail", label: "Detalle", width: 86, numeric: false },
  { id: "issuedOn", label: "Emisión", width: 92, numeric: false },
  { id: "dueOn", label: "Vence", width: 92, numeric: false },
  { id: "amount", label: "Valor doc.", width: 108, numeric: true },
  { id: "payments", label: "Abonos", width: 100, numeric: true },
  { id: "balance", label: "Saldo", width: 118, numeric: true },
  { id: "payOn", label: "Programado", width: 96, numeric: false },
  { id: "approval", label: "Aprobación", width: 98, numeric: false },
] as const;

export type CarteraColumnId = (typeof CARTERA_COLUMNS)[number]["id"];
export type CarteraColumn = (typeof CARTERA_COLUMNS)[number];
export type CarteraColumnPreferences = ColumnPreferences<CarteraColumnId>;

export const DEFAULT_CARTERA_COLUMNS: CarteraColumnPreferences = {
  order: CARTERA_COLUMNS.map((column) => column.id),
  hidden: [],
};

export function sanitizeCarteraColumns(value: unknown): CarteraColumnPreferences {
  return sanitizeColumnPreferences(value, DEFAULT_CARTERA_COLUMNS.order, ["document"]);
}

export function visibleCarteraColumns(preferences: CarteraColumnPreferences): CarteraColumn[] {
  return preferences.order
    .filter((id) => !preferences.hidden.includes(id))
    .map((id) => CARTERA_COLUMNS.find((column) => column.id === id)!);
}

export const moveCarteraColumn = moveColumn<CarteraColumnId>;
