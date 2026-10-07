export interface ColumnPreferences<Id extends string> {
  order: Id[];
  hidden: Id[];
}

/** Saved settings can outlive the catalogue: retain valid choices and append new columns. */
export function sanitizeColumnPreferences<Id extends string>(
  value: unknown,
  ids: readonly Id[],
  required: readonly Id[],
): ColumnPreferences<Id> {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const validIds = (entries: unknown): Id[] =>
    Array.isArray(entries) ? [...new Set(entries.filter((id): id is Id => ids.includes(id)))] : [];
  const order = validIds(saved.order);
  return {
    order: [...order, ...ids.filter((id) => !order.includes(id))],
    hidden: validIds(saved.hidden).filter((id) => !required.includes(id)),
  };
}

export function moveColumn<Id extends string>(
  preferences: ColumnPreferences<Id>,
  id: Id,
  direction: -1 | 1,
): ColumnPreferences<Id> {
  const index = preferences.order.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= preferences.order.length) return preferences;
  const order = [...preferences.order];
  [order[index], order[target]] = [order[target], order[index]];
  return { ...preferences, order };
}
