/**
 * Enero–junio de 2026 del libro real de la firma (`COMPARATIVO NOMINA A 2026.xlsx`, hoja
 * `SUELDOS 2021-2026`, filas 59 a 87), que es contra lo que `derive.test.ts` reproduce el reporte
 * entero con igualdad al centavo. Es el mismo recurso que `engine/golden.test.ts` usa en Rol de Pagos:
 * una prueba escrita contra números inventados no habría encontrado ni uno de los desacuerdos que
 * importan.
 *
 * Dos aclaraciones sobre de dónde sale cada serie:
 *
 * - **`5.5.01.01` no está en el libro**: lo que el libro escribe es la nómina de la familia (un número
 *   duro) y el resto como `=26302.69-D61`. La cuenta es la SUMA de las dos, que es justamente la
 *   aritmética que la identifica.
 * - **El reparto mensual de las ventas es arbitrario.** El libro sólo declara el total del tramo
 *   ($1,441,884.42, celda C84); lo que estas pruebas verifican de las ventas es la suma y los
 *   porcentajes que salen de ella, nunca un mes suelto.
 */
import type { PersonnelCostYearInput } from "./types";

/** Los seis meses cargados del ejercicio. */
export const GOLDEN_COVERAGE = [0, 1, 2, 3, 4, 5];

/** $1,441,884.42 repartidos en partes iguales entre los seis meses del tramo. */
const MONTHLY_REVENUE = 240314.07;

function months(values: readonly number[]): number[] {
  return [...values, ...Array.from({ length: 12 - values.length }, () => 0)];
}

/** La nómina de la familia, tal como el libro la escribe en la fila 61. */
export const GOLDEN_FAMILY: (number | null)[] = [
  18313.53,
  18313.53,
  18313.53,
  18313.53,
  15614.69,
  15614.69,
  null,
  null,
  null,
  null,
  null,
  null,
];

/** Los veinte códigos que el mapa lee, con sus seis meses. */
export const GOLDEN_ACCOUNTS: ReadonlyMap<string, readonly number[]> = new Map([
  // 5.5.01.01 = familia + «Administración»: 18,313.53 + 7,989.16 = 26,302.69 en enero.
  ["5.5.01.01", months([26302.69, 26093.22, 26905.64, 26792.16, 23046.25, 23811.88])],
  ["5.2.02", months([6094.29, 6597.47, 5956.82, 6211.27, 6625.12, 6488.22])],
  ["5.3.02", months([6984.38, 6519.15, 6269.9, 6135.03, 7756.57, 7235.57])],
  ["5.2.04.01.01", months([5318.87, 11127.13, 9340, 8951.84, 6573.24, 6709.26])],
  ["5.2.04.01.02", months([3070.45, 3416.37, 2605.77, 2829.27, 4108.44, 3591.94])],
  ["5.2.04.01.03", months([4690.89, 9100.75, 8155.92, 6998.74, 6806.12, 10319.06])],
  ["5.2.04.01.04", months([366.46, 0, 798.5, 621.62, 1705.56, 1044.68])],
  ["5.2.04.01.05", months([616.67, 600, 600, 600, 622.97, 620])],
  ["5.2.04.01.06", months([0, 0, 0, 0, 0, 0])],
  ["5.2.04.01.07", months([239.61, 1947.34, 1035.51, 1050.97, 1035.51, 1245.65])],
  ["5.5.01.02.01.01", months([1111.11, 1111.11, 1111.11, 1111.11, 1111.11, 1111.11])],
  ["5.2.05.01.01", months([1193.58, 6493.84, 6571.55, 5153.93, 5133.12, 4720.52])],
  ["5.3.03.01.01", months([42264.05, 45564.34, 42590.54, 46608.34, 33680.51, 70258.79])],
  ["5.3.03.01.02", months([4615.15, 2322.5, 2032.5, 900, 1305, 1807.5])],
  ["5.3.03.01.03", months([1188.42, 340, 1338.88, 3021.83, 699.17, 2027.5])],
  ["5.3.03.01.04", months([110, 0, 0, 0, 0, 0])],
  ["5.3.03.01.05", months([0, 0, 300, 300, 0, 3285.91])],
  ["5.3.03.01.06", months([0, 0, 0, 0, 0, 0])],
  ["5.3.03.01.07", months([0, 0, 0, 444.44, 0, 0])],
  ["5.3.03.17.06", months([36.5, 18498.33, 0, 0, 0, 0])],
]);

/** El ejercicio 2026 entero, listo para `readPersonnelYear`. */
export function goldenYear(
  overrides: Partial<PersonnelCostYearInput> = {},
): PersonnelCostYearInput {
  return {
    year: 2026,
    coverage: GOLDEN_COVERAGE,
    accounts: GOLDEN_ACCOUNTS,
    revenue: months(Array.from({ length: 6 }, () => MONTHLY_REVENUE)),
    family: GOLDEN_FAMILY,
    ...overrides,
  };
}

/** Los totales que el libro escribe en su columna P, por concepto. */
export const GOLDEN_CONCEPT_TOTALS: Record<string, number> = {
  familia: 104483.5,
  administracion: 48468.34,
  "mano-obra-directa": 37973.19,
  "mano-obra-indirecta": 40900.6,
  "honorarios-medicos-planta": 48020.34,
  "honorarios-imagenologia-planta": 19622.24,
  "honorarios-enfermeria-planta": 46071.48,
  "honorarios-laboratorio-planta": 4536.82,
  "honorarios-fisioterapia-planta": 3659.64,
  "honorarios-farmacia-planta": 0,
  "honorarios-otros-planta": 6554.59,
  "honorarios-asesoria-contable": 6666.66,
  "servicios-prestados-planta": 29266.54,
  "honorarios-medicos-externos": 280966.57,
  "honorarios-imagenologia-externos": 12982.65,
  "honorarios-enfermeria-externos": 8615.8,
  "honorarios-laboratorio-externos": 110,
  "honorarios-fisioterapia-externos": 3885.91,
  "honorarios-farmacia-externos": 0,
  "honorarios-otros-externos": 444.44,
  "servicios-prestados-externos": 18534.83,
};

/** La fila 82 del libro: el total de costo de personal, mes a mes. */
export const GOLDEN_MONTHLY_TOTAL = [
  104203.12, 139731.55, 115612.64, 117730.54, 100208.69, 144277.59,
];
