type FilterStorage = Pick<Storage, "getItem" | "setItem"> &
  Partial<Pick<Storage, "length" | "key" | "removeItem">>;
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
  const resetNamespaces = new Set<string>();
  const resetNames = new Set<string>();
  const initialValues = new Map<string, unknown>();
  const preferenceName = (key: string): string | undefined => {
    try {
      const [name] = JSON.parse(key);
      return typeof name === "string" ? name : undefined;
    } catch {
      return undefined;
    }
  };
  const inNamespace = (key: string, namespace: string) => {
    try {
      const [name] = JSON.parse(key);
      return typeof name === "string" && name.startsWith(namespace + ".");
    } catch {
      return false;
    }
  };
  const hasName = (key: string, names: ReadonlySet<string>) => {
    try {
      const [name] = JSON.parse(key);
      return names.has(name);
    } catch {
      return false;
    }
  };
  return {
    read<T>(key: string, fallback: T): T {
      if (!values.has(key) && !restored.has(key)) {
        restored.add(key);
        try {
          const wasReset =
            hasName(key, resetNames) ||
            [...resetNamespaces].some((namespace) => inNamespace(key, namespace));
          const saved = wasReset ? undefined : storage?.()?.getItem(PREFIX + key);
          if (saved !== null && saved !== undefined) {
            const value = deserialize(saved);
            if (compatible(value, fallback)) values.set(key, value);
          }
        } catch {
          // Unavailable storage or invalid JSON must not stop filtering.
        }
      }
      if (values.has(key)) return values.get(key) as T;
      const name = preferenceName(key);
      if (name && initialValues.has(name)) {
        const initial = initialValues.get(name);
        if (compatible(initial, fallback)) return initial as T;
      }
      return fallback;
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
    /** Clear every client scope, retaining an in-memory reset even if storage is blocked. */
    resetNamespace(
      namespace: string,
      legacyNames: readonly string[] = [],
      freshInitialValues: Readonly<Record<string, unknown>> = {},
    ): boolean {
      resetNamespaces.add(namespace);
      for (const name of legacyNames) resetNames.add(name);
      const names = new Set(legacyNames);
      const matches = (key: string) => inNamespace(key, namespace) || hasName(key, names);
      // A still-mounted consumer may hold yesterday's initial date. Refresh it for every scope,
      // without persisting a preference or unmounting an unrelated module's page.
      const matchingName = (name: string) => name.startsWith(namespace + ".") || names.has(name);
      for (const name of initialValues.keys()) {
        if (matchingName(name)) initialValues.delete(name);
      }
      for (const [name, value] of Object.entries(freshInitialValues)) {
        if (matchingName(name)) initialValues.set(name, value);
      }
      for (const key of new Set([...values.keys(), ...restored])) {
        if (matches(key)) {
          values.delete(key);
          restored.delete(key);
        }
      }
      let persisted = true;
      try {
        const target = storage?.();
        if (target) {
          if (!target.key || !target.removeItem || target.length === undefined) {
            persisted = false;
          } else {
            const keys = Array.from({ length: target.length }, (_, index) => target.key!(index));
            for (const key of keys) {
              if (key?.startsWith(PREFIX) && matches(key.slice(PREFIX.length))) {
                try {
                  target.removeItem(key);
                } catch {
                  persisted = false;
                }
              }
            }
          }
        }
      } catch {
        persisted = false;
      }
      listeners.forEach((listener) => listener());
      return persisted;
    },
  };
}
