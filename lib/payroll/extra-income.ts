/**
 * LOS CONCEPTOS DE INGRESO QUE UN PERÍODO DECLARA, además de los trece del libro.
 *
 * El rol de cada empresa nombra los suyos: el libro de DELICMAR trae `MOVILIZACION NO APORTABLE`,
 * `ALIMENTACION NO APORTABLE` y `BONO NO APORTABLE` donde el de Cultura Manor trae viáticos,
 * comisión fija y bono cumplimiento. No son conceptos que añadir al catálogo —el siguiente cliente
 * traerá otros tres— sino el MISMO concepto declarado con nombres distintos, y lo único que el
 * cálculo mira de ellos es la CLASE.
 *
 * Este archivo es la capa pura de esa idea: sumar por clase, comprobar los dos topes y validar un
 * rótulo. No sabe de Dexie ni de React, y ninguna de sus funciones toca el motor: lo que el motor
 * recibe son los dos agregados que `sumExtraIncome` devuelve.
 */
import { MAX_ENTITY_NAME_LENGTH, normalizeEntityName, normalizeLabel } from "@/lib/workspaces";
import type { EntityNameCheck } from "@/lib/workspaces";
import { sameToTheCentavo } from "./amounts";
import type { ExtraIncomeTotals } from "./engine/types";
import type { PayrollExtraConcept, PayrollExtraConceptKind } from "./types";

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
 * Suma los importes de una captura por la clase que el PERÍODO declaró.
 *
 * Recorre las DECLARACIONES, no los importes, y eso es lo que hace que un importe huérfano —el de
 * un concepto que ya no existe— no sume: sin declaración no hay clase, y sin clase no hay base a la
 * que sumarlo. `db.ts` los limpia al borrar el concepto, pero esta función no depende de que lo
 * haya hecho.
 */
export function sumExtraIncome(
  concepts: readonly PayrollExtraConcept[],
  amounts: Readonly<Record<string, number>> | undefined,
): ExtraIncomeTotals {
  if (concepts.length === 0 || !amounts) {
    return { ...NO_EXTRA_INCOME };
  }

  let contributory = 0;
  let nonContributory = 0;
  for (const concept of concepts) {
    const amount = amounts[concept.id] ?? 0;
    if (concept.kind === "aportable") {
      contributory += amount;
    } else {
      nonContributory += amount;
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
 * Valida el rótulo de un concepto dentro de SU período.
 *
 * Se apoya en las reglas genéricas de `lib/workspaces.ts` —no vacío, tope de 60, comparación sin
 * mayúsculas ni acentos— que ya usan los clientes de PyG y los hoteles de Ocupaciones, en vez de
 * abrir una tercera definición de «este nombre ya está tomado».
 *
 * `selfId` es el concepto que se está RENOMBRANDO: sin él, dejar un rótulo como está chocaría
 * consigo mismo.
 *
 * La unicidad ignora la clase a propósito: dos filas rotuladas `Bono`, una aportable y otra no, se
 * leen igual en la tabla y en el comprobante, y quien las revise no puede saber cuál es cuál.
 */
export function validateExtraLabel(
  raw: string,
  existing: readonly PayrollExtraConcept[],
  selfId?: string,
): EntityNameCheck {
  const check = normalizeEntityName(raw, "concepto");
  if (!check.ok) {
    return check;
  }

  const normalized = normalizeLabel(check.name);
  const clash = existing.find(
    (concept) => concept.id !== selfId && normalizeLabel(concept.label) === normalized,
  );
  return clash
    ? { ok: false, message: `Este período ya tiene un concepto llamado «${clash.label}».` }
    : check;
}

/**
 * Un concepto recién declarado. El `id` se deriva de los que ya hay en vez de un aleatorio: esta
 * capa es pura y testeable, y un `crypto.randomUUID()` aquí obligaría a inyectarlo o a mockearlo.
 * Basta con que sea único DENTRO del período, que es el único sitio donde se referencia.
 */
export function newExtraConcept(
  label: string,
  kind: PayrollExtraConceptKind,
  existing: readonly PayrollExtraConcept[],
): PayrollExtraConcept {
  const taken = new Set(existing.map((concept) => concept.id));
  let n = existing.length + 1;
  while (taken.has(`x${n}`)) {
    n += 1;
  }
  return { id: `x${n}`, label: label.trim().replace(/\s+/g, " "), kind };
}

/**
 * Quitar un concepto es DOS cosas, y por eso vuelven juntas: la declaración se va del período y su
 * importe se va de cada captura.
 *
 * Un importe huérfano no sumaría —`sumExtraIncome` recorre las declaraciones— pero volvería a la
 * vida si alguien reusara el `id`. Es improbable y silencioso, que es justo el modo de fallo que
 * conviene cerrar en la puerta.
 */
export function removeExtraConcept(
  concepts: readonly PayrollExtraConcept[],
  conceptId: string,
): {
  concepts: PayrollExtraConcept[];
  pruneAmounts: (amounts: Readonly<Record<string, number>> | undefined) => Record<string, number>;
} {
  return {
    concepts: concepts.filter((concept) => concept.id !== conceptId),
    pruneAmounts: (amounts) => {
      const next = { ...(amounts ?? {}) };
      delete next[conceptId];
      return next;
    },
  };
}
