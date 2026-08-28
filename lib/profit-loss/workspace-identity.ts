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

import type { ComparisonCardData } from "@/lib/workspaces";
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

/**
 * One of the two cards the dialog compares — the generic shape from `@/lib/workspaces`, which
 * Ocupaciones uses the same way. Here `caption` is «CLIENTE ABIERTO»/«EL ARCHIVO», `name` the client's
 * label or the razón social, and `detail` the company (if it differs from `name`) and the accounting
 * system.
 *
 * It NEVER carries a NIT: no strategy extracts one, so promising it would be inventing it. What is
 * compared is company and system.
 */
export type IdentityCard = ComparisonCardData;

/** The secondary block of 6B: replacing the open client, with its reason and what it discards. */
export interface IdentityReplaceOption {
  label: string;
  heading: string;
  description: string;
}

export interface IdentityChangeConfirmation {
  /** `other-client` = 6A (another client already has this identity); `no-match` = 6B (none does). */
  form: "other-client" | "no-match";
  title: string;
  cards: { current: IdentityCard; incoming: IdentityCard };
  /** The verdict under the cards: which client this file belongs to. */
  verdict: string;
  /** The primary action, which is the right one in each case. */
  primaryLabel: string;
  /** What that action implies; only 6A, where the active client changes. */
  primaryHint?: string;
  /** Only 6B: replacing the open client, demoted to a secondary action. */
  replace?: IdentityReplaceOption;
}

export interface IdentityChangeContext {
  /** The open client's label — the user's, not the file's razón social. */
  activeClientName: string;
  /** The client that DOES have the incoming identity (6A), or `null` (6B). */
  matchingClientName: string | null;
  /** The proposed name for the new client; editable before creating it (6B). */
  proposedClientName: string;
  /** What the open client would lose, in words: «2024–2026, 3 centros de costo». */
  activeClientContents: string;
}

/** The mode stated as a change («pasó a llevarse …»), which is the only way it ever appears: the
 * cards compare company and system, not mode. */
const MODE_CHANGE_LABELS: Record<WorkspaceMode, string> = {
  single: "como un estado único",
  centers: "por centros de costo",
};

/**
 * The dialog an identity clash shows, in its TWO forms. Which one renders is not decided by this
 * module out of preference: it is decided by whether another client with exactly the incoming
 * identity exists, which is the only difference that changes which action is the right one.
 *
 * - **6A, `other-client`**: the file belongs to a client that already exists. The primary action is
 *   loading it there; nothing is destroyed, only the active client changes.
 * - **6B, `no-match`**: no client matches. The primary action is to CREATE one —the name is proposed
 *   from the razón social and the dialog allows editing it—, and replacing the open client drops to a
 *   secondary action, explaining in which case it makes sense (that it was renamed or that it changed
 *   system) and exactly what it discards.
 *
 * The systems are named with their strategy's `label` (`systemLabel`), never with their `id`.
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
 * The replacement block's first sentence: the ONLY case in which replacing is the right thing is that
 * the open client really is the same one and has changed. Each reason for the clash names that
 * change, and several at once are enumerated in a single sentence.
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
 * A comparison card. The company is only repeated when it differs from the bold name: in the file
 * they are the same thing, and in a client they almost never are —the user calls «Manor Galápagos»
 * what the file calls `DARWIN & WOLF…`—, so saying it twice or hiding it would be two different ways
 * of lying.
 */
function card(caption: string, name: string, identity: WorkspaceIdentity): IdentityCard {
  const parts = [
    ...(identity.companyName === name ? [] : [identity.companyName]),
    systemLabel(identity.system),
  ];
  return { caption, name, detail: parts.join(" · ") };
}
