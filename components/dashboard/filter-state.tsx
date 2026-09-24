"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { createFilterState } from "@/lib/filter-state";

const FilterStateContext = createContext<ReturnType<typeof createFilterState> | null>(null);

/** Imports can target a client other than the one currently rendered. */
export function useFilterStateWriter<T>(name: string) {
  const store = useContext(FilterStateContext);
  if (!store) throw new Error("useFilterStateWriter must be used within FilterStateProvider");
  return useCallback(
    (scope: string, value: T) => {
      store.write(JSON.stringify([name, scope]), value);
    },
    [store, name],
  );
}

export function FilterStateProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() =>
    createFilterState(() => (typeof window === "undefined" ? undefined : window.localStorage)),
  );
  return <FilterStateContext.Provider value={store}>{children}</FilterStateContext.Provider>;
}

/** Separate each module and client, while retaining useState's functional updates. */
export function useFilterState<T>(
  name: string,
  scope: string | null,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const store = useContext(FilterStateContext);
  if (!store) throw new Error("useFilterState must be used within FilterStateProvider");
  const [fallback] = useState(initial);
  const key = JSON.stringify([name, scope]);
  const read = useCallback(() => store.read(key, fallback), [store, key, fallback]);
  const serverSnapshot = useCallback(() => fallback, [fallback]);
  const value = useSyncExternalStore(store.subscribe, read, serverSnapshot);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (update) => {
      store.write(
        key,
        typeof update === "function"
          ? (update as (previous: T) => T)(store.read(key, fallback))
          : update,
      );
    },
    [store, key, fallback],
  );
  return [value, setValue];
}
