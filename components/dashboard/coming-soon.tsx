import type { DashboardModule, ModuleTab } from "@/lib/modules";

/** What each tab will eventually show — used to make the placeholder copy specific. */
const TAB_BLURB: Record<ModuleTab["id"], string> = {
  graficos: "los gráficos y visualizaciones",
  datos: "los datos detallados",
  analisis: "el análisis en profundidad",
  resumen: "el resumen del flujo",
  cxp: "las cuentas por pagar",
  cheques: "el control de cheques",
  flujo: "el flujo de pagos",
  cargas: "las cargas cash",
};

export function ComingSoon({ mod, tab }: { mod: DashboardModule; tab: ModuleTab }) {
  const Icon = tab.icon;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        <Icon size={28} strokeWidth={1.7} />
      </div>

      <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.6px] text-faint">
        Próximamente
      </span>

      <div className="max-w-sm space-y-1.5">
        <h2 className="text-lg font-semibold text-ink">
          {tab.label} · {mod.label}
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          Esta vista está en construcción. Pronto podrás explorar aquí {TAB_BLURB[tab.id]} de{" "}
          {mod.label}.
        </p>
      </div>
    </div>
  );
}
