/**
 * El CLIENTE de PyG: un nombre elegido por el usuario más exactamente un estado de resultados.
 * Esta capa es pura — el nombre y su validación, el orden de la lista, el buscador del selector y
 * la resolución de a qué cliente pertenece una identidad entrante. Quién guarda qué es `db.ts`.
 *
 * La distinción que sostiene todo el módulo: **la etiqueta NO es la identidad**. El usuario llama
 * «Manor Galápagos» a lo que el archivo llama `DARWIN & WOLF HOTELES Y TURISMO DARWOLF S.A.`, así
 * que el nombre nunca se compara contra un archivo. Lo que se compara es la identidad
 * `(sistema, empresa, modo)` que el cliente ADOPTÓ en su primera carga, y de eso se ocupa
 * `findClientForIdentity`.
 */
import { compareIdentity, type WorkspaceIdentity } from "./workspace-identity";

export interface PygClient {
  id: string;
  /** Etiqueta del usuario. No es la razón social del archivo, y nunca se compara con ella. */
  name: string;
}

/** Tope del nombre. Un selector de header no puede rendir más, y nadie escribe tanto a propósito. */
export const MAX_CLIENT_NAME_LENGTH = 60;

/**
 * La forma en que dos nombres se comparan: sin mayúsculas, sin acentos y sin espacios de sobra.
 * Es lo que hace que «manor» y «Manor» no sean dos clientes, y lo que usa el buscador para que
 * escribir «galapagos» encuentre «Galápagos».
 */
export function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export type ClientNameCheck = { ok: true; name: string } | { ok: false; message: string };

/**
 * Recorta el nombre y lo rechaza si queda vacío o pasa del tope. NO comprueba duplicados: eso
 * necesita la lista y lo hace `isNameTaken`, que además puede nombrar al cliente que ya lo usa.
 */
export function normalizeClientName(raw: string): ClientNameCheck {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0) {
    return { ok: false, message: "Escribe un nombre para el cliente." };
  }
  if (name.length > MAX_CLIENT_NAME_LENGTH) {
    return {
      ok: false,
      message: `El nombre no puede pasar de ${MAX_CLIENT_NAME_LENGTH} caracteres.`,
    };
  }
  return { ok: true, name };
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
  const key = normalizeLabel(name);
  return clients.find((client) => client.id !== exceptId && normalizeLabel(client.name) === key);
}

export function isNameTaken(
  name: string,
  clients: readonly PygClient[],
  exceptId?: string,
): boolean {
  return findClientByName(name, clients, exceptId) !== undefined;
}

/**
 * Orden alfabético con acentos (`localeCompare` en español), que es el único orden de la lista:
 * no hay columna `order` ni reordenación a mano, así que renombrar reordena — que es justo lo que
 * el usuario espera al renombrar.
 */
export function sortClients<T extends { name: string }>(clients: readonly T[]): T[] {
  return [...clients].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
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

/** Filtro del buscador del selector: ignora mayúsculas y acentos; el texto vacío no filtra nada. */
export function matchesSearch(name: string, query: string): boolean {
  const needle = normalizeLabel(query);
  return needle.length === 0 || normalizeLabel(name).includes(needle);
}

/**
 * Formas jurídicas que se recortan al proponer un nombre. Se comparan sin puntos ni mayúsculas,
 * palabra a palabra desde el final, así que «CIA. LTDA.» cae en dos pasadas.
 */
const LEGAL_FORMS = new Set([
  "SAS",
  "SA",
  "LTDA",
  "CIA",
  "COMPANIA",
  "EU",
  "CA",
  "SCA",
  "SRL",
  "INC",
  "LLC",
]);

/** Conectores que un título en español deja en minúscula. */
const LOWERCASE_WORDS = new Set(["y", "e", "o", "u", "de", "del", "la", "las", "los", "el", "en"]);

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
  const base = titleCase(stripLegalForm(companyName)) || "Cliente";
  if (!isNameTaken(base, existing)) {
    return base;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!isNameTaken(candidate, existing)) {
      return candidate;
    }
  }
}

function stripLegalForm(companyName: string): string {
  const words = companyName.trim().split(/\s+/).filter(Boolean);
  while (
    words.length > 1 &&
    LEGAL_FORMS.has(
      normalizeLabel(words[words.length - 1])
        .replace(/[.,]/g, "")
        .toUpperCase(),
    )
  ) {
    words.pop();
  }
  return words.join(" ");
}

/** Solo capitula lo que viene GRITADO; un nombre ya escrito en mixto se respeta tal cual. */
function titleCase(value: string): string {
  if (/[a-záéíóúñü]/.test(value)) {
    return value;
  }
  return value
    .toLowerCase()
    .split(" ")
    .map((word, index) =>
      index > 0 && LOWERCASE_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}
