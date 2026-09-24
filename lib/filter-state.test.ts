import { describe, expect, it } from "vitest";
import { createFilterState } from "./filter-state";

describe("dashboard filter state", () => {
  function browserStorage() {
    const entries = new Map<string, string>();
    return {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
    };
  }

  it("restores filters and account levels after reload, including cleared selections", () => {
    const storage = browserStorage();
    const store = createFilterState(() => storage);
    store.write("sales:a", { years: [2025], months: [2, 5] });
    store.write("levels:a", new Set(["4", "5"]));
    const reloaded = createFilterState(() => storage);
    expect(reloaded.read("sales:a", { years: [], months: [] })).toEqual({
      years: [2025],
      months: [2, 5],
    });
    expect(reloaded.read("levels:a", new Set())).toEqual(new Set(["4", "5"]));
    expect(reloaded.read("sales:b", { years: [], months: [] })).toEqual({ years: [], months: [] });
    reloaded.write("sales:a", { years: [], months: [] });
    expect(createFilterState(() => storage).read("sales:a", { years: [], months: [] })).toEqual({
      years: [],
      months: [],
    });
  });

  it("reads a saved snapshot once and keeps its identity stable", () => {
    const storage = browserStorage();
    createFilterState(() => storage).write("sales", { months: [2] });
    const store = createFilterState(() => storage);
    expect(store.read("sales", { months: [] })).toBe(store.read("sales", { months: [] }));
  });

  it.each(["broken JSON", "null", '{"months":5}'])("ignores damaged saved filters: %s", (saved) => {
    const store = createFilterState(() => ({ getItem: () => saved, setItem: () => {} }));
    expect(store.read("sales", { months: [] })).toEqual({ months: [] });
  });

  it("continues in memory when browser storage is unavailable", () => {
    const store = createFilterState(() => {
      throw new Error("Storage blocked");
    });
    expect(store.read("sales", [])).toEqual([]);
    expect(() => store.write("sales", [2025])).not.toThrow();
    expect(store.read("sales", [])).toEqual([2025]);
  });

  it("restores selections after a page unsubscribes and returns", () => {
    const store = createFilterState();
    const key = JSON.stringify(["sales.filters", "client-a"]);
    const unsubscribe = store.subscribe(() => {});
    store.write(key, { years: [2025], months: [2, 5] });
    unsubscribe();
    expect(store.read(key, {})).toEqual({ years: [2025], months: [2, 5] });
    store.write(key, { years: [], months: [] });
    expect(store.read(key, {})).toEqual({ years: [], months: [] });
  });

  it("isolates modules, clients and dashboard instances", () => {
    const store = createFilterState();
    store.write('["sales","a"]', [2025]);
    expect(store.read('["sales","b"]', [])).toEqual([]);
    expect(store.read('["payroll","a"]', [])).toEqual([]);
    expect(createFilterState().read('["sales","a"]', [])).toEqual([]);
  });
});
