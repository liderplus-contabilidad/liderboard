/**
 * LAS FILAS DE BONO QUE UN EMPLEADO DECLARA EN SU MES, además de los trece ingresos del libro.
 *
 * El rol de cada empresa nombra los suyos: el libro de DELICMAR trae `MOVILIZACION NO APORTABLE`,
 * `ALIMENTACION NO APORTABLE` y `BONO NO APORTABLE` donde el de Cultura Manor trae viáticos,
 * comisión fija y bono cumplimiento. No son conceptos que añadir al catálogo —el siguiente cliente
 * traerá otros tres— sino el MISMO concepto declarado con nombres distintos, y lo único que el
 * cálculo mira de ellos es la CLASE.
 *
 * Este archivo es la capa pura de esa idea: sumar por clase, comprobar los dos topes y las cuatro
 * operaciones sobre la lista de filas. No sabe de Dexie ni de React, y ninguna de sus funciones
 * toca el motor: lo que el motor recibe son los dos agregados que `sumExtraIncome` devuelve. Cómo
 * se VALIDA un rótulo no está aquí sino en `row-labels.ts`, que es donde se resuelve el de toda
 * fila del rol — el de un bono no se juzga contra otra regla que el de `E-11 Otros`.
 */
import { MAX_ENTITY_NAME_LENGTH } from "@/lib/workspaces";
import { sameToTheCentavo } from "./amounts";
import type { ExtraIncomeTotals } from "./engine/types";
import type { PayrollExtraConceptKind, PayrollExtraRow } from "./types";

export type { ExtraIncomeTotals };

export { MAX_ENTITY_NAME_LENGTH as MAX_EXTRA_CONCEPT_LABEL_LENGTH };

/**
 * El tope de los NO aportables: el 20 % del sueldo unificado.
 *
 * No sale de una fórmula del libro sino de dos celdas que el contador escribe A MANO al pie de la
 * columna del sueldo —`48.20 / 20%` sobre `241.00`, `100.00 / 20%` sobre `500.00`—, y por eso se
 * anota de dónde viene: si la firma lo mueve, se mueve aquí y en ningún otro sitio.
 */
export const NON_CONTRIBUTORY_CAP_RATE = 0.2;

/** El tope de los APORTABLES: el sueldo unificado entero. */
export const CONTRIBUTORY_CAP_RATE = 1;

/**
 * Un período que no declara ningún concepto extra.
 *
 * `ExtraIncomeTotals` se declara en `engine/types.ts` —el vocabulario del motor— y este archivo es
 * quien lo PRODUCE: ni la lista ni los rótulos llegan al cálculo, porque para las seis bases tres
 * bonos aportables de 50 y uno de 150 son indistinguibles.
 */
export const NO_EXTRA_INCOME: ExtraIncomeTotals = { contributory: 0, nonContributory: 0 };

/**
 * Suma los importes de las filas de bono de un empleado por su clase.
 *
 * Recorre las filas, que llevan su importe dentro, y por eso ya no existe la figura del importe
 * huérfano que la versión anterior tenía que defender: cuando la declaración vivía en el período y
 * el importe en la ficha, borrar una podía dejar el otro. Aquí quitar la fila se lleva las dos
 * cosas porque son la misma cosa.
 */
export function sumExtraIncome(rows: readonly PayrollExtraRow[] | undefined): ExtraIncomeTotals {
  if (!rows || rows.length === 0) {
    return { ...NO_EXTRA_INCOME };
  }

  let contributory = 0;
  let nonContributory = 0;
  for (const row of rows) {
    if (row.kind === "aportable") {
      contributory += row.amount;
    } else {
      nonContributory += row.amount;
    }
  }
  return { contributory, nonContributory };
}

/** Un tope superado: qué clase, cuánto suma, hasta dónde llegaba y por cuánto se pasó. */
export interface ExtraCapBreach {
  kind: PayrollExtraConceptKind;
  total: number;
  cap: number;
  excess: number;
}

/**
 * Los topes que la firma fija sobre el SUELDO UNIFICADO (`F`).
 *
 * Se mide contra `F` y no contra `D · SUELDO BASE` porque es la columna bajo la que el contador
 * escribió su propio 20 %. Con 30 días pagados las dos cifras coinciden, así que ningún test las
 * distingue; el día que la firma diga otra cosa, es una línea.
 *
 * Se juzga la SUMA de cada clase y no concepto a concepto: es lo que el 20 % del libro mide, y tres
 * bonos de 20 sobre un sueldo de 200 se pasan aunque ninguno lo haga por su cuenta.
 *
 * El exceso se juzga al CENTAVO (`sameToTheCentavo`, la única definición de «mismo importe» del
 * módulo): el sueldo unificado es una división redondeada y su 20 % cae en medio de un bit, así que
 * la comparación exacta avisaría de excesos de `1e-13` que nadie puede corregir.
 *
 * Devuelve una LISTA y no un booleano porque las dos clases pueden pasarse a la vez y el aviso tiene
 * que poder nombrarlas por separado. El aportable va primero, que es el orden en que la tabla los
 * enseña.
 */
