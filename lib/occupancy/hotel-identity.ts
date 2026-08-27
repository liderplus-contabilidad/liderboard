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
 * One of the two cards the dialog compares — the generic shape from `@/lib/workspaces`, the same one
 * as PyG. Here `caption` is «HOTEL ABIERTO»/«LOS ARCHIVOS» and `detail` the declared name (if it
 * differs from `name`) plus what is inside.
 */
export type HotelIdentityCard = ComparisonCardData;

/** The secondary block of the `no-match` form: replace the open hotel, with its reason. */
export interface HotelReplaceOption {
  label: string;
  heading: string;
  description: string;
}

export interface HotelChangeConfirmation {
  /** `other-hotel` = another hotel already has this identity; `no-match` = none does. */
  form: "other-hotel" | "no-match";
  title: string;
  cards: { current: HotelIdentityCard; incoming: HotelIdentityCard };
  /** The verdict under the cards: which hotel these files belong to. */
  verdict: string;
  /** The primary action, which is the right one in each case. */
  primaryLabel: string;
  /** What that action implies; only for `other-hotel`, where the active hotel changes. */
  primaryHint?: string;
  /** Only for `no-match`: replacing the open hotel, demoted to a secondary action. */
  replace?: HotelReplaceOption;
}

export interface HotelChangeContext {
  /** The open hotel's label — the user's, not the one the file declares. */
  activeHotelName: string;
  /** The hotel that DOES have the incoming identity, or `null`. */
  matchingHotelName: string | null;
  /** The proposed name for the new hotel; editable before creating it. */
  proposedHotelName: string;
  /** What the open hotel would lose, in words: «2 sucursales, 2025–2026». */
  activeHotelContents: string;
  /** What the files bring, in words: «sucursal Centro, 2026». */
  incomingContents: string;
}

/**
 * The dialog an identity clash shows, in its TWO forms. Which one renders is not decided by this
 * module out of preference: it is decided by whether another hotel with exactly the incoming identity
 * exists, which is the only difference that changes which action is the right one.
 *
 * - **`other-hotel`**: the files belong to a hotel that already exists. The primary action is loading
 *   them there; nothing is destroyed, only the active hotel changes.
 * - **`no-match`**: no hotel matches. The primary action is to CREATE one —the name is proposed from
 *   the one the file declares and the dialog allows editing it—, and replacing the open hotel drops
 *   to a secondary action, explaining in which case it makes sense (that the hotel has been renamed)
 *   and exactly what it discards.
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
 * A comparison card. The declared name is only repeated when it differs from the bold line: in the
 * file they are the same thing, and in a hotel they almost never are —the user calls «Manor
 * Galápagos» what the file calls `CULTURA MANOR`—, so saying it twice or hiding it would be two
 * different ways of lying.
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
