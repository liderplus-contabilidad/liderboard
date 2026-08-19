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
 *
 * **Los CENTROS DE COSTO se cruzan entre clientes.** El consolidado devuelve, además del total, un
 * dataset por cada par (cliente, centro): eso es lo que el filtro «Centro de costo» lista dentro
 * del consolidado y lo que Gráficos compara. Marcar centros ACOTA la suma —igual que marcar
 * clientes—, y no los funde por nombre: el `restaurante` de tres empresas son tres columnas, no
 * una. Con centros marcados la suma es EXACTAMENTE esos centros: un cliente de estado único no
 * tiene ninguno con el que entrar y queda fuera, con un aviso que lo dice, porque no aparece en esa
 * lista y su ausencia no se vería en ningún otro sitio.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";
import { formatList, pluralize } from "@/lib/format";
import { FREQUENCY_ORDER, applyEditsToLeafAccounts, mergeCenters } from "./derive";
import type { CellEdit, Frequency, PygDataset } from "./types";
import { CENTER_PALETTE } from "./workspace";

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

/**
 * Separador del id de un centro DENTRO del consolidado. Los dos puntos dobles no aparecen ni en un
 * uuid de cliente ni en un slug de centro (`slugifyCenter` solo deja letras, dígitos y guiones), así
 * que el id compuesto nunca colisiona con el de un centro suelto.
 */
const CENTER_REF_SEPARATOR = "::";

/**
 * Cómo se llama un centro de un cliente CONCRETO cuando se cruza con los de los demás: es a la vez
 * la marca del filtro «Centro de costo» y el id de la vista.
 *
 * Es compuesto porque `restaurante` existe a la vez en tres clientes y son tres columnas distintas
 * — lo que se cruza es el PAR (cliente, centro), no el nombre del centro. Fundirlos por nombre
 * habría sumado el restaurante de tres empresas bajo una sola etiqueta sin que nada lo dijera.
 */
export function consolidatedCenterId(clientId: string, centerId: string): string {
  return `${clientId}${CENTER_REF_SEPARATOR}${centerId}`;
}

/** Lo que un cliente aporta al consolidado: lo que tiene, ya leído de su partición. */
export interface ClientContribution {
  clientId: string;
  /** La etiqueta que el usuario le puso — lo que nombran los avisos. */
  name: string;
  datasets: PygDataset[];
  edits: CellEdit[];
  loadedMonthsByYear: Record<number, number[]>;
}

/**
 * Una PIEZA de la suma: el estado que entró y de qué cliente salió.
 *
 * Es lo que hace que el consolidado se pueda escribir hoja por hoja sin que el Excel tenga que
 * volver a decidir quién entró — la lista ya es exactamente lo que se sumó, así que la invariante
 * «el Consolidado es la suma de sus hojas» no depende de que dos sitios apliquen el mismo filtro.
 *
 * El `clientId` es el del cliente REAL y no el centinela, porque es lo único que empareja la pieza
 * con el logo de su empresa; el `dataset`, en cambio, ya viene con la partición del consolidado
 * puesta, como todo lo demás que sale de aquí.
 */
export interface SummedDetail {
  clientId: string;
  dataset: PygDataset;
}

/** Un cliente que quedó fuera de la suma, y en qué palabras decirlo. */
export interface ExcludedClient {
  name: string;
  reason: string;
}

