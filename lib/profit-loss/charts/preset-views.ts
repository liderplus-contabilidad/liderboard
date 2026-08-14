/**
 * Las VISTAS PREDETERMINADAS de PyG: lecturas que la firma presenta siempre y que ninguna
 * combinación de marcas produce.
 *
 * Existen porque el resto de la barra selecciona CUENTAS, y hay preguntas que no son una cuenta ni
 * un conjunto de cuentas del plan: «los ingresos por línea de negocio» agrupa ramas enteras, parte
 * una cuenta en dos por el nombre de sus hijas y deja fuera las rebajas. Marcar no dibuja eso.
 *
 * El catálogo es una LISTA y no un `if` por dos razones: la sección de la barra se rinde sola
 * cuando el plan abierto no admite ninguna —no hay control muerto— y añadir la siguiente vista es
 * una entrada aquí más su rama en `cards.ts`, sin tocar ni la barra ni los filtros. `isAvailable`
 * vive en la entrada porque quién puede dibujar cada vista es de la vista: la de líneas necesita un
 * plan de hotelería, y la que venga después necesitará otra cosa.
 */
import type { AnalyticsSource } from "../analytics/types";
import { buildBusinessLines } from "./business-lines";

/** El id viaja en `PygFilters.preset`, que es un `string | null` para no arrastrar `charts/` a
 * `filters.ts` — la misma frontera por la que `PygDataProvider` tampoco importa de aquí. */
export const BUSINESS_LINES_PRESET = "lineas-de-negocio";

export interface PresetView {
  id: string;
  label: string;
  /** Qué presenta, en una línea: es el `title` del interruptor, porque un rótulo de una palabra
   * («Ventas») no dice qué va a pasar al pulsarlo. */
  description: string;
  isAvailable: (source: AnalyticsSource | undefined) => boolean;
}

export const PRESET_VIEWS: readonly PresetView[] = [
  {
    id: BUSINESS_LINES_PRESET,
    label: "Ventas",
    description: "Ventas por línea de negocio: hospedaje, sus servicios, restaurante y bar",
    isAvailable: (source) => buildBusinessLines(source).lines.length > 0,
  },
];

/** Las que el plan abierto puede dibujar; `[]` deja la sección entera fuera de la barra. */
export function availablePresets(source: AnalyticsSource | undefined): PresetView[] {
  return PRESET_VIEWS.filter((preset) => preset.isAvailable(source));
}

/** La vista seleccionada, o `undefined` — que es también lo que devuelve un id ya retirado. */
export function findPreset(id: string | null): PresetView | undefined {
  return id === null ? undefined : PRESET_VIEWS.find((preset) => preset.id === id);
}
