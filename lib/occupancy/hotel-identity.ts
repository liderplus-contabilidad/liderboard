/**
 * A hotel's identity: the hotel name its files DECLARE, normalized. Any file whose identity
 * contradicts the ACTIVE HOTEL's stops the upload and opens ONE confirmation before anything is
 * written — and, since Ocupaciones holds several hotels, that confirmation is no longer «reemplazar
 * o cancelar»: if ANOTHER hotel already has the incoming identity, the file belongs there and the
 * dialog offers to load it there instead of destroying anything.
 *
 * PyG's identity is `(sistema, empresa, modo)`. Here it is ONE field, and that is not an oversight:
 * there is a single parser, so no system can disagree, and the sucursal is data inside the hotel
 * rather than a mode of holding it. The workbook declares its hotel on its own line, right under
 * the title.
 *
 * The YEAR and the SUCURSAL are deliberately NOT here: a record is a hotel-sucursal-year, so a file
 * from another year or another sucursal is not a contradiction — it is more of the same hotel, and
 * it merges in without asking anything.
 */
import type { ComparisonCardData } from "@/lib/workspaces";
import { normalize } from "./slug";
import type { OccupancyDataset } from "./types";

export interface HotelIdentity {
  /** Verbatim as the files declare it — what the dialog shows. Comparison normalizes it. */
  hotelName: string;
}

/**
 * A hotel's identity, DERIVED from what it holds rather than stored. There is no field to keep in
 * sync, which is what makes «un hotel vacío no tiene identidad» free: no datasets, no identity, so
 * a first upload can never clash and simply ADOPTS whatever it brings — and deleting the last
 * sucursal-año returns the hotel to having none.
 */
export function deriveHotelIdentity(datasets: readonly OccupancyDataset[]): HotelIdentity | null {
  const named = datasets.find((dataset) => dataset.hotelName.trim().length > 0);
  if (!named) {
    return null;
  }
  return { hotelName: named.hotelName };
}

/**
 * Whether two identities are the same hotel. Normalized with the module's own `normalize`, the one
 * the provider already used to decide «this file is from another hotel»: it ignores case, accents
 * and spare whitespace, so `Hotel Ambato` and `HOTEL AMBATO` are one hotel and merge without
 * asking. Punctuation SEPARATES rather than vanishing (`Manor S.A.` → `manor s a`), which is what
 * keeps two hotels whose names differ only by a word from fusing.
 */
export function sameHotelIdentity(a: HotelIdentity, b: HotelIdentity): boolean {
  return normalize(a.hotelName) === normalize(b.hotelName);
}

/**
 * Una de las dos tarjetas que el diálogo compara — la forma genérica de `@/lib/workspaces`, la
 * misma que PyG. Aquí `caption` es «HOTEL ABIERTO»/«LOS ARCHIVOS» y `detail` el nombre declarado
 * (si difiere de `name`) más lo que hay dentro.
 */
export type HotelIdentityCard = ComparisonCardData;

/** El bloque secundario de la forma `no-match`: reemplazar el hotel abierto, con su motivo. */
export interface HotelReplaceOption {
  label: string;
  heading: string;
  description: string;
}

export interface HotelChangeConfirmation {
  /** `other-hotel` = otro hotel ya tiene esta identidad; `no-match` = ninguno. */
  form: "other-hotel" | "no-match";
  title: string;
  cards: { current: HotelIdentityCard; incoming: HotelIdentityCard };
  /** El veredicto bajo las tarjetas: a qué hotel pertenecen estos archivos. */
  verdict: string;
  /** La acción principal, que es la correcta en cada caso. */
  primaryLabel: string;
  /** Lo que esa acción implica; solo `other-hotel`, donde cambia el hotel activo. */
  primaryHint?: string;
  /** Solo `no-match`: reemplazar el hotel abierto, degradado a acción secundaria. */
  replace?: HotelReplaceOption;
}

export interface HotelChangeContext {
  /** La etiqueta del hotel abierto — la del usuario, no la que declara el archivo. */
  activeHotelName: string;
  /** El hotel que SÍ tiene la identidad entrante, o `null`. */
  matchingHotelName: string | null;
  /** El nombre propuesto para el hotel nuevo; editable antes de crear. */
  proposedHotelName: string;
  /** Lo que el hotel abierto perdería, en palabras: «2 sucursales, 2025–2026». */
  activeHotelContents: string;
  /** Lo que traen los archivos, en palabras: «sucursal Centro, 2026». */
  incomingContents: string;
}

/**
 * El diálogo que un choque de identidad muestra, en sus DOS formas. Cuál se rinde no lo decide este
 * módulo por gusto: lo decide si existe o no otro hotel con exactamente la identidad entrante, que
 * es la única diferencia que cambia cuál es la acción correcta.
 *
 * - **`other-hotel`**: los archivos pertenecen a un hotel que ya existe. La acción principal es
 *   cargarlos allí; nada se destruye, solo cambia el hotel activo.
 * - **`no-match`**: ningún hotel coincide. La acción principal es CREAR uno —el nombre se propone
 *   desde el que declara el archivo y el diálogo lo deja editar—, y reemplazar el hotel abierto baja
 *   a acción secundaria, explicando en qué caso tiene sentido (que el hotel se haya renombrado) y
 *   qué descarta exactamente.
 */
export function describeHotelChange(
  current: HotelIdentity,
  incoming: HotelIdentity,
  context: HotelChangeContext,
): HotelChangeConfirmation {
  const cards = {
    current: card("Hotel abierto", context.activeHotelName, current, context.activeHotelContents),
    incoming: card("Los archivos", incoming.hotelName, incoming, context.incomingContents),
  };
  const title = "Estos archivos no son del hotel abierto";

  if (context.matchingHotelName) {
    return {
      form: "other-hotel",
      title,
      cards,
      verdict: `Sí coinciden con un hotel que ya tienes: ${context.matchingHotelName} — es el mismo hotel que declaran los archivos.`,
      primaryLabel: `Cargar en ${context.matchingHotelName}`,
      primaryHint: `Cargar allí cambia el hotel activo a ${context.matchingHotelName}. ${context.activeHotelName} queda intacto.`,
    };
  }

  return {
    form: "no-match",
    title,
    cards,
    verdict:
      "Ningún hotel tuyo coincide con estos archivos. Lo recomendable es crear el hotel " +
      `«${context.proposedHotelName}» y cargarlos allí.`,
    primaryLabel: "Crear hotel y cargar",
    replace: {
      label: "Reemplazar este hotel",
      heading: "O reemplazar solo este hotel",
      description:
        `Si ${context.activeHotelName} pasó a llamarse ${incoming.hotelName}, puedes reemplazar ` +
        `sus datos. Se descartan sus sucursales y años (${context.activeHotelContents}) y todo lo ` +
        "que hayas escrito a mano en ellos. Los demás hoteles no se tocan.",
    },
  };
}

/**
 * Una tarjeta comparativa. El nombre declarado solo se repite cuando difiere de la línea en negrita:
 * en el archivo son la misma cosa, y en un hotel casi nunca lo son —el usuario llama «Manor
 * Galápagos» a lo que el archivo llama `CULTURA MANOR`—, así que decirlo dos veces o esconderlo
 * serían dos formas distintas de mentir.
 */
function card(
  caption: string,
  name: string,
  identity: HotelIdentity,
  contents: string,
): HotelIdentityCard {
  const parts = [...(identity.hotelName === name ? [] : [identity.hotelName]), contents];
  return { caption, name, detail: parts.filter(Boolean).join(" · ") };
}