export interface ConsolidatedWorkspace {
  /** Uno sintético por año, ascendente. Vacío si no hay nada que sumar. */
  datasets: PygDataset[];
  /**
   * Un dataset por (cliente · centro) y año — lo que el filtro «Centro de costo» lista dentro del
   * consolidado y lo que Gráficos compara como series.
   *
   * Están TODOS los del universo, marcados o no: marcar acota lo que `datasets` SUMA, no lo que se
   * puede marcar. Vacío cuando ningún cliente lleva centros, y entonces el consolidado sigue siendo
   * el estado único de siempre.
   */
  centerDatasets: PygDataset[];
  /**
   * Las piezas que el total SUMÓ, cliente por cliente y año por año: los centros que quedaron
   * dentro de quien tiene centros, y el estado entero de quien es de estado único.
   *
   * No es `centerDatasets` acotado: aquel es el UNIVERSO del filtro —marcado o no, y solo
   * centros—, y este es lo que efectivamente se sumó. Con marcas, uno crece y el otro no.
   */
  summedDatasets: SummedDetail[];
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
  centerDatasets: [],
  summedDatasets: [],
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

/**
 * Los centros que el filtro dejó dentro, o `null` —«todos»— cuando no hay ninguna marca VIVA.
 *
 * Es la misma regla que `selectContributions`, y el «viva» es lo que la hace segura: al abrir el
 * consolidado, la barra puede traer todavía marcadas las de un cliente concreto, que aquí no
 * existen. Sin este cruce contra el universo, esas marcas huérfanas vaciarían la pantalla en vez de
 * no decir nada.
 */
function selectCenters(
  universe: readonly PygDataset[],
  marked: readonly string[],
): Set<string> | null {
  const available = new Set(universe.map((dataset) => dataset.centerId as string));
  const picked = marked.filter((id) => available.has(id));
  return picked.length > 0 ? new Set(picked) : null;
}

/**
 * Si un dataset entra en la SUMA.
 *
 * **Marcar centros manda sobre «Cliente»**: filtrar por centros es pedir la suma de ESOS centros y
 * de nada más, así que un cliente de estado único —que no tiene ninguno con el que entrar— queda
 * fuera mientras haya marcas, y se dice (`withoutCentersNotice`). Colarlo entero convertía «los
 * tres restaurantes del grupo» en «los tres restaurantes más una empresa completa», y como los
 * archivos de MicroPlus y Dingoo son de estado único, eso era casi siempre la suma entera.
 *
 * Sin ninguna marca no hay nada que acotar y entra todo lo que «Cliente» dejó dentro.
 */
function contributes(dataset: PygDataset, clientId: string, selected: Set<string> | null): boolean {
  if (selected === null) {
    return true;
  }
  if (dataset.centerId === undefined) {
    return false;
  }
  return selected.has(consolidatedCenterId(clientId, dataset.centerId));
}

export function consolidateClients(
  contributions: readonly ClientContribution[],
  /**
   * Los (cliente · centro) marcados en la barra. Ninguno marcado es TODOS, la misma regla que el
   * resto de los filtros — y marcar acota qué se SUMA, no qué se puede marcar.
   */
  markedCenterIds: readonly string[] = [],
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

  // El universo de centros se arma sobre los clientes INCLUIDOS y antes de mirar ninguna marca:
  // el filtro tiene que poder ofrecer lo que todavía no está marcado.
  const centerDatasets = buildCenterDatasets(included);
  const selected = selectCenters(centerDatasets, markedCenterIds);

  // Lo que cada cliente aporta a la suma, ya acotado. Un cliente cuyos centros quedaron todos
  // fuera no aporta nada, y deja de contar también para la cobertura: un aviso que lo nombrara
  // entre los ausentes hablaría de un cliente que el propio usuario apartó.
  const contributing = included
    .map((contribution) => ({
      contribution,
      datasets: contribution.datasets.filter((dataset) =>
        contributes(dataset, contribution.clientId, selected),
      ),
    }))
    .filter((entry) => entry.datasets.length > 0);
  if (contributing.length === 0) {
    return EMPTY;
  }

  const years = [
    ...new Set(contributing.flatMap((e) => e.datasets.map((dataset) => dataset.year))),
  ].sort((a, b) => a - b);

  const loadedMonthsByYear: Record<number, number[]> = {};
  for (const year of years) {
    const covered = new Set<number>();
    for (const { contribution } of contributing) {
      for (const month of contribution.loadedMonthsByYear[year] ?? []) {
        covered.add(month);
      }
    }
    loadedMonthsByYear[year] = [...covered].sort((a, b) => a - b);
  }

  const structural = new Set<string>();
  const datasets = years.map((year) => {
    // Todos los centros que quedaron dentro, de todos los clientes de ese año, con sus ajustes ya
    // aplicados. Un cliente por centros aporta los suyos que estén marcados; uno de estado único
    // aporta el suyo — la suma no distingue, que es justamente por qué el consolidado no necesita
    // saber en qué modo está cada uno.
    const contributed = contributing.flatMap(({ contribution, datasets: own }) =>
      own
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

  const summed = contributing.map((entry) => entry.contribution);
  return {
    datasets,
    centerDatasets,
    summedDatasets: buildSummedDatasets(contributing, centerDatasets),
    loadedMonthsByYear,
    warnings: [
      ...coverageWarnings(summed, years, loadedMonthsByYear),
      ...structural,
      ...withoutCentersNotice(selected === null ? [] : withoutCenters(included)),
      ...excluded.map(({ name, reason }) => `«${name}» quedó fuera del consolidado: ${reason}.`),
    ],
    contributors: summed.map((contribution) => contribution.name),
    excluded,
  };
}

/**
 * Las piezas de la suma, en el orden en que se leen: cliente por fuera —alfabético, el de
 * `contributions`— y, dentro de cada uno, sus centros por su `order` y luego por año.
 *
 * Un centro REUSA su entrada de `centerDatasets`, que ya trae el id compuesto, el color y los
 * ajustes aplicados: derivar una segunda versión del mismo centro es exactamente cómo las dos
 * acaban diciendo cifras distintas. Un cliente de estado único no tiene ninguna, así que se le
 * deriva la suya con la misma regla —ajustes plegados y la partición del consolidado puesta.
 */
function buildSummedDatasets(
  contributing: readonly { contribution: ClientContribution; datasets: PygDataset[] }[],
  centerDatasets: readonly PygDataset[],
): SummedDetail[] {
  const byCenterYear = new Map(
    centerDatasets.map((dataset) => [`${dataset.centerId}|${dataset.year}`, dataset]),
  );
  return contributing.flatMap(({ contribution, datasets }) =>
    [...datasets]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.year - b.year)
      .map((dataset) => ({
        clientId: contribution.clientId,
        dataset:
          (dataset.centerId === undefined
            ? undefined
            : byCenterYear.get(
                `${consolidatedCenterId(contribution.clientId, dataset.centerId)}|${dataset.year}`,
              )) ?? consolidatedDataset(contribution, dataset),
      })),
  );
}

/**
 * Un dataset del cliente tal como entra en el consolidado: sus ajustes ya plegados en las cuentas
 * —volver a aplicarlos aguas abajo los contaría dos veces— y la partición del consolidado puesta.
 * El nombre que lleva es la ETIQUETA que el usuario le puso al cliente y no la razón social del
 * archivo, que es como el consolidado nombra a sus clientes en todas las demás pantallas.
 */
function consolidatedDataset(contribution: ClientContribution, dataset: PygDataset): PygDataset {
  return {
    ...dataset,
    id: `${CONSOLIDATED_CLIENT_ID}-${contribution.clientId}-${dataset.year}`,
    clientId: CONSOLIDATED_CLIENT_ID,
    companyName: contribution.name,
    accounts: applyEditsToLeafAccounts(
      dataset.accounts,
      contribution.edits.filter((edit) => edit.datasetId === dataset.id),
    ),
    // Ningún archivo declara la utilidad de una pieza suelta dentro de una suma de empresas.
    resultFromFile: [],
    warnings: [],
  };
}

/**
 * Un dataset sintético por (cliente · centro) y año: el universo del filtro «Centro de costo»
 * dentro del consolidado, y las vistas que Gráficos compara.
 *
 * Las dos mitades del rótulo viajan SEPARADAS —`costCenterName` es el centro, `companyName` el
 * cliente— porque el desplegable las lee por separado (encabezado del cliente arriba, sus centros
 * debajo) y todo lo demás las lee juntas («Restaurante · Dingoo» en el chip, en la leyenda y en el
 * informe, porque el mismo centro existe en varias empresas). Componerlas aquí habría obligado al
 * desplegable a deshacer la composición para volver a partirla.
 *
 * El color y el orden se reparten sobre el universo ENTERO, cliente por fuera y centro por dentro,
 * para que los de una misma empresa queden juntos en el desplegable y un centro no cambie de color
 * al cambiar de año. `sin-centro` conserva el último lugar dentro de su cliente, que es donde el
 * `order` de origen ya lo había puesto.
 */
function buildCenterDatasets(included: readonly ClientContribution[]): PygDataset[] {
  // Una ranura por PAR, no por dataset: un centro con dos años ocupa una sola, así que conserva su
  // color y su sitio al cambiar de año.
  const slots = new Map<string, number>();
  const out: PygDataset[] = [];
  for (const contribution of included) {
    const ofClient = [...contribution.datasets]
      .filter((dataset) => dataset.centerId !== undefined)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.year - b.year);
    for (const dataset of ofClient) {
      const id = consolidatedCenterId(contribution.clientId, dataset.centerId as string);
      const slot = slots.get(id) ?? slots.size;
      slots.set(id, slot);
      out.push({
        ...dataset,
        id: `${CONSOLIDATED_CLIENT_ID}-${id}-${dataset.year}`,
        clientId: CONSOLIDATED_CLIENT_ID,
        centerId: id,
        order: slot,
        centerColor: CENTER_PALETTE[slot % CENTER_PALETTE.length],
        costCenterName: dataset.costCenterName || (dataset.centerId as string),
        companyName: contribution.name,
        accounts: applyEditsToLeafAccounts(
          dataset.accounts,
          contribution.edits.filter((edit) => edit.datasetId === dataset.id),
        ),
        // Ningún archivo declara la utilidad de un centro suelto dentro de una suma de empresas.
        resultFromFile: [],
        warnings: [],
      });
    }
  }
  return out;
}

/** Los clientes de estado único: los que no tienen ningún centro con el que entrar. */
function withoutCenters(included: readonly ClientContribution[]): string[] {
  return included
    .filter((contribution) =>
      contribution.datasets.every((dataset) => dataset.centerId === undefined),
    )
    .map((contribution) => contribution.name);
}

/**
 * El aviso de a quién deja fuera un filtro por centros sin que se vea.
 *
 * Solo aparece con centros marcados, y solo para los clientes de estado único: un cliente por
 * centros que se queda fuera lo hace porque el usuario no marcó ninguno de los suyos, y eso está a
 * la vista en la propia lista. Este no aparece en ella siquiera —no tiene centros que ofrecer—, así
 * que sin esta línea desaparecería de la suma sin que nada lo dijera.
 */
function withoutCentersNotice(names: readonly string[]): string[] {
  if (names.length === 0) {
    return [];
  }
  const quoted = names.map((name) => `«${name}»`);
  return [
    names.length === 1
      ? `${quoted[0]} no tiene centros de costo: queda fuera mientras filtres por centro.`
      : `${formatList(quoted)} no tienen centros de costo: quedan fuera mientras filtres por centro.`,
  ];
}

/**
 * El TOTAL se presenta como un ESTADO ÚNICO (`role: "single"`), no como un centro: es la suma de
 * los centros que entraron más los clientes que no tienen ninguno, así que no es de ningún centro
 * en particular. Los centros viajan aparte, en `centerDatasets`, y es allí donde el filtro los
 * lista y Gráficos los compara.
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
