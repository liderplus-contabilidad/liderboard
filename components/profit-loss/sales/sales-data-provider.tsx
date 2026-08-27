"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  buildSalesCards,
  type SalesCards,
  type SalesCardsInput,
  type YearMonths,
  type YearReading,
} from "@/lib/sales/cards";
import { monthsForClient, saveMonths } from "@/lib/sales/db";
import {
  loadedMonths,
  loadedYears,
  monthlySeries,
  readSales,
  type SalesReading,
} from "@/lib/sales/derive";
import {
  emptyFilters,
  periodLabel,
  sanitizeFilters,
  selectedMonths,
  withAllYears,
  withMonthsCleared,
  withMonthToggled,
  withYearToggled,
  type SalesFilters,
  type SalesUniverse,
} from "@/lib/sales/filters";
import type { ParsedSalesMonth, SalesMonth } from "@/lib/sales/types";
import { usePygData } from "../pyg-data-provider";

/**
 * El estado de «Ventas por servicio», montado DENTRO de la vista y no en el layout.
 *
 * La regla de la casa es que un proveedor vive en el layout porque la CABECERA lee de su mismo
 * estado —así comparten `ActiveClient` y el panel en PyG y en Ocupaciones—, y de este subitem la
 * cabecera no lee nada: el cliente lo da `PygDataProvider`, que ya está arriba. Subir estas marcas
 * sería poner en el layout algo que ninguna otra pantalla lee.
 *
 * Lo que sí justifica que sea un contexto y no `useState` suelto es que tres consumidores lejanos
 * necesitan lo mismo: la barra, el modal de carga y el botón del informe.
 */
interface SalesDataValue {
  /**
   * El cliente de PyG al que pertenece todo esto. `null` sin ninguno abierto **y también en el
   * CONSOLIDADO ENTRE CLIENTES**, que no es un cliente sino su suma: escribir ahí crearía una
   * partición fantasma que ninguna pantalla lista y ningún borrado alcanza, la misma defensa que
   * `assertRealClient` monta en la base de PyG.
   */
  clientId: string | null;
  /** Si lo abierto es el consolidado — el vacío lo dice con otras palabras que «no hay cliente». */
  isConsolidated: boolean;
  clientName: string | undefined;
  /** Falso hasta la primera lectura de Dexie: evita el parpadeo del vacío sobre un cliente que sí
   *  tiene meses. */
  ready: boolean;
  /** Todos los meses del cliente, de todos los años. */
  months: SalesMonth[];
  universe: SalesUniverse;
  filters: SalesFilters;
  /** Los meses que la lectura suma: los marcados, o todos los cargados del año. */
  period: number[];
  /** Cómo se llama ese periodo — lo que dicen los tiles, los subtítulos y el informe. */
  periodName: string;
  reading: SalesReading;
  /**
   * EXACTAMENTE la entrada con la que se construyeron `cards`. La expone el proveedor para que el
   * informe imprimible pida las mismas tarjetas con los mismos argumentos en vez de recomponerlos:
   * dos composiciones de la misma entrada pueden separarse, y quien recibe el PDF ya no tiene la
   * pantalla al lado para cotejar.
   */
  cardsInput: SalesCardsInput;
  cards: SalesCards;
  hideEmptyMonths: boolean;
  toggleEmptyMonths: () => void;
  toggleYear: (year: number) => void;
  selectAllYears: () => void;
  toggleMonth: (monthIndex: number) => void;
  clearMonths: () => void;
  /** Escribe los meses ya parseados en el cliente abierto, reemplazando los que repita. */
  importMonths: (parsed: readonly ParsedSalesMonth[]) => Promise<void>;
}

const SalesDataContext = createContext<SalesDataValue | null>(null);

const NO_MONTHS: SalesMonth[] = [];

