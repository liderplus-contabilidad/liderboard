/**
 * El CLIENTE de PyG: un nombre elegido por el usuario más exactamente un estado de resultados.
 * Esta capa es pura — el nombre y su validación, el orden de la lista, el buscador del selector y
 * la resolución de a qué cliente pertenece una identidad entrante. Quién guarda qué es `db.ts`.
 *
 * La mitad GENÉRICA de todo eso vive en `@/lib/workspaces` y la comparte con Ocupaciones, que
 * guarda varios hoteles con las mismas reglas de nombre. Aquí queda lo que habla de PyG: los
 * nombres con que el módulo la llama y la identidad `(sistema, empresa, modo)`, que es la única
 * parte que sabe de qué van los datos.
 *
 * La distinción que sostiene todo el módulo: **la etiqueta NO es la identidad**. El usuario llama
 * «Manor Galápagos» a lo que el archivo llama `DARWIN & WOLF HOTELES Y TURISMO DARWOLF S.A.`, así
 * que el nombre nunca se compara contra un archivo. Lo que se compara es la identidad
 * `(sistema, empresa, modo)` que el cliente ADOPTÓ en su primera carga, y de eso se ocupa
 * `findClientForIdentity`.
 */
import {
  findByName,
  isNameTaken as isEntityNameTaken,
  MAX_ENTITY_NAME_LENGTH,
  normalizeEntityName,
  proposeEntityName,
  sortByName,
  type CenterLogos,
  type EntityLogo,
  type EntityNameCheck,
} from "@/lib/workspaces";
import { compareIdentity, type WorkspaceIdentity } from "./workspace-identity";

export interface PygClient {
  id: string;
  /** Etiqueta del usuario. No es la razón social del archivo, y nunca se compara con ella. */
  name: string;
  /** El logo que subió el usuario, si subió alguno. La otra mitad de la etiqueta: tampoco sale de
   *  ningún archivo. Campo opcional y NO indexado, así que no costó migración de Dexie. */
  logo?: EntityLogo;
  /** Los logos de sus CENTROS DE COSTO, por `centerId`. Cuelgan del cliente porque un centro no es
   *  una fila guardada —es un slug que sale de los datasets—, y eso además los borra en cascada con
   *  él y los hace sobrevivir a recargar un año. Opcional y NO indexado: tampoco costó migración. */
  centerLogos?: CenterLogos;
}

/** El sujeto del módulo, lo que sus mensajes nombran cuando falta o choca un nombre. */
const SUBJECT = "cliente";

/** Tope del nombre. Un selector de header no puede rendir más, y nadie escribe tanto a propósito. */
export const MAX_CLIENT_NAME_LENGTH = MAX_ENTITY_NAME_LENGTH;

export type ClientNameCheck = EntityNameCheck;

export { matchesSearch, normalizeLabel } from "@/lib/workspaces";

/**
 * Recorta el nombre y lo rechaza si queda vacío o pasa del tope. NO comprueba duplicados: eso
 * necesita la lista y lo hace `isNameTaken`, que además puede nombrar al cliente que ya lo usa.
 */
export function normalizeClientName(raw: string): ClientNameCheck {
  return normalizeEntityName(raw, SUBJECT);
}

/**
 * El cliente que ya usa ese nombre, ignorando mayúsculas y acentos, o `undefined`. Devuelve el
 * cliente y no un booleano porque el rechazo tiene que poder nombrarlo (`ya existe «Manor»`).
 *
 * `exceptId` es lo que permite renombrar sin chocar consigo mismo.
 */
export function findClientByName(
  name: string,
  clients: readonly PygClient[],
  exceptId?: string,
): PygClient | undefined {
  return findByName(name, clients, exceptId);
}

export function isNameTaken(
  name: string,
  clients: readonly PygClient[],
  exceptId?: string,
): boolean {
  return isEntityNameTaken(name, clients, exceptId);
}

/**
 * Orden alfabético con acentos (`localeCompare` en español), que es el único orden de la lista:
 * no hay columna `order` ni reordenación a mano, así que renombrar reordena — que es justo lo que
 * el usuario espera al renombrar.
 */
export function sortClients<T extends { name: string }>(clients: readonly T[]): T[] {
  return sortByName(clients);
}

/**
 * El nombre que el diálogo de choque PROPONE para el cliente nuevo, a partir de la razón social
 * del archivo: recorta la forma jurídica y, si viene toda en mayúsculas, la pasa a capitular —
 * `ALPHA MUEBLES S.A.S.` → `Alpha Muebles`.
 *
 * Es una propuesta, no una regla: el diálogo la deja editar antes de crear, porque si no volvería
 * por la puerta de atrás el nombre-derivado-del-archivo que este diseño descartó a propósito. Por
 * eso también desempata contra los nombres que ya existen en vez de fallar.
 */
export function proposeClientName(companyName: string, existing: readonly PygClient[]): string {
  return proposeEntityName(companyName, existing, "Cliente");
}

/**
 * El cliente cuya identidad ADOPTADA coincide exactamente con la entrante, o `null`. Es lo que
 * alimenta la salida «Cargar en \<cliente\>» del diálogo de choque: si el archivo pertenece a otro
 * cliente que ya existe, destruir el abierto nunca es lo correcto.
 *
 * Un cliente vacío (identidad `null`) no puede coincidir: no tiene identidad todavía, la adopta en
 * su primera carga.
 */
export function findClientForIdentity(
  clients: readonly PygClient[],
  identities: Readonly<Record<string, WorkspaceIdentity | null | undefined>>,
  incoming: WorkspaceIdentity,
): PygClient | null {
  return (
    clients.find((client) => {
      const identity = identities[client.id];
      return identity != null && compareIdentity(identity, incoming).length === 0;
    }) ?? null
  );
}
