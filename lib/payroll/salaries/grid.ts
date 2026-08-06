/**
 * El grid de Sueldos por Áreas: de los períodos del cliente, sus nóminas y las marcas de la barra,
 * a la tabla que se dibuja. Puro, y por eso testeable contra la hoja del contador.
 *
 * Las tres reglas que sostienen la lectura y que por eso viven aquí y no en un componente:
 *
 *   1. **Una columna existe solo si existe su PERÍODO.** Un mes que nadie registró no es un mes en
 *      cero: la app no puede afirmar nada de él, así que no produce columna.
 *   2. **Una celda vacía no es un cero.** `null` es «esta fila no estuvo en la nómina de ese mes»
 *      —quien no había ingresado, el área que ese mes no tuvo a nadie— y `0` es un cero de verdad,
 *      afirmado por una ficha que sí estuvo. Pintarlos igual haría indistinguible un hueco de una
 *      caída real, que es la misma distinción que PyG sostiene con su cobertura.
 *   3. **El total suma LAS FILAS PRESENTES**, no el universo. Con dos áreas marcadas es el de esas
 *      dos: una fila de cierre que no cuadra con lo que tiene encima no se puede comprobar a ojo, y
 *      comprobarla contra su propio Excel es justo para lo que existe esta pantalla.
 *
 * El MODO no es un estado aparte sino una lectura de las marcas (`resolveAreaMode`): exactamente un
 * área marcada da el detalle por empleado, cualquier otra cosa da el consolidado por área. Un modo
 * guardado junto a las marcas podría contradecirlas —quedarse en «detalle» sin área—, y la barra
 * tendría dos controles para una decisión.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";
import { areaKey, areaOptions } from "../areas";
import { computeLinePayroll } from "../employee-input";
import type { PayrollParameters } from "../engine/parameters";
import type { PayrollEmployeeLine } from "../types";
import { passes, type SalariesFilters, type SalariesUniverse } from "./filters";
import { employeeKey } from "./identity";

/** Un período, reducido a lo que el grid necesita de él. */
export interface SalariesPeriodRef {
  id: string;
  year: number;
  /** 0–11, como en el resto de la app. */
  monthIndex: number;
}

export interface SalariesColumn {
  year: number;
  monthIndex: number;
  /** «Ene» con un solo año a la vista, «Ene 25» con varios — la regla de `DatosColumn` de PyG. */
  label: string;
}

export interface SalariesRow {
  /** Estable entre renders: la clave del área o la del empleado, nunca su posición. */
  id: string;
  label: string;
  /** El cargo, en el detalle por empleado. Ausente en las filas de área. */
  sublabel?: string;
  /** Un valor por columna. `null` = la fila no estuvo en la nómina de ese período. */
  values: (number | null)[];
}

/** Consolidado por área, o el detalle de UN área por empleado. */
export type SalariesMode = "consolidado" | "detalle";

export interface SalariesGrid {
  mode: SalariesMode;
  /** El área del detalle, con la grafía del universo; `null` en consolidado. */
  area: string | null;
  columns: SalariesColumn[];
  rows: SalariesRow[];
  /** La fila de cierre. `null` cuando no hay ninguna fila que cerrar. */
  total: SalariesRow | null;
}

/** Lo que el grid lee: los períodos y la nómina de cada uno. */
export interface SalariesSource {
  periods: readonly SalariesPeriodRef[];
  /** Las fichas de cada período, indexadas por `periodId`. Un período ausente del mapa es un
   *  período sin nómina, que es distinto de un período que no existe. */
  linesByPeriod: ReadonlyMap<string, readonly PayrollEmployeeLine[]>;
}

/**
 * El universo contra el que se podan las marcas.
 *
 * Se calcula sobre TODOS los períodos del cliente y no sobre los que las marcas dejan pasar: si el
 * universo de áreas dependiera de las marcas de año, marcar un año podría borrar una marca de área
 * y la barra se reorganizaría sola bajo el puntero. Así, además, marcar un área que no tiene datos
 * en el rango visible es un estado legítimo —la pantalla lo dice— en vez de una marca que se
 * evapora.
 */
export function salariesUniverse(source: SalariesSource): SalariesUniverse {
  const lines = [...source.linesByPeriod.values()].flat();
  const present = new Set(lines.map((line) => areaKey(line.area)));
  return {
    areas: areaOptions(lines).filter((area) => present.has(areaKey(area))),
    years: [...new Set(source.periods.map((period) => period.year))].sort((a, b) => a - b),
    months: [...new Set(source.periods.map((period) => period.monthIndex))].sort((a, b) => a - b),
  };
}

/**
 * El modo, leído de las marcas: **exactamente una** área marcada da el detalle de esa área;
 * ninguna o varias dan el consolidado.
 *
 * Es la misma figura que PyG ya escribe para «Centro de costo» y «Año» (`resolveActiveCenterId`), y
 * lo que evita que la pantalla tenga un segundo sitio donde elegir el área.
 */
export function resolveAreaMode(filters: SalariesFilters): {
  mode: SalariesMode;
  area: string | null;
} {
  return filters.areas.length === 1
    ? { mode: "detalle", area: filters.areas[0] }
    : { mode: "consolidado", area: null };
}

/** Los períodos que sobreviven a las marcas de año y mes, en orden cronológico ascendente. */
function visiblePeriods(
  periods: readonly SalariesPeriodRef[],
  filters: SalariesFilters,
): SalariesPeriodRef[] {
  return periods
    .filter(
      (period) => passes(filters.years, period.year) && passes(filters.months, period.monthIndex),
    )
    .sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
}

