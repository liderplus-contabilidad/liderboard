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
import { buildBusinessLines } from "./business-lines";
import { expenseRootsOf, leavesOfAny } from "./presets";

/** El id viaja en `PygFilters.preset`, que es un `string | null` para no arrastrar `charts/` a
 * `filters.ts` — la misma frontera por la que `PygDataProvider` tampoco importa de aquí. */
export const BUSINESS_LINES_PRESET = "lineas-de-negocio";
export const EXPENSE_DISTRIBUTION_PRESET = "distribucion-de-gastos";

/** Un reparto necesita al menos dos partes; con una, «distribución» es la cuenta con otro nombre. */
const MIN_CATEGORIES = 2;

/**
 * Contra qué se decide si una vista se puede dibujar. Es un objeto con nombre y no la fuente a
 * secas porque lo que lo decide no tiene por qué estar en el árbol de cuentas: el anexo de gastos
 * estuvo atado al SISTEMA del que salió el archivo, que es un dato del workspace, y la vista que
 * venga puede necesitar otro. Así ese dato se añade aquí sin reescribir cada `isAvailable`.
 */
export interface PresetContext {
  source: AnalyticsSource | undefined;
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
   * Que marcar una cuenta ACOTE esta vista en vez de contradecirla. Normalmente las marcas y las
   * vistas se excluyen —son dos respuestas a «qué dibujo» y nada las arbitra—, y eso vale cuando
   * lo que la vista dibuja NO es un conjunto de cuentas: «Ventas» agrupa ramas enteras y parte una
   * cuenta en dos por el nombre de sus hijas, así que no hay marca que represente lo que dibuja.
   * En el anexo de gastos los rubros SON cuentas del plan, de modo que la marca y la vista dicen lo
   * mismo y desmarcar acota el reparto; apagar la vista entera sería lo contrario de para lo que
   * están las marcas.
   *
   * Se DECLARA aquí en vez de derivarse de una siembra —que es como se decidía antes— porque son
   * dos cosas distintas: una vista puede no sembrar nada y aun así dejarse acotar por cuentas.
   */
  narrowedByCodes?: boolean;
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
     * Cualquier plan que declare cuentas de gasto, sin mirar de qué sistema salió el archivo.
     *
     * Estuvo atada a MicroPlus, y era una restricción de LEGIBILIDAD y no de que el cálculo
     * fallara: el reparto se hace sobre las cuentas de MOVIMIENTO del árbol de gastos, y ahí cada
     * plan da un número muy distinto —el de MicroPlus se queda en unas decenas, otros bajan mucho
     * más y devuelven más de cien rubros—. Lo que hace legible ese caso ya no es el candado sino el
     * CORTE, que es de la tarjeta y vale para cualquier plan: catorce rubros y un «Otros» que
     * agrupa la cola, con la tabla gemela listándolos todos uno a uno con su cifra. El plan real de
     * MicroPlus trae diecisiete rubros, así que ese cliente ya venía leyendo el pliegue.
     *
     * Y por eso `isAvailable` ya no mira el sistema: la regla es estructural —hay al menos dos
     * cuentas de movimiento que repartir— y sirve para un hospital, un hotel y un comercio sin una
     * línea de código por cliente, incluido el consolidado entre clientes, donde no hay un sistema
     * del que hablar.
     */
    isAvailable: ({ source }) =>
      leavesOfAny(source, expenseRootsOf(source)).length >= MIN_CATEGORIES,
    // No siembra NADA, y las cuentas son el caso que hay que explicar: los rubros del anexo son
    // cuentas del plan, así que marcarlas sería «ver cuáles entran»; pero son todas las de
    // movimiento del árbol de gastos, y un plan real declara más de cien — ciento treinta y un
    // chips en la tira de filtros no es ver nada. Sembrar solo las catorce dibujadas tampoco vale:
    // cuáles son depende de los MONTOS, que salen del motor y del tramo, y una marca ACOTA lo que
    // el anexo suma, así que marcar catorce se llevaría por delante el «Otros» que agrupa el resto.
    // Sin siembra la barra queda con un chip, el anexo lee el árbol entero y marcar a mano sigue
    // acotando el reparto —eso es `narrowedByCodes`—, que es lo que se quería conservar.
    narrowedByCodes: true,
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
