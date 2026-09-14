"use client";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { useModuleTab } from "@/components/dashboard/module-tab-state";
import { MODULE_VIEWS } from "@/components/dashboard/module-views";
import { findModuleBySlug, type DashboardModule } from "@/lib/modules";

/**
 * A tabbed module's page: the toolbar, the notice and the panel of the OPEN tab. The tabs
 * themselves are painted by the header, in the same row as the title, and the two agree through
 * `useModuleTab`; the panel's `id` / `aria-labelledby` close the pair the header's `TabBar` opens
 * with `idPrefix = slug`.
 */
export function ModuleTabs({ slug }: { slug: string }) {
  const mod = findModuleBySlug(slug);

  if (!mod) {
    return null;
  }

  return <ModulePanel mod={mod} />;
}

function ModulePanel({ mod }: { mod: DashboardModule }) {
  const [activeTab] = useModuleTab(mod);
  const views = MODULE_VIEWS[mod.slug] ?? {};
  const panel = views.panel?.(activeTab.id) ?? <ComingSoon mod={mod} tab={activeTab} />;

  return (
    <div className="flex h-full flex-col">
      {views.toolbar?.(activeTab.id)}
      {views.notice?.(activeTab.id)}

      <div
        id={`${mod.slug}-panel`}
        role="tabpanel"
        aria-labelledby={`${mod.slug}-tab-${activeTab.id}`}
        className="flex-1 overflow-auto bg-canvas"
      >
        {panel}
      </div>
    </div>
  );
}
