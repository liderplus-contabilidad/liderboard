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
import type { Frequency } from "../types";
import { MICROPLUS_SYSTEM } from "../upload/systems";
import { buildBusinessLines } from "./business-lines";
import { expenseRootsOf, leavesOfAny } from "./presets";

/** El id viaja en `PygFilters.preset`, que es un `string | null` para no arrastrar `charts/` a
 * `filters.ts` — la misma frontera por la que `PygDataProvider` tampoco importa de aquí. */
export const BUSINESS_LINES_PRESET = "lineas-de-negocio";
export const EXPENSE_DISTRIBUTION_PRESET = "distribucion-de-gastos";

/** Un reparto necesita al menos dos partes; con una, «distribución» es la cuenta con otro nombre. */
const MIN_CATEGORIES = 2;

/**
 * Contra qué se decide si una vista se puede dibujar. Es un objeto y no la fuente a secas porque
 * hay vistas que dependen del PLAN (la de líneas necesita rótulos de hotelería) y otras del
 * SISTEMA del que salió el archivo, que es un dato del workspace y no del árbol de cuentas.
 */
export interface PresetContext {
  source: AnalyticsSource | undefined;
  /** El sistema contable que originó el estado abierto; `null` en el consolidado entre clientes. */
  systemId: string | null;
}

export interface PresetView {
  id: string;
  label: string;
  /** Qué presenta, en una línea: es el `title` del interruptor, porque un rótulo de una palabra
   * («Ventas») no dice qué va a pasar al pulsarlo. */
  description: string;
  isAvailable: (context: PresetContext) => boolean;
  /**
   * Qué marca la vista al encenderse, y es de la VISTA por el mismo motivo que `isAvailable`: lo
   * que se siembra depende de lo que se dibuja. «Ventas» reparte por establecimiento y por mes, así
   * que marca los centros y los periodos cubiertos para que lo dibujado y lo marcado sean lo mismo.
   * El anexo de gastos no reparte por nada de eso —es UNA columna por rubro—, y sembrarle centros
   * abriría una columna por establecimiento de algo que se lee como un solo total.
   */
  seeds?: { centers?: boolean; periods?: boolean };
  /**
   * Las CUENTAS que la vista deja marcadas al encenderse, cuando sus categorías son cuentas del
   * plan. Solo puede declararlo una vista así: «Ventas» agrupa ramas enteras y parte una cuenta en
   * dos por el nombre de sus hijas, de modo que no hay marca que represente lo que dibuja, y por
   * eso allí la marca y la vista se excluyen. En el anexo de gastos coinciden, así que marcarlas es
   * lo que deja VER cuáles entran y quitar un rubro desmarcándolo, sin apagar la vista.
   */
  seedCodes?: (source: AnalyticsSource | undefined) => string[];
  /**
   * La granularidad con la que la vista se lee, cuando tiene una. El anexo es ANUAL: su tabla es
   * «del 01 de enero al 30 de junio» en una sola columna, y en mensual saldrían seis barras por
   * rubro que no son el reparto sino su evolución. Se aplica al encender y no se deshace al apagar
   * —«Ver por» está a la vista y se vuelve de un clic—, al revés que las marcas, que sí dejan chips
   * que el usuario no puso.
   */
  frequency?: Frequency;
}

export const PRESET_VIEWS: readonly PresetView[] = [
  {
    id: BUSINESS_LINES_PRESET,
    label: "Ventas",
    description: "Ventas por línea de negocio: hospedaje, sus servicios, restaurante y bar",
    isAvailable: ({ source }) => buildBusinessLines(source).lines.length > 0,
    seeds: { centers: true, periods: true },
  },
  {
    id: EXPENSE_DISTRIBUTION_PRESET,
    label: "Costos y gastos",
    description:
      "Anexo de gastos: en qué se reparten, cuánto pesa cada rubro sobre el gasto y sobre el ingreso",
    /**
     * Solo para MICROPLUS, y es una restricción de LEGIBILIDAD, no de que el cálculo no sirva.
     *
     * El reparto se hace sobre las cuentas de movimiento —las de nivel más específico de cada
     * rama—, y ahí cada plan de cuentas da un número muy distinto: el de MicroPlus se queda en unas
     * decenas, que es un anexo, mientras que otros formatos bajan mucho más y devuelven más de cien
     * rubros, donde una tarta no reparte nada y las barras son una alfombra. Con ese plan la
     * pregunta hay que hacerla un nivel más arriba, y ese nivel no es el mismo en todos.
     *
     * Se apoya en el sistema y no en un tope de cuentas porque es lo que la firma pidió; el precio
     * es que un plan nuevo tan legible como el de MicroPlus no la recibe solo, y hay que añadirlo
     * aquí.
     */
    isAvailable: ({ source, systemId }) =>
      systemId === MICROPLUS_SYSTEM &&
      leavesOfAny(source, expenseRootsOf(source)).length >= MIN_CATEGORIES,
    // Las mismas cuentas que dibuja: las de movimiento del árbol de gastos, que son las de nivel
    // más específico de cada rama. No siembra centros ni periodos —el anexo es UNA columna por
    // rubro— y se lee en ANUAL, que es lo que hace que esa columna sea el tramo entero.
    seedCodes: (source) => leavesOfAny(source, expenseRootsOf(source)),
    frequency: "anual",
  },
];

/** Las que el estado abierto puede dibujar; `[]` deja la sección entera fuera de la barra. */
export function availablePresets(context: PresetContext): PresetView[] {
  return PRESET_VIEWS.filter((preset) => preset.isAvailable(context));
}

/** La vista seleccionada, o `undefined` — que es también lo que devuelve un id ya retirado. */
export function findPreset(id: string | null): PresetView | undefined {
  return id === null ? undefined : PRESET_VIEWS.find((preset) => preset.id === id);
}
