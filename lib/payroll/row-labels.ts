/**
 * CÓMO SE LLAMA UNA FILA DEL ROL — la única resolución, y la única validación, de un rótulo.
 *
 * El catálogo (`concepts.ts`) declara los rótulos del libro: el de pantalla (`label`) y el verbatim
 * del comprobante (`payslipLabel`). Este archivo es lo que deja que un empleado escriba el suyo
 * encima, y existe porque `E-11 OTROS` es un comodín: es la columna `AH` del libro, significa cosas
 * distintas en empleados distintos, y el comprobante que cada uno firma imprimía el nombre de la
 * COLUMNA en vez del nombre del descuento.
 *
 * Vive aparte de `concepts.ts` a propósito: aquel declara una CONSTANTE sin dependencias de lo que
 * se teclea, y esto es una función de la captura. Fundirlos haría que el catálogo importara el tipo
 * de lo que se captura, que es justo la dirección contraria.
 *
 * Un rótulo propio pisa LOS DOS rótulos del libro. Pisar solo el de pantalla dejaría el comprobante
 * —el papel que el empleado firma, que es el motivo de todo esto— diciendo `OTROS`.
 */
import { normalizeEntityName, normalizeLabel } from "@/lib/workspaces";
import type { EntityNameCheck } from "@/lib/workspaces";
import type { ConceptBase, DeductionConcept, IncomeConcept } from "./concepts";
import type { PayrollMonthlyCapture } from "./types";

/** Un concepto del catálogo, de cualquiera de las dos tablas. */
export type CatalogueConcept = IncomeConcept | DeductionConcept;

/**
 * Si esta fila admite rótulo propio: solo las que TECLEAN SU IMPORTE.
 *
 * No es `isChoosable`, que ya existe en `concepts.ts` y devuelve `true` también para las tres horas
 * extras: aquellas son `calculado` —el motor deriva su valor— y capturan su CANTIDAD, pero su
 * rótulo es una tasa de ley. Renombrarlas dejaría rotular `50%` como `100%` sobre un cálculo que
 * sigue siendo al 50 %, y esa es una mentira que ninguna cifra delata.
 */
export function isRenameable(concept: CatalogueConcept): boolean {
  return concept.kind === "capturado";
}

/** El rótulo propio guardado, ya recortado, o `null` si esta fila se llama como el libro. */
function ownLabel(concept: CatalogueConcept, capture: PayrollMonthlyCapture): string | null {
  if (!isRenameable(concept)) {
    return null;
  }
  const raw = capture.labels?.[concept.code]?.trim();
  return raw ? raw : null;
}

/** Como se llama esta fila EN PANTALLA para este empleado. */
export function labelFor(concept: CatalogueConcept, capture: PayrollMonthlyCapture): string {
  return ownLabel(concept, capture) ?? concept.label;
}

/**
 * Como se llama esta fila EN EL COMPROBANTE. En mayúsculas, que es la convención de todos los
 * `payslipLabel` del catálogo — un rótulo propio en minúsculas rompería el paso de las 26 filas.
 */
export function payslipLabelFor(
  concept: ConceptBase & { kind: "calculado" | "capturado" },
  capture: PayrollMonthlyCapture,
): string {
  const own = ownLabel(concept as CatalogueConcept, capture);
  return own ? own.toUpperCase() : concept.payslipLabel;
}

/** Una fila y su rótulo efectivo. La `key` es el código del concepto o el `id` de la fila de bono:
 *  es lo que permite excluir del cotejo la fila que se está renombrando. */
export interface RowLabelRef {
  key: string;
  label: string;
}

/**
 * TODOS los rótulos que este empleado tiene a la vista — los conceptos que se le pasen, con su
 * rótulo efectivo, más sus filas de bono.
 *
 * Es el universo contra el que se juzga la unicidad, y por eso el ámbito ya no es el período: lo que
 * esta regla protege es que dos filas de un MISMO comprobante no se llamen igual, porque entonces
 * quien lo revisa no puede saber cuál es cuál. Dos empleados llamando `Uniformes` a su fila es
 * legítimo y siempre lo fue.
 */
export function rowLabelUniverse(
  capture: PayrollMonthlyCapture,
  concepts: readonly CatalogueConcept[],
): RowLabelRef[] {
  return [
    ...concepts.map((concept) => ({ key: concept.code, label: labelFor(concept, capture) })),
    ...(capture.extras ?? []).map((row) => ({ key: row.id, label: row.label })),
  ];
}

/**
 * Valida el rótulo de una fila contra las demás filas de ese empleado.
 *
 * Se apoya en las reglas genéricas de `lib/workspaces.ts` —no vacío, tope de 60, comparación sin
 * mayúsculas ni acentos— que ya usan los clientes de PyG y los hoteles de Ocupaciones, en vez de
 * abrir una tercera definición de «este nombre ya está tomado».
 *
 * `selfKey` es la fila que se está renombrando: sin ella, dejar un rótulo como está chocaría
 * consigo mismo.
 */
export function validateRowLabel(
  raw: string,
  taken: readonly RowLabelRef[],
  selfKey?: string,
): EntityNameCheck {
  const check = normalizeEntityName(raw, "concepto");
  if (!check.ok) {
    return check;
  }
  const normalized = normalizeLabel(check.name);
  const clash = taken.find(
    (row) => row.key !== selfKey && normalizeLabel(row.label) === normalized,
  );
  return clash
    ? { ok: false, message: `Este empleado ya tiene una fila llamada «${clash.label}».` }
    : check;
}

/**
 * Escribe —o borra— el rótulo propio de una fila del catálogo.
 *
 * Un nombre vacío BORRA la entrada en vez de guardarla vacía: una fila sin rótulo propio se llama
 * como el libro, y guardar `""` afirmaría que alguien la nombró así.
 */
export function withRowLabel(
  labels: Readonly<Record<string, string>> | undefined,
  code: string,
  name: string,
): Record<string, string> {
  const next = { ...(labels ?? {}) };
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed) {
    next[code] = trimmed;
  } else {
    delete next[code];
  }
  return next;
}

/**
 * Quita el rótulo propio de una fila. Se llama al QUITAR la fila, junto con su importe y en la
 * misma escritura: un rótulo huérfano volvería a la vida al agregar de nuevo ese concepto,
 * poniéndole a una cifra nueva el nombre de otro mes.
 */
export function withoutRowLabel(
  labels: Readonly<Record<string, string>> | undefined,
  code: string,
): Record<string, string> {
  const next = { ...(labels ?? {}) };
  delete next[code];
  return next;
}
