/**
 * Suma TODOS los clientes en un solo estado de resultados — el mismo Consolidado que ya existe
 * entre centros de costo y entre sucursales, un nivel arriba.
 *
 * Es DERIVADO en lectura y nunca se guarda: una copia almacenada quedaría obsoleta en cuanto
 * cualquiera de los cinco clientes ajustara una celda, y nada en pantalla lo diría.
 *
 * Suma UNA sola vez, con todos los centros de todos los clientes aplanados en una llamada a
 * `mergeCenters`. La suma es asociativa, así que sumar los centros dentro de cada cliente y luego
 * los clientes entre sí da exactamente lo mismo — y así no aparece una segunda definición de
 * «sumar» que pueda divergir de la primera.
 *
 * Los planes de cuentas se UNEN, no se fusionan: dos sistemas contables con numeraciones distintas
 * (`4.1.01.01.01` de Dingoo vs `4.1.1.1.1` de MicroPlus) producen ramas hermanas y los totales por
 * raíz cuadran igual, porque ambas cuelgan de `4`.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";
import { formatList, pluralize } from "@/lib/format";
import { FREQUENCY_ORDER, applyEditsToLeafAccounts, mergeCenters } from "./derive";
import type { CellEdit, Frequency, PygDataset } from "./types";

/**
 * El id del consolidado, que NO es el de ningún cliente. Vive en la capa pura porque es a la vez
 * lo que `db.ts` guarda en la tabla `active` (y por tanto lo que hace que sobreviva al reload) y
 * lo que el selector marca; una sola definición para las dos cosas.
 *
 * Los dos guiones bajos no son decoración: `crypto.randomUUID()` no produce esta forma, así que no
 * puede colisionar con un cliente real.
 */
export const CONSOLIDATED_CLIENT_ID = "__consolidado__";

export const CONSOLIDATED_CLIENT_NAME = "Consolidado";

/** Lo que un cliente aporta al consolidado: lo que tiene, ya leído de su partición. */
export interface ClientContribution {
  clientId: string;
  /** La etiqueta que el usuario le puso — lo que nombran los avisos. */
  name: string;
  datasets: PygDataset[];
  edits: CellEdit[];
  loadedMonthsByYear: Record<number, number[]>;
}

/** Un cliente que quedó fuera de la suma, y en qué palabras decirlo. */
export interface ExcludedClient {
  name: string;
  reason: string;
}

export interface ConsolidatedWorkspace {
  /** Uno sintético por año, ascendente. Vacío si no hay nada que sumar. */
  datasets: PygDataset[];
  /** Unión de la cobertura de los clientes que entraron. */
  loadedMonthsByYear: Record<number, number[]>;
  /** Huecos de cobertura, conflictos estructurales y exclusiones, en ese orden. */
  warnings: string[];
  /** Los clientes que entraron, por nombre y en el orden en que llegaron (alfabético). */
  contributors: string[];
  excluded: ExcludedClient[];
}

const EMPTY: ConsolidatedWorkspace = {
  datasets: [],
  loadedMonthsByYear: {},
  warnings: [],
  contributors: [],
  excluded: [],
};

/**
 * Hacen falta DOS clientes con datos: con uno, el «consolidado» sería ese mismo cliente con otro
 * nombre, y ofrecerlo sería prometer una suma que no existe.
 */
export function canConsolidate(contributions: readonly ClientContribution[]): boolean {
  return eligible(contributions).length >= 2;
}

/**
 * Los clientes que la barra de filtros dejó dentro. **Ninguno marcado es TODOS**, no ninguno — la
 * misma regla que centro de costo y año, para que la barra se lea igual dondequiera.
 *
 * Marcar uno solo es legítimo y da ese cliente: la regla de «hacen falta dos» decide si el
 * consolidado se OFRECE (`canConsolidate`), no qué puede mirar quien ya está dentro. Dejarlo vacío
 * al desmarcar el penúltimo sería un callejón sin salida.
 */
