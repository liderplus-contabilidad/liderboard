/**
 * The generic half of naming a WORKSPACE — the thing a module holds several of at once: PyG's
 * cliente, Ocupaciones' hotel. What lives here is everything that does not know what the subject
 * is: validating a name and its 60-char cap, uniqueness ignoring case and accents, alphabetical
 * order, the selector's search box and the name a clash dialog PROPOSES from a razón social.
 *
 * What deliberately stays in each module is its IDENTITY — in PyG `(sistema, empresa, modo)`, in
 * Ocupaciones the hotel name a file declares — because that is the one part that speaks about the
 * data, and no two modules identify a workspace the same way.
 *
 * The distinction that holds all of it: **the label is NOT the identity**. The user calls «Manor
 * Galápagos» what the file calls `DARWIN & WOLF HOTELES Y TURISMO DARWOLF S.A.`, so a name is
 * never compared against a file — only against other names.
 */
import type { CenterLogos, EntityLogo } from "@/lib/logos";

export type { CenterLogos, EntityLogo };

/** Name cap. A header selector cannot render more, and nobody types that much on purpose. */
export const MAX_ENTITY_NAME_LENGTH = 60;

/**
 * How two names compare: no case, no accents, no spare whitespace. It is what makes «manor» and
 * «Manor» one workspace and not two, and what the search box uses so typing «galapagos» finds
 * «Galápagos».
 */
export function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export type EntityNameCheck = { ok: true; name: string } | { ok: false; message: string };

/**
 * Trims the name and rejects it if it ends up empty or past the cap. It does NOT check duplicates:
 * that needs the list and is `isNameTaken`'s job, which can also name whoever already uses it.
 *
 * `subject` is the word the module calls its workspaces («cliente», «hotel»), so the rejection can
 * say what is missing a name instead of speaking in the abstract.
 */
export function normalizeEntityName(raw: string, subject?: string): EntityNameCheck {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0) {
    return { ok: false, message: `Escribe un nombre${subject ? ` para el ${subject}` : ""}.` };
  }
  if (name.length > MAX_ENTITY_NAME_LENGTH) {
    return {
      ok: false,
      message: `El nombre no puede pasar de ${MAX_ENTITY_NAME_LENGTH} caracteres.`,
    };
  }
  return { ok: true, name };
}

/**
 * The minimum a named workspace is: an id, the user's label for it and — optionally — the logo they
 * uploaded. The logo lives HERE, next to the name, because it is the other half of the same thing:
 * what the user calls this workspace and what it looks like. Neither is compared against a file.
 *
 * It is an optional, NON-INDEXED field on purpose: adding it costs no Dexie migration in any of the
 * three modules that keep a list of these.
 */
export interface NamedEntity {
  id: string;
  name: string;
  logo?: EntityLogo;
}

/**
 * Un CENTRO de un workspace, como lo lista una superficie que no dibuja sus cifras: el centro de
 * costo de PyG y la sucursal de Ocupaciones son la misma figura con dos nombres, y el diálogo que
 * les sube el logo es uno solo.
 *
 * Vive aquí por la misma razón que `NamedEntity`: no sabe de qué módulo habla. Lo que cada módulo
 * pone encima es cómo LLAMA a esto (`EntityLabels.centerPlural`), que es lo único que cambia.
 */
export interface CenterOption {
  /** El `centerId`: el id de la vista, y la clave con la que se guarda su logo. */
  id: string;
  name: string;
  /** El punto de color del selector, si el módulo le da uno. */
  color?: string;
}

/**
 * The entity already using that name, ignoring case and accents, or `undefined`. It returns the
 * entity and not a boolean because the rejection has to be able to name it («ya existe «Manor»»).
 *
 * `exceptId` is what lets a rename not clash with itself.
 */
export function findByName<T extends NamedEntity>(
  name: string,
  entities: readonly T[],
  exceptId?: string,
): T | undefined {
  const key = normalizeLabel(name);
  return entities.find((entity) => entity.id !== exceptId && normalizeLabel(entity.name) === key);
}

export function isNameTaken(
  name: string,
  entities: readonly NamedEntity[],
  exceptId?: string,
): boolean {
  return findByName(name, entities, exceptId) !== undefined;
}

/**
 * Alphabetical with accents (`localeCompare` in Spanish), which is the list's only order: there is
 * no `order` column and no manual reordering, so renaming reorders — which is exactly what the user
 * expects when renaming.
 */
export function sortByName<T extends { name: string }>(entities: readonly T[]): T[] {
  return [...entities].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

/** The selector's search filter: ignores case and accents; empty text filters nothing. */
export function matchesSearch(name: string, query: string): boolean {
  const needle = normalizeLabel(query);
  return needle.length === 0 || normalizeLabel(name).includes(needle);
}

/**
 * Una de las dos tarjetas que un diálogo de choque compara: lo que hay ABIERTO frente a lo que
 * traen los ARCHIVOS. La forma vive aquí porque la pregunta es la misma en los dos módulos —«¿esto
 * es lo mismo que ya tengo?»—; lo que cambia es la identidad que cada uno compara, y de eso se
 * ocupa el `describe…Change` de su módulo, que es quien redacta estos tres campos.
 *
 * El renderizado es `components/ui/comparison-card.tsx`. La forma está aquí y no allí porque `lib/`
 * no puede importar de `components/`, y es `lib/` quien la produce.
 */
export interface ComparisonCardData {
  /** El micro-rótulo: «CLIENTE ABIERTO», «LOS ARCHIVOS». */
  caption: string;
  /** La línea en negrita: la etiqueta del usuario, o el nombre que declara el archivo. */
  name: string;
  /** La línea secundaria: el nombre declarado (si difiere de `name`) y lo que hay dentro. */
  detail: string;
}

/**
 * Legal forms trimmed when proposing a name. They compare without dots or case, word by word from
 * the end, so «CIA. LTDA.» falls in two passes.
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

/** Connectors a Spanish title leaves lowercase. */
const LOWERCASE_WORDS = new Set(["y", "e", "o", "u", "de", "del", "la", "las", "los", "el", "en"]);

/**
 * The name a clash dialog PROPOSES for the new workspace, out of the name the file declares: it
 * trims the legal form and, if it arrives all-caps, title-cases it — `ALPHA MUEBLES S.A.S.` →
 * `Alpha Muebles`.
 *
 * It is a proposal, not a rule: the dialog leaves it editable before creating, because otherwise
 * the name-derived-from-the-file this design discarded on purpose would come back through the back
 * door. That is also why it disambiguates against the names that already exist instead of failing.
 *
 * `fallback` is what a name that trims down to nothing becomes — the subject the module speaks in
 * («Cliente», «Hotel»).
 */
export function proposeEntityName(
  declaredName: string,
  existing: readonly NamedEntity[],
  fallback: string,
): string {
  const base = titleCase(stripLegalForm(declaredName)) || fallback;
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

function stripLegalForm(declaredName: string): string {
  const words = declaredName.trim().split(/\s+/).filter(Boolean);
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

/** Only title-cases what arrives SHOUTED; a name already written in mixed case is left alone. */
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
