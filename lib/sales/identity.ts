/**
 * De qué EMPRESA son las ventas de un cliente: la razón social que declaran sus archivos.
 *
 * Es DERIVADA y no se guarda —la misma decisión que `deriveHotelIdentity` en Ocupaciones y
 * `deriveWorkspaceIdentity` en PyG—, y eso es lo que hace gratis la regla que importa: **un cliente
 * sin ventas cargadas no tiene identidad**, así que la primera carga la ADOPTA y no puede chocar
 * con nada. Borrar el último mes devuelve al cliente a no tener ninguna.
 *
 * Es UN solo campo, al revés que PyG, y por el mismo motivo que en Ocupaciones: hay un único
 * parser, así que no hay sistema con el que discrepar, y aquí no existe un «modo» de guardar.
 *
 * **El nombre del CLIENTE nunca entra en esta comparación.** El usuario llama «Clínica Durán» a lo
 * que el archivo llama `HOSPITAL GENERAL PRIVADO DURAN S.A.`; comparar la etiqueta contra la razón
 * social rechazaría cargas legítimas, que es la regla que PyG y Ocupaciones ya sostienen.
 */
import type { ParsedSalesMonth, SalesMonth } from "./types";

export interface SalesIdentity {
  /** Verbatim, tal como el archivo la declara — es lo que el aviso enseña. */
  companyName: string;
}

/** Sin acentos, en minúsculas, y con la puntuación convertida en SEPARADOR en vez de desaparecer:
 *  `DURAN S.A.` → `duran s a`, que es lo que impide fundir dos empresas que solo se distinguen por
 *  una palabra. */
function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** La identidad de lo que el cliente YA tiene, o `null` si no tiene nada. */
export function deriveSalesIdentity(months: readonly SalesMonth[]): SalesIdentity | null {
  const named = months.find((month) => month.companyName.trim() !== "");
  return named ? { companyName: named.companyName } : null;
}

/** La identidad de lo que llega. `null` si ningún archivo del lote declara empresa. */
export function incomingSalesIdentity(parsed: readonly ParsedSalesMonth[]): SalesIdentity | null {
  const named = parsed.find((month) => month.companyName.trim() !== "");
  return named ? { companyName: named.companyName } : null;
}

export function sameSalesIdentity(a: SalesIdentity, b: SalesIdentity): boolean {
  return normalize(a.companyName) === normalize(b.companyName);
}

/**
 * El aviso, cuando lo que llega contradice lo que el cliente ya tiene. Es un AVISO y no un
 * bloqueo: la empresa puede haberse renombrado, y la app no puede saberlo — lo que no puede es
 * escribir la facturación de otra compañía encima sin decirlo.
 */
export function describeSalesIdentityClash(
  current: SalesIdentity,
  incoming: SalesIdentity,
  clientName: string,
): string {
  return (
    `Las ventas cargadas en «${clientName}» son de ${current.companyName}, y estos archivos ` +
    `declaran ${sentenceEnd(incoming.companyName)} Si es la misma empresa con otro nombre, ` +
    `continúa; si no, cancela y abre el cliente al que pertenecen: cargar aquí mezclaría la ` +
    `facturación de dos compañías en un mismo cliente.`
  );
}

/**
 * Cierra la frase sin doblar el punto. Media razón social del país acaba en una forma societaria
 * abreviada —`S.A.`, `CIA. LTDA.`— y añadirle el punto de la oración deja un `S.A..` que se lee
 * como una errata de la app sobre el nombre del cliente.
 */
function sentenceEnd(name: string): string {
  const trimmed = name.trim();
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}
