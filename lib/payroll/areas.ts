/**
 * El universo de ÁREAS que ofrece el formulario de un empleado.
 *
 * Es la unión de dos cosas, y las dos hacen falta:
 *
 *   - **Las estándar**, en el orden en que el rol de HOTEL BOUTIQUE CULTURA MANOR las lista. Sin
 *     ellas, el primer empleado de un cliente recién creado no tendría ninguna opción que elegir:
 *     un período vacío no tiene de dónde derivar un área.
 *   - **Las que el período ya trae.** El parser escribe el área VERBATIM del bloque de la hoja
 *     (`rol-general-grid.ts`), así que un cliente puede tener «MANTENIMIENTO» o «SPA» sin que esta
 *     lista lo sepa. Si el formulario solo ofreciera las cinco estándar, dar de alta a alguien de
 *     esa área obligaría a archivarlo bajo otra — y el área es el bloque en el que el rol lo
 *     agrupa y bajo el que el asiento lo suma, así que elegir mal no es cosmético.
 *
 * Es por tanto una lista ABIERTA presentada como cerrada: el estándar es el suelo, la nómina
 * cargada es lo que la ensancha. Lo que NO hace es inventarse un área nueva desde el formulario;
 * para eso está la carga del archivo, que es de donde salen las de verdad.
 */

/** Las cinco áreas del rol real, en el orden en que su hoja `GENERAL` las apila. */
export const STANDARD_PAYROLL_AREAS: readonly string[] = [
  "ADMINISTRACION",
  "HOSPEDAJE",
  "RESTAURANTE",
  "COCINA",
  "VENTAS",
];

/** La clave con la que se decide si dos áreas son la misma: sin espacios de sobra y sin distinguir
 *  mayúsculas, para que « cocina » no abra un segundo bloque junto a «COCINA». */
function key(area: string): string {
  return area.trim().toUpperCase();
}

/**
 * Las áreas elegibles: las estándar primero —en el orden del rol, que es como se leen— y detrás
 * las propias del período, alfabéticas. El orden alfabético es deliberado: tomarlas en el orden en
 * que aparecen en la nómina haría que la lista se reordenara sola al cargar otro mes.
 */
export function areaOptions(lines: readonly { area: string }[]): string[] {
  const seen = new Set(STANDARD_PAYROLL_AREAS.map(key));
  const extra = new Map<string, string>();

  for (const line of lines) {
    const trimmed = line.area.trim();
    if (trimmed === "" || seen.has(key(trimmed))) {
      continue;
    }
    // La primera grafía que aparece es la que se ofrece; las siguientes son la misma área.
    if (!extra.has(key(trimmed))) {
      extra.set(key(trimmed), trimmed);
    }
  }

  return [...STANDARD_PAYROLL_AREAS, ...[...extra.values()].sort((a, b) => a.localeCompare(b))];
}