export function SalesDataProvider({ children }: { children: ReactNode }) {
  const { activeClientId, activeClient, isConsolidated } = usePygData();
  const [rawFilters, setRawFilters] = useState<SalesFilters>(emptyFilters);
  const [hideEmptyMonths, setHideEmptyMonths] = useState(false);
  const clientId = isConsolidated ? null : activeClientId;

  // La ÚNICA consulta, y siempre acotada por el cliente: es lo que impide que la facturación de
  // dos empresas se mezcle en silencio.
  const stored = useLiveQuery(() => monthsForClient(clientId), [clientId]);
  const months = stored ?? NO_MONTHS;
  const ready = stored !== undefined;

  const years = useMemo(() => loadedYears(months), [months]);
  // Los AÑOS se resuelven primero, porque el universo de meses es el de los años marcados: sin ese
  // orden, marcar un año no podría abrir los meses que solo él trae.
  const yearsOnly = useMemo(
    () => sanitizeFilters(rawFilters, { years, months: [] }),
    [rawFilters, years],
  );
  const universe = useMemo<SalesUniverse>(
    () => ({
      years,
      // La UNIÓN de los meses de los años marcados, no la intersección: un mes que solo tiene uno de
      // ellos sigue siendo un mes que se puede mirar, y la comparación dirá que al otro le falta.
      months: [...new Set(yearsOnly.years.flatMap((year) => loadedMonths(months, year)))].sort(
        (a, b) => a - b,
      ),
    }),
    [years, yearsOnly.years, months],
  );
  // Podado en la LECTURA y nunca en un efecto: cambiar de cliente no deja un render con marcas de
  // años que este cliente no tiene.
  const filters = useMemo(() => sanitizeFilters(rawFilters, universe), [rawFilters, universe]);

  const period = useMemo(() => selectedMonths(filters, universe), [filters, universe]);
  const periodName = useMemo(() => periodLabel(period, filters.years), [period, filters.years]);

  /** Las líneas de un año, acotadas por los meses del periodo. */
  const linesOf = useCallback(
    (year: number) => {
      const inPeriod = new Set(period);
      return months
        .filter((month) => month.year === year && inPeriod.has(month.monthIndex))
        .flatMap((month) => month.lines);
    },
    [months, period],
  );

  // Una sola agregación para todo lo que la pantalla dice: los tiles, las tarjetas y el informe
  // leen de aquí, así que no pueden cuadrar contra tramos distintos.
  const reading = useMemo(
    () => readSales(filters.years.flatMap((year) => linesOf(year))),
    [filters.years, linesOf],
  );

  // Y una POR AÑO, que es lo que las tarjetas comparan. Se construyen aquí y no en la tarjeta para
  // que la suma total y las parciales salgan de las mismas líneas.
  const byYear = useMemo<YearReading[]>(
    () => filters.years.map((year) => ({ year, reading: readSales(linesOf(year)) })),
    [filters.years, linesOf],
  );

  /**
   * El EJE de la evolución. Sin marcas de mes son los DOCE del ejercicio —es lo que hace visible un
   * mes que nunca llegó, que es la distinción sobre la que descansa el módulo—, y con marcas es
   * exactamente lo marcado: una marca ACOTA, aquí igual que en las otras dos tarjetas, y un eje que
   * ignorara la marca dejaría al subtítulo diciendo «Ene–Feb» sobre doce columnas.
   */
  const monthlyByYear = useMemo<YearMonths[]>(
    () =>
      filters.years.map((year) => {
        const points = monthlySeries(months, year);
        return {
          year,
          points:
            filters.months.length === 0
              ? points
              : points.filter((point) => filters.months.includes(point.monthIndex)),
        };
      }),
    [filters.years, filters.months, months],
  );

  const cardsInput = useMemo<SalesCardsInput>(
    () => ({ reading, byYear, period: periodName, monthlyByYear }),
    [reading, byYear, periodName, monthlyByYear],
  );

  const cards = useMemo(
    () => buildSalesCards(cardsInput, { hideEmptyMonths }),
    [cardsInput, hideEmptyMonths],
  );
  const toggleEmptyMonths = useCallback(() => setHideEmptyMonths((current) => !current), []);

  const toggleYear = useCallback(
    (year: number) => setRawFilters((current) => withYearToggled(current, year, years)),
    [years],
  );
  const selectAllYears = useCallback(
    () => setRawFilters((current) => withAllYears(current, years)),
    [years],
  );
  const toggleMonth = useCallback(
    (monthIndex: number) =>
      setRawFilters((current) => withMonthToggled(current, monthIndex, universe.months)),
    [universe.months],
  );
  const clearMonths = useCallback(() => setRawFilters(withMonthsCleared), []);

  const importMonths = useCallback(
    async (parsed: readonly ParsedSalesMonth[]) => {
      if (!clientId) {
        return;
      }
      await saveMonths(clientId, parsed);
      // Se abre en lo que se acaba de cargar: es lo que el usuario quiere ver, y sin esto un mes
      // de otro año se guardaría sin que la pantalla se moviera.
      const last = [...parsed].sort(byPeriod).at(-1);
      if (last) {
        setRawFilters({ years: [last.year], months: [] });
      }
    },
    [clientId],
  );

  const value = useMemo<SalesDataValue>(
    () => ({
      clientId,
      isConsolidated,
      clientName: activeClient?.name,
      ready,
      months,
      universe,
      filters,
      period,
      periodName,
      reading,
      cardsInput,
      cards,
      hideEmptyMonths,
      toggleEmptyMonths,
      toggleYear,
      selectAllYears,
      toggleMonth,
      clearMonths,
      importMonths,
    }),
    [
      clientId,
      isConsolidated,
      activeClient?.name,
      ready,
      months,
      universe,
      filters,
      period,
      periodName,
      reading,
      cardsInput,
      cards,
      hideEmptyMonths,
      toggleEmptyMonths,
      toggleYear,
      selectAllYears,
      toggleMonth,
      clearMonths,
      importMonths,
    ],
  );

  return <SalesDataContext.Provider value={value}>{children}</SalesDataContext.Provider>;
}

function byPeriod(a: ParsedSalesMonth, b: ParsedSalesMonth): number {
  return a.year - b.year || a.monthIndex - b.monthIndex;
}

export function useSalesData(): SalesDataValue {
  const value = useContext(SalesDataContext);
  if (!value) {
    throw new Error("useSalesData debe usarse dentro de SalesDataProvider");
  }
  return value;
}
