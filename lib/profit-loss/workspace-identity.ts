/**
 * A workspace's identity: (sistema, empresa, modo). Any file whose identity contradicts the
 * ACTIVE CLIENT's triggers ONE confirmation before anything is written, naming everything that
 * changes and what it discards — and, since PyG holds several clients, that confirmation is no
 * longer «reemplazar o cancelar»: if ANOTHER client already has the incoming identity, the file
 * belongs there and the dialog offers to load it there instead of destroying anything. A batch
 * whose OWN files don't share identity with each other is rejected outright — see
 * `upload/batch.ts`'s `validateBatch`.
 *
 * The SYSTEM (the `id` of the strategy that read the file) joined the identity with MicroPlus:
 * `4.1.01.01.01` and `4.1.1.1.1` describe different charts of accounts, and merging two months
 * from different systems would fuse two trees into one meaningless table — with the company
 * matching, which is perfectly possible for a client migrating systems, no other validation
 * would catch it.
 *
 * The YEAR is deliberately NOT here. It was, back when a `PygDataset` held one `number[12]` and
 * a second year had nowhere to go; now a dataset is a center-YEAR (`pyg-multi-year`), so a file
 * from another year is not a contradiction — it is more of the same workspace, and it merges in
 * without asking anything.
 */

import { LEGACY_SYSTEM, systemLabel } from "./upload/systems";
import type { PygDataset, WorkspaceMeta } from "./types";

export type WorkspaceMode = "single" | "centers";

export interface WorkspaceIdentity {
  /** The originating strategy's `id` — see `upload/systems.ts`. */
  system: string;
  companyName: string;
  mode: WorkspaceMode;
}

/**
 * A client's identity, DERIVED from what it holds rather than stored: the system and company come
 * off its `meta`, the mode off whether its datasets are centers or a lone statement. There is no
 * field to keep in sync, which is what makes «un cliente vacío no tiene identidad» free — no
 * datasets, no identity, so a first upload can never clash and simply ADOPTS whatever it brings.
 */
export function deriveWorkspaceIdentity(
  datasets: readonly PygDataset[],
  meta: Pick<WorkspaceMeta, "companyName" | "sourceSystemId"> | undefined,
): WorkspaceIdentity | null {
  if (datasets.length === 0) {
    return null;
  }
  return {
    system: meta?.sourceSystemId || LEGACY_SYSTEM,
    companyName: meta?.companyName || datasets[0].companyName,
    mode: datasets.some((d) => d.role === "center" || d.role === "sin-centro")
      ? "centers"
      : "single",
  };
}

export type IdentityMismatchReason = "system" | "company" | "mode";

/** Every way `incoming` disagrees with `current`; `[]` means they share identity and the file
 * merges in without any confirmation. */
export function compareIdentity(
  current: WorkspaceIdentity,
  incoming: WorkspaceIdentity,
): IdentityMismatchReason[] {
  const reasons: IdentityMismatchReason[] = [];
  if (current.system !== incoming.system) {
    reasons.push("system");
  }
  if (current.companyName !== incoming.companyName) {
    reasons.push("company");
  }
  if (current.mode !== incoming.mode) {
    reasons.push("mode");
  }
  return reasons;
}

/** Una de las dos tarjetas que el diálogo compara. NUNCA lleva un NIT: ninguna estrategia lo
 * extrae, así que prometerlo sería inventarlo. Lo que se compara es empresa y sistema. */
export interface IdentityCard {
  /** «CLIENTE ABIERTO» / «EL ARCHIVO». */
  caption: string;
  /** La línea en negrita: la etiqueta del cliente, o la razón social del archivo. */
  name: string;
  /** La línea secundaria: la empresa (si difiere de `name`) y el sistema contable. */
  detail: string;
}

/** El bloque secundario de 6B: reemplazar el cliente abierto, con su motivo y lo que descarta. */
export interface IdentityReplaceOption {
  label: string;
  heading: string;
  description: string;
}

export interface IdentityChangeConfirmation {
  /** `other-client` = 6A (otro cliente ya tiene esta identidad); `no-match` = 6B (ninguno). */
  form: "other-client" | "no-match";
  title: string;
  cards: { current: IdentityCard; incoming: IdentityCard };
  /** El veredicto bajo las tarjetas: a qué cliente pertenece este archivo. */
  verdict: string;
  /** La acción principal, que es la correcta en cada caso. */
  primaryLabel: string;
  /** Lo que esa acción implica; solo 6A, donde cambia el cliente activo. */
  primaryHint?: string;
  /** Solo 6B: reemplazar el cliente abierto, degradado a acción secundaria. */
  replace?: IdentityReplaceOption;
}

export interface IdentityChangeContext {
  /** La etiqueta del cliente abierto — la del usuario, no la razón social del archivo. */
  activeClientName: string;
  /** El cliente que SÍ tiene la identidad entrante (6A), o `null` (6B). */
  matchingClientName: string | null;
  /** El nombre propuesto para el cliente nuevo; editable antes de crear (6B). */
  proposedClientName: string;
  /** Lo que el cliente abierto perdería, en palabras: «2024–2026, 3 centros de costo». */
  activeClientContents: string;
}