export function extraCapBreaches(
  totals: ExtraIncomeTotals,
  unifiedSalary: number,
): ExtraCapBreach[] {
  const breaches: ExtraCapBreach[] = [];

  const check = (kind: PayrollExtraConceptKind, total: number, cap: number): void => {
    if (total > cap && !sameToTheCentavo(total, cap)) {
      breaches.push({ kind, total, cap, excess: total - cap });
    }
  };

  check("aportable", totals.contributory, unifiedSalary * CONTRIBUTORY_CAP_RATE);
  check("noAportable", totals.nonContributory, unifiedSalary * NON_CONTRIBUTORY_CAP_RATE);
  return breaches;
}

/** Cómo se nombra cada clase en pantalla. Aquí y no en el componente, por la misma razón que los
 *  rótulos del catálogo viven en `concepts.ts`: dos pantallas no pueden llamarlo distinto. */
export const EXTRA_CONCEPT_KIND_LABEL: Record<PayrollExtraConceptKind, string> = {
  aportable: "Bono aportable",
  noAportable: "Bono no aportable",
};

/** La versión corta, la que va junto al nombre en la tabla — a la derecha del campo, donde compite
 *  con él por el ancho. */
export const EXTRA_CONCEPT_KIND_SHORT: Record<PayrollExtraConceptKind, string> = {
  aportable: "Aportable",
  noAportable: "No aportable",
};

/**
 * El aviso en castellano llano, con las tres cifras que hacen falta para corregirlo: cuánto suma,
 * hasta dónde llegaba y por cuánto se pasó.
 *
 * Vive en la capa pura y no en el componente por lo mismo que `describeShares` de PyG: el texto de
 * un aviso es una afirmación sobre las cifras y se prueba con ellas. El formato del importe lo pone
 * quien lo dibuje — aquí se devuelven los números, no `$`.
 */
export function describeCapBreach(breach: ExtraCapBreach): {
  subject: string;
  rule: string;
} {
  return breach.kind === "noAportable"
    ? {
        subject: "Los bonos no aportables",
        rule: `el ${Math.round(NON_CONTRIBUTORY_CAP_RATE * 100)} % del sueldo unificado`,
      }
    : { subject: "Los bonos aportables", rule: "el sueldo unificado" };
}

/**
 * Una fila de bono recién declarada, con su rótulo por defecto.
 *
 * El `id` se deriva de las que ya hay en vez de un aleatorio: esta capa es pura y testeable, y un
 * `crypto.randomUUID()` aquí obligaría a inyectarlo o a mockearlo. Basta con que sea único DENTRO
 * de esa captura, que es el único sitio donde se referencia.
 *
 * Nace CON nombre en vez de vacío porque el rótulo es único entre las filas del empleado y dos
 * filas sin nombre chocarían entre sí antes de que nadie escriba nada. El sufijo se busca contra
 * los rótulos ya tomados, no contra un contador, para que borrar el 2 y volver a crear no dé un 3.
 */
export function newExtraRow(
  kind: PayrollExtraConceptKind,
  existing: readonly PayrollExtraRow[],
  taken: readonly string[] = [],
): PayrollExtraRow {
  const ids = new Set(existing.map((row) => row.id));
  let n = existing.length + 1;
  while (ids.has(`x${n}`)) {
    n += 1;
  }

  const base = EXTRA_CONCEPT_KIND_LABEL[kind];
  const names = new Set(
    [...existing.map((row) => row.label), ...taken].map((label) => label.toLowerCase()),
  );
  let label = base;
  let suffix = 2;
  while (names.has(label.toLowerCase())) {
    label = `${base} ${suffix}`;
    suffix += 1;
  }

  return { id: `x${n}`, label, kind, amount: 0 };
}

/**
 * Quita una fila de bono. Es un filtro y nada más: el importe se va con ella porque vive dentro.
 *
 * La versión anterior devolvía además un `pruneAmounts` para limpiar las capturas del período, que
 * era la mitad cara de tener la declaración y el importe en estructuras distintas.
 */
export function removeExtraRow(rows: readonly PayrollExtraRow[], rowId: string): PayrollExtraRow[] {
  return rows.filter((row) => row.id !== rowId);
}

/** Cambia el rótulo de una fila, sin tocar su importe ni su clase. */
export function renameExtraRow(
  rows: readonly PayrollExtraRow[],
  rowId: string,
  label: string,
): PayrollExtraRow[] {
  return rows.map((row) => (row.id === rowId ? { ...row, label } : row));
}

/** Cambia el importe de una fila, sin tocar su rótulo ni su clase. */
export function setExtraRowAmount(
  rows: readonly PayrollExtraRow[],
  rowId: string,
  amount: number,
): PayrollExtraRow[] {
  return rows.map((row) => (row.id === rowId ? { ...row, amount } : row));
}
