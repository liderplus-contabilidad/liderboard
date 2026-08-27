/**
 * Which COMPANY a client's sales belong to: the razón social its files declare.
 *
 * It is DERIVED and not stored —the same decision as `deriveHotelIdentity` in Ocupaciones and
 * `deriveWorkspaceIdentity` in PyG—, and that is what makes the rule that matters free: **a client
 * with no sales loaded has no identity**, so the first upload ADOPTS it and cannot clash with
 * anything. Deleting the last month returns the client to having none.
 *
 * It is ONE single field, unlike PyG, and for the same reason as in Ocupaciones: there is a single
 * parser, so there is no system to disagree with, and here there is no «mode» of storing.
 *
 * **The CLIENT's name never enters this comparison.** The user calls «Clínica Durán» what the file
 * calls `HOSPITAL GENERAL PRIVADO DURAN S.A.`; comparing the label against the razón social would
 * reject legitimate uploads, which is the rule PyG and Ocupaciones already hold.
 */
import type { ParsedSalesMonth, SalesMonth } from "./types";

export interface SalesIdentity {
  /** Verbatim, exactly as the file declares it — it is what the notice shows. */
  companyName: string;
}

/** With no accents, in lower case, and with punctuation turned into a SEPARATOR instead of
 *  disappearing: `DURAN S.A.` → `duran s a`, which is what stops two companies that differ only by a
 *  word from being fused. */
function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The identity of what the client ALREADY has, or `null` if it has nothing. */
export function deriveSalesIdentity(months: readonly SalesMonth[]): SalesIdentity | null {
  const named = months.find((month) => month.companyName.trim() !== "");
  return named ? { companyName: named.companyName } : null;
}

/** The identity of what is arriving. `null` if no file of the batch declares a company. */
export function incomingSalesIdentity(parsed: readonly ParsedSalesMonth[]): SalesIdentity | null {
  const named = parsed.find((month) => month.companyName.trim() !== "");
  return named ? { companyName: named.companyName } : null;
}

export function sameSalesIdentity(a: SalesIdentity, b: SalesIdentity): boolean {
  return normalize(a.companyName) === normalize(b.companyName);
}

/**
 * The notice, when what arrives contradicts what the client already has. It is a NOTICE and not a
 * block: the company may have been renamed, and the app cannot know — what it cannot do is write
 * another company's billing over it without saying so.
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
 * Closes the sentence without doubling the full stop. Half the country's razón sociales end in an
 * abbreviated legal form —`S.A.`, `CIA. LTDA.`— and adding the sentence's full stop leaves an `S.A..`
 * that reads as a typo of the app over the client's name.
 */
function sentenceEnd(name: string): string {
  const trimmed = name.trim();
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}
