"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { DashboardModule, ModuleTab, ModuleTabId } from "@/lib/modules";

/**
 * Which tab each module has open. It lives in the LAYOUT, next to the data providers, for the same
 * reason they do: the header paints the tabs and the page paints the panel, and the two must read
 * the same mark. With the state in the page —where it began— the header could only show a strip it
 * did not own.
 *
 * Keyed by module slug so that leaving PyG for Ventas and coming back reopens the tab that was
 * open, instead of the first one. A module never marked reads its first tab, which is the registry's
 * default.
 */
interface ModuleTabState {
  open: Readonly<Record<string, ModuleTabId>>;
  setTab: (slug: string, id: ModuleTabId) => void;
}

const ModuleTabContext = createContext<ModuleTabState | null>(null);

export function ModuleTabProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Record<string, ModuleTabId>>({});
  const setTab = useCallback((slug: string, id: ModuleTabId) => {
    setOpen((current) => (current[slug] === id ? current : { ...current, [slug]: id }));
  }, []);
  const value = useMemo(() => ({ open, setTab }), [open, setTab]);
  return <ModuleTabContext.Provider value={value}>{children}</ModuleTabContext.Provider>;
}

/** The module's open tab —resolved against its registry entry— and the setter bound to it. */
export function useModuleTab(mod: DashboardModule): [ModuleTab, (id: ModuleTabId) => void] {
  const context = useContext(ModuleTabContext);
  if (!context) {
    throw new Error("useModuleTab must be used within ModuleTabProvider");
  }
  const { open, setTab } = context;
  const active = mod.tabs.find((tab) => tab.id === open[mod.slug]) ?? mod.tabs[0];
  const select = useCallback((id: ModuleTabId) => setTab(mod.slug, id), [setTab, mod.slug]);
  return [active, select];
}
