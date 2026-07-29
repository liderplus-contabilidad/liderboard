/**
 * A workspace's identity: (sistema, empresa, año, modo). Generalizes the by-centers change's
 * "un año por workspace" rule and replaces the assembler's old "empresas distintas" notice,
 * which warned and loaded anyway — informing of the problem while committing it. Any file whose
 * identity contradicts the loaded workspace triggers ONE replace confirmation before anything is
 * written, naming everything that changes and what it discards (design.md decision 4). A batch
 * whose OWN files don't share identity with each other is rejected outright — see
 * `upload/batch.ts`'s `validateBatch`.
 *
 * The SYSTEM (the `id` of the strategy that read the file) joined the identity with MicroPlus:
 * `4.1.01.01.01` and `4.1.1.1.1` describe different charts of accounts, and merging two months
 * from different systems would fuse two trees into one meaningless table — with the company and
 * the year matching, which is perfectly possible for a client migrating systems, no other
 * validation would catch it.
 */

export type WorkspaceMode = "single" | "centers";

export interface WorkspaceIdentity {
  /** The originating strategy's `id` — see `upload/systems.ts`. */
  system: string;
  companyName: string;
  year: number;
  mode: WorkspaceMode;
}

export type IdentityMismatchReason = "system" | "company" | "year" | "mode";

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
  if (current.year !== incoming.year) {
    reasons.push("year");
  }
  if (current.companyName !== incoming.companyName) {
    reasons.push("company");
  }
  if (current.mode !== incoming.mode) {
    reasons.push("mode");
  }
  return reasons;
}

export interface IdentityChangeConfirmation {
  title: string;
  description: string;
}

const MODE_LABELS: Record<WorkspaceMode, string> = {
  single: "estado único",
  centers: "mensual por centros de costo",
};

/**
 * The confirmation a mismatch shows before replacing the workspace. A pure year change keeps
 * the exact wording the by-centers change already introduced; company and mode changes get
 * their own analogous wording, and several reasons at once are named together in one dialog.
 */
export function describeIdentityChange(
  current: WorkspaceIdentity,
  incoming: WorkspaceIdentity,
  reasons: readonly IdentityMismatchReason[],
): IdentityChangeConfirmation {
  if (reasons.length === 1 && reasons[0] === "year") {
    return {
      title: "Cambiar de año",
      description:
        `El workspace tiene ${current.year} cargado. Este archivo es de ${incoming.year}: ` +
        `cambiar de año descarta los datos, ajustes y comentarios de ${current.year}. ¿Continuar?`,
    };
  }
  if (reasons.length === 1 && reasons[0] === "company") {
    return {
      title: "Cambiar de empresa",
      description:
        `El workspace es de ${current.companyName}. Este archivo es de ${incoming.companyName}: ` +
        `cambiar de empresa descarta los datos, ajustes y comentarios de ${current.companyName}. ¿Continuar?`,
    };
  }
  if (reasons.length === 1 && reasons[0] === "mode") {
    return {
      title: "Cambiar de modo",
      description:
        `El workspace es de ${MODE_LABELS[current.mode]}. Este archivo es de ${MODE_LABELS[incoming.mode]}: ` +
        `cambiar de modo descarta los datos, ajustes y comentarios actuales. ¿Continuar?`,
    };
  }
  // The systems are named by their strategy id, which is not UI copy — so the wording says what
  // matters (they're different systems, their charts of accounts don't mix) without printing an
  // identifier the accountant has never seen.
  if (reasons.length === 1 && reasons[0] === "system") {
    return {
      title: "Cambiar de sistema contable",
      description:
        "El workspace se cargó con archivos de otro sistema contable. Sus planes de cuentas no " +
        "son compatibles, así que cambiar de sistema descarta los datos, ajustes y comentarios " +
        "actuales. ¿Continuar?",
    };
  }
  const parts: string[] = [];
  if (reasons.includes("system")) {
    parts.push("de sistema contable");
  }
  if (reasons.includes("company")) {
    parts.push(`de empresa (${current.companyName} → ${incoming.companyName})`);
  }
  if (reasons.includes("year")) {
    parts.push(`de año (${current.year} → ${incoming.year})`);
  }
  if (reasons.includes("mode")) {
    parts.push(`de modo (${MODE_LABELS[current.mode]} → ${MODE_LABELS[incoming.mode]})`);
  }
  return {
    title: "Reemplazar datos actuales",
    description:
      `Este archivo cambia ${parts.join(" y ")}: cambiar descarta los datos, ajustes y ` +
      `comentarios actuales. ¿Continuar?`,
  };
}
