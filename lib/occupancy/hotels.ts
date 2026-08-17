/**
 * The HOTEL of Ocupaciones: a name the user chose plus what the workspace always held —
 * sucursales × years, with their Consolidado. Flat list, no nesting.
 *
 * This layer is pure and holds only what speaks about a hotel; the generic half of a name —
 * validation and its 60-char cap, uniqueness ignoring case and accents, alphabetical order, the
 * selector's search box and the proposed name — lives in `@/lib/workspaces` and is shared with
 * PyG's cliente. Who stores what is `db.ts`.
 *
 * The distinction that holds the module: **the label is NOT the identity**. The user calls «Manor
 * Galápagos» what the workbook declares as `CULTURA MANOR`, so the hotel's name is never compared
 * against a file. What is compared is the identity it ADOPTED on its first upload — see
 * `hotel-identity.ts` — and that is what `findHotelForIdentity` resolves.
 */
import {
  findByName,
  isNameTaken,
  normalizeEntityName,
  proposeEntityName,
  type CenterLogos,
  type EntityLogo,
} from "@/lib/workspaces";
import { sameHotelIdentity, type HotelIdentity } from "./hotel-identity";

export interface OccupancyHotel {
  id: string;
  /** The user's label. It is not the hotel name the workbook declares, and never compared to it. */
  name: string;
  /** The logo the user uploaded, if any — the other half of the label, and just as unrelated to
   *  what any file declares. Optional and NOT indexed, so it cost no Dexie migration. */
  logo?: EntityLogo;
  /** Los logos de sus SUCURSALES, por `centerId`. Cuelgan del hotel porque una sucursal no es una
   *  fila guardada —es la mitad de la clave `[hotelId+centerId+year]`—, y eso los borra en cascada
   *  con él y los hace sobrevivir a recargar un año. Opcional y NO indexado: sin migración. */
  centerLogos?: CenterLogos;
}

/** The subject this module names when a name is missing or clashes. */
const SUBJECT = "hotel";

/** Capitalized, because it is also the fallback label of a hotel with no usable declared name. */
const SUBJECT_LABEL = "Hotel";

export function normalizeHotelName(raw: string) {
  return normalizeEntityName(raw, SUBJECT);
}

export function findHotelByName(
  name: string,
  hotels: readonly OccupancyHotel[],
  exceptId?: string,
): OccupancyHotel | undefined {
  return findByName(name, hotels, exceptId);
}

export function isHotelNameTaken(
  name: string,
  hotels: readonly OccupancyHotel[],
  exceptId?: string,
): boolean {
  return isNameTaken(name, hotels, exceptId);
}

/**
 * The name the clash dialog PROPOSES for the new hotel, out of the one the workbook declares. It is
 * a proposal, not a rule: the dialog leaves it editable before creating, because otherwise the
 * name-derived-from-the-file this design discarded on purpose would come back through the back door.
 */
export function proposeHotelName(
  declaredName: string,
  existing: readonly OccupancyHotel[],
): string {
  return proposeEntityName(declaredName, existing, SUBJECT_LABEL);
}

/**
 * The hotel whose ADOPTED identity matches the incoming one, or `null`. It is what feeds the
 * «Cargar en \<hotel\>» exit of the clash dialog: if the file belongs to another hotel that already
 * exists, destroying the open one is never the right move.
 *
 * A hotel with no data (identity `null`) cannot match: it has no identity yet — it adopts one on
 * its first upload.
 */
export function findHotelForIdentity(
  hotels: readonly OccupancyHotel[],
  identities: Readonly<Record<string, HotelIdentity | null | undefined>>,
  incoming: HotelIdentity,
): OccupancyHotel | null {
  return (
    hotels.find((hotel) => {
      const identity = identities[hotel.id];
      return identity != null && sameHotelIdentity(identity, incoming);
    }) ?? null
  );
}
