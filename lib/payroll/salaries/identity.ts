/**
 * Con qué se reconoce que dos fichas de PERÍODOS distintos son la misma persona.
 *
 * Hace falta porque cada período guarda su propia `PayrollEmployeeLine`: copiar la nómina del mes
 * anterior crea filas nuevas con `id` nuevo (ver `roster.ts`), y una carga las reemplaza enteras.
 * Sin una clave estable, «SANDOVAL» sería tres filas de un mes cada una y la pantalla de sueldos
 * por área no podría enseñar la evolución de nadie.
 *
 * La clave es la **cédula**, y el **nombre** solo cuando la ficha no la trae. El reparto no es
 * arbitrario: el alta a mano ya exige la cédula y rechaza la repetida dentro del período
 * (`validateEmployeeForm`), así que donde existe es de fiar; el importador, en cambio, escribe lo
 * que diga el archivo sin exigirla, y una regla de solo-cédula dejaría filas anónimas que el
 * contador no puede leer.
 *
 * Las dos claves viven en ESPACIOS SEPARADOS —el prefijo es lo que los separa— para que una ficha
 * sin cédula nunca se funda con una que sí la declara aunque el nombre coincida: son dos evidencias
 * distintas, y mezclarlas inventaría una coincidencia que nadie afirmó.
 *
 * Lo que esta regla NO intenta: decidir cuál es la buena cuando dos fichas del mismo mes repiten
 * cédula. Ahí sumaría dos costos en una fila, y el síntoma —una fila con dos cargos alternándose—
 * se ve en pantalla. Dentro de un período eso ya lo rechaza el formulario.
 */
import { normalizeLabel } from "@/lib/workspaces";
import type { ParsedPayrollEmployeeLine } from "../types";

/** Lo mínimo que hace falta para identificar a alguien: no se pide la ficha entera para que la
 *  clave se pueda calcular sobre cualquier proyección de ella. */
export type EmployeeIdentityFields = Pick<ParsedPayrollEmployeeLine, "name" | "idCard">;

/**
 * La clave con la que agrupar las fichas de una misma persona a lo largo de varios períodos.
 *
 * Devuelve `null` únicamente cuando la ficha no tiene NI cédula NI nombre, que es una fila sin
 * nada con lo que identificarla: quien llame decide qué hacer con ella (la pantalla la descarta,
 * porque una fila sin rótulo no se puede leer).
 */
export function employeeKey(line: EmployeeIdentityFields): string | null {
  const idCard = line.idCard.trim();
  if (idCard !== "") {
    return `cedula:${idCard}`;
  }
  const name = normalizeLabel(line.name);
  return name === "" ? null : `nombre:${name}`;
}
