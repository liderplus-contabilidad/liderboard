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

/**
 * Un SUBITEM de un módulo: una página que cuelga de él (`/<padre>/<hijo>`) y que se rinde indentada
 * bajo su padre en el sidebar.
 *
 * El anidamiento es de UN SOLO nivel a propósito —un hijo no declara hijos—: esta navegación es una
 * lista de módulos y no un árbol, y un segundo nivel no tendría dónde rendirse con la barra
 * colapsada.
 *
 * No tiene `tabs`: un subitem es una página entera, como lo es Rol de Pagos.
 */
export interface DashboardSubmodule {
  /** Segmento que cuelga del padre, e.g. "salaries" → `/payroll/salaries`. */
  slug: string;
  label: string;
  title: string;
  icon: LucideIcon;
}

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
  /** Páginas que cuelgan de este módulo. Un módulo sin hijos se rinde exactamente como antes. */
  children?: DashboardSubmodule[];
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
    // Sueldos por Áreas cuelga de aquí y no es un módulo hermano porque no tiene datos propios: lee
    // los períodos y la nómina del CLIENTE ACTIVO de Rol de Pagos. Como módulo de primer nivel se
    // quedaba sin el selector de cliente que necesita para significar algo.
    children: [
      {
        slug: "salaries",
        label: "Sueldos por Áreas",
        title: "Sueldos por Áreas",
        icon: Users,
      },
    ],
  },
];

export const DEFAULT_MODULE = MODULES[0];

export function findModuleBySlug(slug: string | undefined): DashboardModule | undefined {
  return MODULES.find((module) => module.slug === slug);
}

/**
 * El subitem que nombra el SEGUNDO segmento de una ruta, o `undefined`.
 *
 * Devolver `undefined` es la respuesta correcta —y la importante— para un segmento que es un
 * PARÁMETRO de ruta: `/payroll/<uuid>` es el detalle de un período, no un subitem, y sin esta
 * comprobación su identificador acabaría en la miga y en el título de la página. Un identificador
 * no dice nada a quien lee y delata la forma interna de los datos.
 */
export function findSubmoduleBySlug(
  module: DashboardModule | undefined,
  slug: string | undefined,
): DashboardSubmodule | undefined {
  if (!module || !slug) {
    return undefined;
  }
  return module.children?.find((child) => child.slug === slug);
}
