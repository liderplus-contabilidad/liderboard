import {
  BarChart3,
  BedDouble,
  LineChart,
  Microscope,
  Receipt,
  ShoppingBag,
  Table2,
  TrendingUp,
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
 * A module's SUBITEM: a page hanging off it (`/<parent>/<child>`) rendered indented under its parent
 * in the sidebar.
 *
 * The nesting is ONE single level on purpose —a child declares no children—: this navigation is a
 * list of modules and not a tree, and a second level would have nowhere to render with the bar
 * collapsed.
 *
 * It has no `tabs`: a subitem is a whole page, as Rol de Pagos is.
 */
export interface DashboardSubmodule {
  /** Segment hanging off the parent, e.g. "salaries" → `/payroll/salaries`. */
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
  /** Pages hanging off this module. A module with no children renders exactly as before. */
  children?: DashboardSubmodule[];
}

export const MODULES: DashboardModule[] = [
  {
    slug: "profit-loss",
    label: "Pérdidas y Ganancias",
    title: "Pérdidas y Ganancias",
    icon: LineChart,
    tabs: [TAB_GRAFICOS, TAB_DATOS, TAB_ANALISIS],
    // Ventas por servicio hangs off here and is not a sibling module for the same reason Sueldos por
    // Áreas hangs off Rol de Pagos: its sales need a CLIENT, and the client is stored by PyG. As a
    // top-level module it would introduce its own list of clients —what Ocupaciones does with
    // «hotel»— and the user would end up maintaining two lists for the same firm.
    //
    // It is ALWAYS visible, for every client: a sidebar item that appears and disappears depending on
    // which client is open cannot be discovered. What the file decides is who can upload, not who
    // sees the menu.
    children: [
      {
        slug: "sales",
        label: "Ventas por servicio",
        title: "Ventas por servicio",
        icon: ShoppingBag,
      },
      // Reportería de ingresos hangs off here for the same reason: what it reads is the raíz 4 of
      // this module's ACTIVE CLIENT, so it needs the selector the parent already mounts in the
      // header. It is ALWAYS visible too — what the workspace's system decides is who can CAPTURE
      // the external figures, never who sees the menu (`lib/revenue/availability.ts`).
      {
        slug: "revenue-report",
        label: "Reportería de ingresos",
        title: "Reportería de ingresos",
        icon: TrendingUp,
      },
    ],
  },
  {
    slug: "occupancy",
    label: "Ocupaciones",
    title: "Ocupaciones · Análisis Hotelero",
    icon: BedDouble,
    tabs: [TAB_GRAFICOS, TAB_DATOS],
  },
  {
    slug: "payroll",
    label: "Rol de Pagos",
    title: "Rol de Pagos",
    icon: Receipt,
    // No tabs: the initial view (Historial de nómina) is the whole page, and it does not mount
    // `ModuleTabs`.
    tabs: [],
    // Sueldos por Áreas hangs off here and is not a sibling module because it has no data of its own:
    // it reads the períodos and the nómina of Rol de Pagos' ACTIVE CLIENT. As a top-level module it
    // would be left without the client selector it needs in order to mean anything.
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
 * The subitem that names a route's SECOND segment, or `undefined`.
 *
 * Returning `undefined` is the right answer —and the important one— for a segment that is a route
 * PARAMETER: `/payroll/<uuid>` is a período's detail, not a subitem, and without this check its
 * identifier would end up in the breadcrumb and in the page's title. An identifier says nothing to
 * the reader and gives away the internal shape of the data.
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