function buildColumns(periods: readonly SalariesPeriodRef[]): SalariesColumn[] {
  const multiYear = new Set(periods.map((period) => period.year)).size > 1;
  return periods.map((period) => ({
    year: period.year,
    monthIndex: period.monthIndex,
    label: multiYear
      ? `${MONTHS_SHORT_ES[period.monthIndex]} ${String(period.year).slice(-2)}`
      : MONTHS_SHORT_ES[period.monthIndex],
  }));
}

/** El costo patronal de una ficha: la columna `AY` del libro, siempre derivada por el motor. */
function costOf(line: PayrollEmployeeLine, parameters: PayrollParameters): number {
  return computeLinePayroll(line, parameters).employerCost;
}

/**
 * Una fila sobrevive si tiene al menos un valor en las columnas visibles. Una fila entera de huecos
 * no dice nada que la ausencia de la fila no diga igual, y en el consolidado llenaría la tabla de
 * áreas que este rango no vio.
 */
function hasAnyValue(values: readonly (number | null)[]): boolean {
  return values.some((value) => value !== null);
}

/**
 * El consolidado: una fila por área, con el costo de cada mes sumado bajo el área que declara la
 * ficha de ESE período. Un empleado que cambió de área a mitad de año suma en cada mes donde
 * estuvo, que es lo que hace que la suma de las áreas siga siendo la nómina entera.
 */
function buildAreaRows(
  source: SalariesSource,
  periods: readonly SalariesPeriodRef[],
  filters: SalariesFilters,
  parameters: PayrollParameters,
): SalariesRow[] {
  // El orden es el del universo (las estándar primero), no el de aparición: tomarlo de la nómina
  // reordenaría las filas al cargar otro mes.
  const order = salariesUniverse(source).areas.filter((area) => passes(filters.areas, area));

  return order
    .map((area) => {
      const key = areaKey(area);
      const values = periods.map((period) => {
        const own = (source.linesByPeriod.get(period.id) ?? []).filter(
          (line) => areaKey(line.area) === key,
        );
        // Ninguna ficha de esa área ese mes: hueco, no cero.
        return own.length === 0
          ? null
          : own.reduce((sum, line) => sum + costOf(line, parameters), 0);
      });
      return { id: `area:${key}`, label: area, values };
    })
    .filter((row) => hasAnyValue(row.values));
}

/**
 * El detalle de un área: una fila por empleado, alfabética.
 *
 * Un mes en el que la persona estuvo en OTRA área queda vacío, no en cero: bajo esta área no tuvo
 * costo ese mes, y escribir `$0.00` afirmaría que sí cobró cero aquí.
 *
 * El rótulo y el cargo son los de la ficha más reciente entre las visibles — si el contador
 * corrigió una grafía o el empleado cambió de cargo, lo vigente es lo que se quiere leer.
 */
function buildEmployeeRows(
  source: SalariesSource,
  periods: readonly SalariesPeriodRef[],
  area: string,
  parameters: PayrollParameters,
): SalariesRow[] {
  const key = areaKey(area);
  const rows = new Map<string, { label: string; sublabel: string; values: (number | null)[] }>();

  periods.forEach((period, column) => {
    for (const line of source.linesByPeriod.get(period.id) ?? []) {
      const id = employeeKey(line);
      // Una ficha sin cédula NI nombre no se puede rotular, así que no puede ser una fila.
      if (id === null || areaKey(line.area) !== key) {
        continue;
      }
      const row = rows.get(id) ?? {
        label: line.name,
        sublabel: line.role,
        values: Array<number | null>(periods.length).fill(null),
      };
      // Los períodos se recorren en orden ascendente, así que la última pasada es la más reciente.
      row.label = line.name;
      row.sublabel = line.role;
      row.values[column] = (row.values[column] ?? 0) + costOf(line, parameters);
      rows.set(id, row);
    }
  });

  return [...rows.entries()]
    .map(([id, row]) => ({ id, label: row.label, sublabel: row.sublabel, values: row.values }))
    .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
}

/**
 * La fila de cierre: la suma de las filas presentes, columna a columna. `null` en una columna donde
 * ninguna fila tiene valor —no hay nada que totalizar— y `null` entera cuando no hay filas.
 */
function buildTotalRow(rows: readonly SalariesRow[], mode: SalariesMode): SalariesRow | null {
  if (rows.length === 0) {
    return null;
  }
  const values = rows[0].values.map((_, column) => {
    const present = rows.map((row) => row.values[column]).filter((value) => value !== null);
    return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0);
  });
  return {
    id: "total",
    // «SUBTOTAL» es lo que la hoja del contador rotula al cerrar un área; «SUMAN» cierra el libro
    // entero y aquí no hay más de un área que cerrar, así que sobra.
    label: mode === "detalle" ? "SUBTOTAL" : "TOTAL",
    values,
  };
}

export function buildSalariesGrid(
  source: SalariesSource,
  filters: SalariesFilters,
  parameters: PayrollParameters,
): SalariesGrid {
  const { mode, area } = resolveAreaMode(filters);
  const periods = visiblePeriods(source.periods, filters);
  const rows =
    mode === "detalle" && area !== null
      ? buildEmployeeRows(source, periods, area, parameters)
      : buildAreaRows(source, periods, filters, parameters);

  return {
    mode,
    area,
    columns: buildColumns(periods),
    rows,
    total: buildTotalRow(rows, mode),
  };
}
