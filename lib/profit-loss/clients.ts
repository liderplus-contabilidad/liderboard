/**
 * PyG's CLIENT: a name chosen by the user plus exactly one estado de resultados. This layer is pure —
 * the name and its validation, the list's order, the selector's search box and the resolution of which
 * client an incoming identity belongs to. Who stores what is `db.ts`.
 *
 * The GENERIC half of all that lives in `@/lib/workspaces` and is shared with Ocupaciones, which holds
 * several hotels with the same name rules. What is left here is what speaks of PyG: the names the
 * module calls it by and the identity `(system, company, mode)`, which is the only part that knows
 * what the data is about.
 *
 * The distinction that holds the whole module up: **the label is NOT the identity**. The user calls
 * «Manor Galápagos» what the file calls `DARWIN & WOLF HOTELES Y TURISMO DARWOLF S.A.`, so the name is
 * never compared against a file. What is compared is the identity `(system, company, mode)` the client
 * ADOPTED on its first upload, and `findClientForIdentity` takes care of that.
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
  /** The user's label. It is not the file's razón social, and it is never compared with it. */
  name: string;
  /** The logo the user uploaded, if they uploaded one. The other half of the label: it does not come
   *  from any file either. An optional and NOT indexed field, so it cost no Dexie migration. */
  logo?: EntityLogo;
  /** Its COST CENTERS' logos, by `centerId`. They hang off the client because a center is not a stored
   *  row —it is a slug that comes out of the datasets—, and that also deletes them in cascade with it
   *  and makes them survive reloading a year. Optional and NOT indexed: it cost no migration either. */
  centerLogos?: CenterLogos;
}

/** The module's subject, what its messages name when a name is missing or clashes. */
const SUBJECT = "cliente";

/** The name's cap. A header selector cannot render more, and nobody writes that much on purpose. */
export const MAX_CLIENT_NAME_LENGTH = MAX_ENTITY_NAME_LENGTH;

export type ClientNameCheck = EntityNameCheck;

export { matchesSearch, normalizeLabel } from "@/lib/workspaces";

/**
 * Trims the name and rejects it if it is left empty or exceeds the cap. It does NOT check duplicates:
 * that needs the list and is done by `isNameTaken`, which can also name the client already using it.
 */
export function normalizeClientName(raw: string): ClientNameCheck {
  return normalizeEntityName(raw, SUBJECT);
}

/**
 * The client already using that name, ignoring case and accents, or `undefined`. It returns the client
 * and not a boolean because the rejection has to be able to name it (`«Manor» already exists`).
 *
 * `exceptId` is what allows renaming without clashing with itself.
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
 * Alphabetical order with accents (`localeCompare` in Spanish), which is the list's only order: there
 * is no `order` column and no manual reordering, so renaming reorders — which is exactly what the user
 * expects on renaming.
 */
export function sortClients<T extends { name: string }>(clients: readonly T[]): T[] {
  return sortByName(clients);
}

/**
 * The name the clash dialog PROPOSES for the new client, from the file's razón social: it trims the
 * legal form and, if it comes all in capitals, converts it to title case — `ALPHA MUEBLES S.A.S.` →
 * `Alpha Muebles`.
 *
 * It is a proposal, not a rule: the dialog allows editing it before creating, because otherwise the
 * name-derived-from-the-file this design deliberately discarded would come back through the back door.
 * That is also why it tie-breaks against the names that already exist instead of failing.
 */
export function proposeClientName(companyName: string, existing: readonly PygClient[]): string {
  return proposeEntityName(companyName, existing, "Cliente");
}

/**
 * The client whose ADOPTED identity matches the incoming one exactly, or `null`. It is what feeds the
 * «Cargar en \<cliente\>» exit of the clash dialog: if the file belongs to another client that already
 * exists, destroying the open one is never the right thing.
 *
 * An empty client (identity `null`) cannot match: it has no identity yet, it adopts one on its first
 * upload.
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