export function selectContributions(
  contributions: readonly ClientContribution[],
  markedIds: readonly string[],
): ClientContribution[] {
  const all = eligible(contributions);
  const marked = new Set(markedIds);
  const picked = all.filter((contribution) => marked.has(contribution.clientId));
  return picked.length > 0 ? picked : all;
}

/** Un cliente creado y todavía vacío no aporta: no tiene identidad ni datos. */
function eligible(contributions: readonly ClientContribution[]): ClientContribution[] {
  return contributions.filter((contribution) => contribution.datasets.length > 0);
}

export function consolidateClients(
  contributions: readonly ClientContribution[],
): ConsolidatedWorkspace {
  const withData = eligible(contributions);
  if (withData.length === 0) {
    return EMPTY;
  }

  const base = referenceFrequency(withData);
  const excluded: ExcludedClient[] = [];
  const included: ClientContribution[] = [];
  for (const contribution of withData) {
    if (contribution.datasets.every((dataset) => dataset.baseFrequency === base)) {
      included.push(contribution);
    } else {
      excluded.push({
        name: contribution.name,
        reason: `su estado es ${describeFrequencies(contribution)} y el resto es ${base}`,
      });
    }
  }
  if (included.length === 0) {
    return EMPTY;
  }

  const years = [
    ...new Set(included.flatMap((c) => c.datasets.map((dataset) => dataset.year))),
  ].sort((a, b) => a - b);

  const loadedMonthsByYear: Record<number, number[]> = {};
  for (const year of years) {
    const covered = new Set<number>();
    for (const contribution of included) {
      for (const month of contribution.loadedMonthsByYear[year] ?? []) {
        covered.add(month);
      }
    }
    loadedMonthsByYear[year] = [...covered].sort((a, b) => a - b);
  }

  const structural = new Set<string>();
  const datasets = years.map((year) => {
    // Todos los centros de todos los clientes de ese año, con sus ajustes ya aplicados. Un cliente
    // por centros aporta sus centros; uno de estado único aporta el suyo — la suma no distingue,
    // que es justamente por qué el consolidado no necesita saber en qué modo está cada uno.
    const contributed = included.flatMap((contribution) =>
      contribution.datasets
        .filter((dataset) => dataset.year === year)
        .map((dataset) =>
          applyEditsToLeafAccounts(
            dataset.accounts,
            contribution.edits.filter((edit) => edit.datasetId === dataset.id),
          ),
        ),
    );
    const merged = mergeCenters(contributed, "cliente");
    for (const warning of merged.warnings) {
      structural.add(warning);
    }
    return syntheticDataset(year, base, merged.accounts, loadedMonthsByYear[year]);
  });

  return {
    datasets,
    loadedMonthsByYear,
    warnings: [
      ...coverageWarnings(included, years, loadedMonthsByYear),
      ...structural,
      ...excluded.map(({ name, reason }) => `«${name}» quedó fuera del consolidado: ${reason}.`),
    ],
    contributors: included.map((contribution) => contribution.name),
    excluded,
  };
}

/**
 * El dataset del consolidado se presenta como un ESTADO ÚNICO (`role: "single"`), no como un
 * centro: cada cliente entra con sus propios centros ya sumados, así que el consolidado no tiene
 * centros que ofrecer y el filtro de centro de costo desaparece por sí solo.
 */
function syntheticDataset(
  year: number,
  base: Frequency,
  accounts: PygDataset["accounts"],
  covered: number[],
): PygDataset {
  return {
    id: `${CONSOLIDATED_CLIENT_ID}-${year}`,
    clientId: CONSOLIDATED_CLIENT_ID,
    fileName: "",
    uploadedAt: 0,
    companyName: CONSOLIDATED_CLIENT_NAME,
    periodLabel: coverageLabel(year, base, covered),
    year,
    baseFrequency: base,
    role: "single",
    accounts,
    // Ningún archivo declara la utilidad de una suma de empresas: se deriva o no existe.
    resultFromFile: [],
    warnings: [],
  };
}

