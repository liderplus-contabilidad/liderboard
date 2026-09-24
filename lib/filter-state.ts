type FilterStorage = Pick<Storage, "getItem" | "setItem">;
const PREFIX = "liderboard:filters:v1:";

function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    entry instanceof Set ? { __filterSet: [...entry] } : entry,
  );
}

function deserialize(value: string): unknown {
  return JSON.parse(value, (_key, entry) =>
    entry && typeof entry === "object" && Array.isArray(entry.__filterSet)
      ? new Set(entry.__filterSet)
      : entry,
  );
}

/** Reject damaged or outdated shapes before handing them to filter consumers. */
function compatible(value: unknown, fallback: unknown): boolean {
  if (fallback === null) return value === null || typeof value === "string";
  if (fallback instanceof Set) return value instanceof Set;
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (typeof fallback === "object") {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.entries(fallback).every(
        ([key, entry]) =>
          Object.hasOwn(value, key) && compatible((value as Record<string, unknown>)[key], entry),
      )
    );
  }
  return typeof value === typeof fallback;
}

/** Memory serves renders; browser storage preserves selections across reloads. */
export function createFilterState(storage?: () => FilterStorage | undefined) {
  const values = new Map<string, unknown>();
  const restored = new Set<string>();
  const listeners = new Set<() => void>();
  return {
    read<T>(key: string, fallback: T): T {
      if (!values.has(key) && !restored.has(key)) {
        restored.add(key);
        try {
          const saved = storage?.()?.getItem(PREFIX + key);
          if (saved !== null && saved !== undefined) {
            const value = deserialize(saved);
            if (compatible(value, fallback)) values.set(key, value);
          }
        } catch {
          // Unavailable storage or invalid JSON must not stop filtering.
        }
      }
      return values.has(key) ? (values.get(key) as T) : fallback;
    },
    write<T>(key: string, value: T) {
      if (values.has(key) && Object.is(values.get(key), value)) return;
      values.set(key, value);
      try {
        storage?.()?.setItem(PREFIX + key, serialize(value));
      } catch {
        // Keep navigation working even if browser storage is blocked or full.
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
