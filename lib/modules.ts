import {
  BarChart3,
  BedDouble,
  LineChart,
  Microscope,
  Receipt,
  ShoppingBag,
  Table2,
  Users,
  type LucideIcon,
} from "lucide-react";

export type ModuleTabId = "graficos" | "datos" | "analisis";

export interface ModuleTab {
  id: ModuleTabId;
  label: string;
  icon: LucideIcon;
}

/**
 * Shared tab definitions. Per the design, every module exposes Gráficos + Datos;
 * only Pérdidas y Ganancias adds the deeper Análisis view.
 */
const TAB_GRAFICOS: ModuleTab = { id: "graficos", label: "Gráficos", icon: BarChart3 };
const TAB_DATOS: ModuleTab = { id: "datos", label: "Datos", icon: Table2 };
const TAB_ANALISIS: ModuleTab = { id: "analisis", label: "Análisis", icon: Microscope };

export interface DashboardModule {
  /** Route segment, e.g. "profit-loss". */
  slug: string;
  /** Sidebar navigation label. */
  label: string;
  /** Header title and breadcrumb leaf. */
  title: string;
  icon: LucideIcon;
  /** Tabs shown inside the module, in display order. First tab is the default. */
  tabs: ModuleTab[];
}

export const MODULES: DashboardModule[] = [
  {
    slug: "profit-loss",
    label: "Pérdidas y Ganancias",
    title: "Pérdidas y Ganancias",
    icon: LineChart,
    tabs: [TAB_GRAFICOS, TAB_DATOS, TAB_ANALISIS],
  },
  {
    slug: "salaries",
    label: "Sueldos por Áreas",
    title: "Sueldos por Áreas",
    icon: Users,
    tabs: [TAB_GRAFICOS, TAB_DATOS],
  },
  {
    slug: "occupancy",
    label: "Ocupaciones",
    title: "Ocupaciones · Análisis Hotelero",
    icon: BedDouble,
    tabs: [TAB_GRAFICOS, TAB_DATOS],
  },
  {
    slug: "sales",
    label: "Ventas",
    title: "Ventas · Análisis Comercial",
    icon: ShoppingBag,
    tabs: [TAB_GRAFICOS, TAB_DATOS],
  },
  {
    slug: "payroll",
    label: "Rol de Pagos",
    title: "Rol de Pagos",
    icon: Receipt,
    // Sin pestañas: la vista inicial (Historial de nómina) es la página entera, y no monta
    // `ModuleTabs`.
    tabs: [],
  },
];

export const DEFAULT_MODULE = MODULES[0];

export function findModuleBySlug(slug: string | undefined): DashboardModule | undefined {
  return MODULES.find((module) => module.slug === slug);
}