/** «Ene–Jun 2026» sobre la cobertura real, para que el header no prometa un año completo. */
function coverageLabel(year: number, base: Frequency, covered: number[]): string {
  if (base !== "mensual" || covered.length === 0) {
    return `${year}`;
  }
  const first = MONTHS_SHORT_ES[covered[0]];
  const last = MONTHS_SHORT_ES[covered[covered.length - 1]];
  return first === last ? `${first} ${year}` : `${first}–${last} ${year}`;
}

/**
 * La frecuencia base contra la que se mide el resto: la que comparten MÁS clientes, y a igualdad
 * la más fina.
 *
 * Fijarla en `"mensual"` habría excluido a todos en un espacio enteramente anual, y tomar la del
 * primero habría dejado la suma a merced del orden alfabético. Hoy todo es mensual, así que esto
 * no excluye a nadie; existe para que un legado anual no se sume contra doce columnas.
 */
function referenceFrequency(contributions: readonly ClientContribution[]): Frequency {
  const votes = new Map<Frequency, number>();
  for (const contribution of contributions) {
    for (const frequency of new Set(contribution.datasets.map((d) => d.baseFrequency))) {
      votes.set(frequency, (votes.get(frequency) ?? 0) + 1);
    }
  }
  return [...votes.entries()].sort(
    ([freqA, countA], [freqB, countB]) =>
      countB - countA || FREQUENCY_ORDER.indexOf(freqA) - FREQUENCY_ORDER.indexOf(freqB),
  )[0][0];
}

function describeFrequencies(contribution: ClientContribution): string {
  return formatList([...new Set(contribution.datasets.map((d) => d.baseFrequency))]);
}

/**
 * Un aviso por TRAMO de meses consecutivos a los que les faltan los mismos clientes — nunca uno
 * por mes ni por cuenta, la misma regla que el cuadre.
 *
 * Sin esto, una suma parcial es indistinguible de una caída real del negocio: abril con tres de
 * cinco clientes se lee como que el grupo vendió la mitad.
 */
function coverageWarnings(
  included: readonly ClientContribution[],
  years: readonly number[],
  loadedMonthsByYear: Record<number, number[]>,
): string[] {
  const warnings: string[] = [];
  for (const year of years) {
    const covered = loadedMonthsByYear[year] ?? [];
    // Quién falta en cada mes cubierto, en el orden de la lista de clientes.
    const missingByMonth = new Map<number, string[]>();
    for (const month of covered) {
      const missing = included
        .filter((contribution) => !(contribution.loadedMonthsByYear[year] ?? []).includes(month))
        .map((contribution) => contribution.name);
      if (missing.length > 0) {
        missingByMonth.set(month, missing);
      }
    }

    let run: { start: number; end: number; missing: string[] } | null = null;
    const flush = () => {
      if (run) {
        warnings.push(describeGap(year, run.start, run.end, run.missing, included.length));
        run = null;
      }
    };
    for (const month of covered) {
      const missing = missingByMonth.get(month);
      if (!missing) {
        flush();
        continue;
      }
      // Mismo conjunto de ausentes Y meses consecutivos: un solo tramo. Un salto de mes rompe el
      // tramo aunque falten los mismos, porque «Abril–Junio» diría que mayo también está cargado.
      if (run && run.end === month - 1 && sameNames(run.missing, missing)) {
        run.end = month;
        continue;
      }
      flush();
      run = { start: month, end: month, missing };
    }
    flush();
  }
  return warnings;
}

function describeGap(
  year: number,
  start: number,
  end: number,
  missing: readonly string[],
  total: number,
): string {
  const span =
    start === end
      ? `${MONTHS_SHORT_ES[start]} ${year}`
      : `${MONTHS_SHORT_ES[start]}–${MONTHS_SHORT_ES[end]} ${year}`;
  const loaded = total - missing.length;
  return `${span}: ${loaded} de ${pluralize(total, "cliente")} con datos (${
    missing.length === 1 ? "falta" : "faltan"
  } ${formatList(missing)}).`;
}

function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}
