/**
 * A company or a person, and how each one is labelled.
 *
 * The file brings 956 payers mixed together: insurers with their razón social and patients with their
 * given names and their two surnames. The app stores both IN FULL —a figure whose owner was not
 * stored stops being traceable against the report— and decides HERE, in the reading layer, which one
 * is named on screen. That it is a single function is what makes the rule impossible to skip in one
 * view: the card, its table twin and the report all go through it.
 *
 * **It is a heuristic and it is BIASED on purpose.** It classifies as a person by default and only
 * departs from that with POSITIVE evidence of a company, because the two errors do not cost the same:
 * an insurer taken for a patient comes out with no name —a poor label—, whereas a patient taken for
 * an insurer comes out with their name on the screen and on the paper, which is precisely what this
 * exists to prevent. If the list turns out to be insufficient, the way out is an explicit toggle and
 * not more heuristics (design.md, «Empresa contra persona se decide por FORMA»).
 */

/** Legal-form markers: nobody carries them on their ID card. */
const LEGAL_MARKS = [
  "sa",
  "s a",
  "ca",
  "c a",
  "cia",
  "compania",
  "ltda",
  "limitada",
  "sas",
  "srl",
  "corp",
  "inc",
];

/**
 * SECTOR words a person's name does not carry. It is the half that is needed because the real file's
 * insurers almost never write their legal form: `SALUDSA`, `BMI IGUALAS MEDICAS`, `MEDIECUADOR
 * HUMANA`, `PLAN VITAL`, `CONFIAMED`. They are compared as a SUBSTRING and not as a loose word on
 * purpose: `CONFIAMED` and `MEDIECUADOR` carry `med` stuck to something else, which is how the trade's
 * commercial names are built.
 */
const SECTOR_MARKS = [
  "seguro",
  "asegurad",
  "salud",
  "medic",
  "med ",
  "prepagad",
  "igualas",
  "hospital",
  "clinic",
  "sanitas",
  "fundacion",
  "cooperativa",
  "asociacion",
  "instituto",
  "banco",
  "empresa",
  "iess",
  "issfa",
  "isspol",
  "ministerio",
  "municipio",
  "plan ",
  "vital",
  "humana",
];

/** With no accents, in lower case and with inner whitespace collapsed. */
function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type PayerKind = "empresa" | "particular";

/**
 * The classification, in three steps and in this order:
 *
 *   1. A name of ONE single word is a company: a person always arrives with at least one surname and
 *      one given name. It is what recognises `SALUDSA` and `CONFIAMED` without listing them.
 *   2. A legal-form or sector marker is a company.
 *   3. Everything else is a person — the default case, which is the safe one.
 */
export function classifyPayer(name: string): PayerKind {
  const normalized = normalize(name);
  if (normalized === "") {
    // With no name there is nothing to protect and nothing to name; treating it as an individual is
    // what stops a blank row being labelled as though it were a company of the file.
    return "particular";
  }
  const words = normalized.split(" ");
  if (words.length === 1) {
    return "empresa";
  }
  // The legal-form marker is searched as a WORD (`sa` is inside «rosa»); the sector one, as a
  // substring, which is how the trade's commercial names are written.
  if (words.some((word) => LEGAL_MARKS.includes(word.replace(/\./g, "")))) {
    return "empresa";
  }
  // The trailing space of the normalized string lets `"plan "` and `"med "` match when the word closes
  // the name too.
  const haystack = `${normalized} `;
  if (SECTOR_MARKS.some((mark) => haystack.includes(mark))) {
    return "empresa";
  }
  return "particular";
}

/**
 * The on-screen label. A company goes with what the file brings; a person, with an ordinal that
 * identifies them WITHIN the reading without saying who they are — «Particular · 1» is the largest of
 * the period's individuals, and not a medical record number.
 *
 * The ordinal is set by whoever builds the list (`derive.ts`), because it is positional: it depends on
 * the period being read, and computing it here would require this function to see the whole list.
 */
export function payerLabel(name: string, kind: PayerKind, ordinal: number): string {
  return kind === "empresa" ? name.trim() : `Particular · ${ordinal}`;
}