/** El modo dicho como un cambio («pasó a llevarse …»), que es la única forma en que aparece:
 * las tarjetas comparan empresa y sistema, no modo. */
const MODE_CHANGE_LABELS: Record<WorkspaceMode, string> = {
  single: "como un estado único",
  centers: "por centros de costo",
};

/**
 * El diálogo que un choque de identidad muestra, en sus DOS formas. Cuál se rinde no lo decide
 * este módulo por gusto: lo decide si existe o no otro cliente con exactamente la identidad
 * entrante, que es la única diferencia que cambia cuál es la acción correcta.
 *
 * - **6A, `other-client`**: el archivo pertenece a un cliente que ya existe. La acción principal
 *   es cargarlo allí; nada se destruye, solo cambia el cliente activo.
 * - **6B, `no-match`**: ningún cliente coincide. La acción principal es CREAR uno —el nombre se
 *   propone desde la razón social y el diálogo lo deja editar—, y reemplazar el cliente abierto
 *   baja a acción secundaria, explicando en qué caso tiene sentido (que se haya renombrado o haya
 *   cambiado de sistema) y qué descarta exactamente.
 *
 * Los sistemas se nombran con la `label` de su estrategia (`systemLabel`), nunca con su `id`.
 */
export function describeIdentityChange(
  current: WorkspaceIdentity,
  incoming: WorkspaceIdentity,
  reasons: readonly IdentityMismatchReason[],
  context: IdentityChangeContext,
): IdentityChangeConfirmation {
  const cards = {
    current: card("Cliente abierto", context.activeClientName, current),
    incoming: card("El archivo", incoming.companyName, incoming),
  };
  const title = "Este archivo no es del cliente abierto";

  if (context.matchingClientName) {
    return {
      form: "other-client",
      title,
      cards,
      verdict:
        `Sí coincide con un cliente que ya tienes: ${context.matchingClientName} — misma empresa ` +
        "y mismo sistema contable.",
      primaryLabel: `Cargar en ${context.matchingClientName}`,
      primaryHint:
        `Cargar allí cambia el cliente activo a ${context.matchingClientName}. ` +
        `${context.activeClientName} queda intacto.`,
    };
  }

  return {
    form: "no-match",
    title,
    cards,
    verdict:
      "Ningún cliente tuyo coincide con este archivo. Lo recomendable es crear el cliente " +
      `«${context.proposedClientName}» y cargarlo allí.`,
    primaryLabel: "Crear cliente y cargar",
    replace: {
      label: "Reemplazar este cliente",
      heading: "O reemplazar solo este cliente",
      description:
        `${replacePremise(current, incoming, reasons, context.activeClientName)} ` +
        `Se descartan el estado de resultados actual (${context.activeClientContents}) y los ` +
        "ajustes de este cliente; los comentarios se conservan solo en las cuentas que existan " +
        "en el archivo nuevo. Los demás clientes no se tocan.",
    },
  };
}

/**
 * La primera frase del bloque de reemplazo: el ÚNICO caso en que reemplazar es lo correcto es que
 * el cliente abierto sea de verdad el mismo y haya cambiado. Cada motivo del choque nombra ese
 * cambio, y varios a la vez se enumeran en una sola frase.
 */
function replacePremise(
  current: WorkspaceIdentity,
  incoming: WorkspaceIdentity,
  reasons: readonly IdentityMismatchReason[],
  activeClientName: string,
): string {
  const changes: string[] = [];
  if (reasons.includes("company")) {
    changes.push(`pasó a llamarse ${incoming.companyName}`);
  }
  if (reasons.includes("system")) {
    changes.push("cambió de sistema contable");
  }
  if (reasons.includes("mode")) {
    changes.push(`pasó a llevarse ${MODE_CHANGE_LABELS[incoming.mode]}`);
  }
  if (changes.length === 0) {
    return `Si ${activeClientName} es de verdad este archivo, puedes reemplazar sus datos.`;
  }
  return `Si ${activeClientName} ${changes.join(" o ")}, puedes reemplazar sus datos.`;
}

/**
 * Una tarjeta comparativa. La empresa solo se repite cuando difiere del nombre en negrita: en el
 * archivo son la misma cosa, y en un cliente casi nunca lo son —el usuario llama «Manor Galápagos»
 * a lo que el archivo llama `DARWIN & WOLF…`—, así que decirlo dos veces o esconderlo serían dos
 * formas distintas de mentir.
 */
function card(caption: string, name: string, identity: WorkspaceIdentity): IdentityCard {
  const parts = [
    ...(identity.companyName === name ? [] : [identity.companyName]),
    systemLabel(identity.system),
  ];
  return { caption, name, detail: parts.join(" · ") };
}
