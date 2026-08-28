/**
 * How a payer is LABELLED, and the only definition of it in the module.
 *
 * That it is a single function is what keeps a view from skipping the rule: the card, its table twin
 * and the printable report all go through here, so none of them can name a payer in its own way.
 *
 * **There used to be a heuristic and it is gone on purpose.** It classified each payer as a company or
 * a person by SHAPE —one single word, a legal-form marker (`SA`, `CIA`, `LTDA`), a sector word
 * (`salud`, `medic`, `seguro`)— and printed an ordinal instead of a person's name: «Particular · 1».
 * Measured against the real reports it did not get a single one wrong, and that was not what was
 * wrong with it. What was wrong is that a numbered stranger is a row nobody can act on: a receivable
 * you cannot name is one you cannot chase, and the reader had to trust a guess they could not see. A
 * rule that decides who gets named cannot be a guess at all — either it is declared or it does not
 * exist —, so what is left is the file's own word: whoever the report names is named, and whoever it
 * does not is grouped under ONE row that says exactly that.
 */

/**
 * The row every line with no declared payer falls into. There is ONE, not one per line: they are not
 * a payer each, they are the absence of one, and numbering them would invent the very identity that
 * is missing. It groups itself with no special case anywhere — `payerKey` reduces them all to the
 * same empty key — which is why nothing downstream has to know this exists.
 */
export const UNIDENTIFIED_PAYER = "Sin identificación";

/** The name the report brings, or the group for the ones it leaves blank. */
export function payerLabel(name: string): string {
  const trimmed = name.trim();
  return trimmed === "" ? UNIDENTIFIED_PAYER : trimmed;
}
