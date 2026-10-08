import { describe, expect, it } from "vitest";
import { createFilterState } from "./filter-state";

describe("dashboard filter state", () => {
  function browserStorage() {
    const entries = new Map<string, string>();
    return {
      get length() {
        return entries.size;
      },
      key: (index: number) => [...entries.keys()][index] ?? null,
      removeItem: (key: string) => {
        entries.delete(key);
      },
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

  it("resets every scope of one namespace, including unread storage, and notifies consumers", () => {
    const storage = browserStorage();
    const saved = createFilterState(() => storage);
    const a = JSON.stringify(["cash-flow.asOf", "a"]);
    const b = JSON.stringify(["cash-flow.filters", "b"]);
    const other = JSON.stringify(["sales.filters", "a"]);
    const similar = JSON.stringify(["cash-flow-extra.filters", "a"]);
    saved.write(a, "2025-01-01");
    saved.write(b, [1]);
    saved.write(other, [2]);
    saved.write(similar, [3]);
    const store = createFilterState(() => storage);
    expect(store.read(a, "today")).toBe("2025-01-01");
    let notifications = 0;
    store.subscribe(() => {
      notifications++;
    });
    expect(store.resetNamespace("cash-flow")).toBe(true);
    expect(notifications).toBe(1);
    expect(store.read(a, "today")).toBe("today");
    expect(store.read(b, [])).toEqual([]);
    const reload = createFilterState(() => storage);
    expect(reload.read(a, "today")).toBe("today");
    expect(reload.read(b, [])).toEqual([]);
    expect(reload.read(other, [])).toEqual([2]);
    expect(reload.read(similar, [])).toEqual([3]);
  });

  it("resets memory even when persistent storage fails, without rereading stale saved values", () => {
    const storage = browserStorage();
    const key = JSON.stringify(["cash-flow.asOf", "a"]);
    const store = createFilterState(() => ({
      ...storage,
      removeItem: () => {
        throw new Error("blocked");
      },
    }));
    store.write(key, "yesterday");
    expect(store.resetNamespace("cash-flow")).toBe(false);
    expect(store.read(key, "today")).toBe("today");
    const unavailable = createFilterState(() => {
      throw new Error("blocked");
    });
    unavailable.write(key, "yesterday");
    expect(unavailable.resetNamespace("cash-flow")).toBe(false);
    expect(unavailable.read(key, "today")).toBe("today");
  });

  it("resets exact legacy names across client scopes while preserving unrelated preferences", () => {
    const storage = browserStorage();
    const legacyNames = [
      "checks.collectionFilter",
      "checks.tableSort",
      "cash-flow:cartera-columns",
      "cash-flow:marked-columns",
    ];
    const saved = createFilterState(() => storage);
    for (const name of legacyNames) {
      for (const scope of ["same-client", "other-client"]) {
        saved.write(JSON.stringify([name, scope]), "stale");
      }
    }
    const unrelated = JSON.stringify(["checks.other-module", "same-client"]);
    saved.write(unrelated, "keep");
    const store = createFilterState(() => storage);
    const mounted = JSON.stringify(["checks.collectionFilter", "same-client"]);
    expect(store.read(mounted, "all")).toBe("stale");
    expect(store.resetNamespace("cash-flow", legacyNames)).toBe(true);
    expect(store.read(mounted, "all")).toBe("all");
    const reload = createFilterState(() => storage);
    for (const name of legacyNames) {
      for (const scope of ["same-client", "other-client"]) {
        expect(reload.read(JSON.stringify([name, scope]), "initial")).toBe("initial");
      }
    }
    expect(reload.read(unrelated, "initial")).toBe("keep");
  });

  it("refreshes a mounted date fallback for every scope without persisting a view preference", () => {
    const storage = browserStorage();
    const store = createFilterState(() => storage);
    const mounted = JSON.stringify(["cash-flow.asOf", "same-client"]);
    const unread = JSON.stringify(["cash-flow.asOf", "other-client"]);
    store.write(mounted, "2025-01-01");
    // A provider mounted yesterday retains yesterday as the fallback passed to read().
    const yesterday = "2026-10-08";
    const today = "2026-10-09";
    expect(store.resetNamespace("cash-flow", [], { "cash-flow.asOf": today })).toBe(true);
    expect(store.read(mounted, yesterday)).toBe(today);
    expect(store.read(unread, yesterday)).toBe(today);
    expect(storage.length).toBe(0);
    store.write(mounted, "2026-09-01");
    expect(store.read(mounted, yesterday)).toBe("2026-09-01");
    expect(store.resetNamespace("cash-flow", [], { "cash-flow.asOf": "2026-10-10" })).toBe(true);
    expect(store.read(mounted, yesterday)).toBe("2026-10-10");
    expect(store.read(unread, yesterday)).toBe("2026-10-10");
    expect(store.resetNamespace("cash-flow")).toBe(true);
    expect(store.read(mounted, yesterday)).toBe(yesterday);
  });
});
