/**
 * A WORKSPACE'S COST CENTER — a name more specific than the client's, with its own logo, for the
 * paper that center issues.
 *
 * It lives in `lib/` and not inside a module for the same reason as `lib/company-profile.ts`: what
 * CAPTURES it is the header's shared dialog (`ClientNameDialog`, from `components/dashboard/`), and a
 * dashboard component importing from Rol de Pagos would invert the dependency. It is the
 * neighbourhood of `lib/workspaces.ts` and `lib/logos.ts` — the generic rules of a workspace's
 * identity, which each module decides whether to use. Today only Rol de Pagos wires it.
 *
 * **It is NOT PyG's or Ocupaciones' structure of centers**, and that difference is what justifies a
 * file apart from `CenterLogos`. There a center is a row that comes out of the data —a slug of the
 * datasets, half of a key— and there can be many, so their logos are stored by `centerId` in a
 * registry. Here the center is ONE, optional, and the user declares it when creating the client:
 * there is no list to walk, nothing to derive it from and no hierarchy to maintain.
 *
 * **The rule that holds the file up is `costCenterHeading`**: it returns the ALREADY composed label
 * that heads the client's papers. The three surfaces that print it —the payslip in PDF, the rol's
 * `GENERAL` sheet and the Sueldos por Áreas report— receive that string and write it; none of them
 * knows the two halves are joined with a middle dot. The real failure mode of this is not the label
 * coming out wrong: it is it coming out in TWO ways —with a `·` in the PDF and with a hyphen in the
 * Excel— without any figure giving it away. It is the same argument as `letterheadLines`.
 */
import { normalizeEntityName, type EntityLogo } from "@/lib/workspaces";

/**
 * The STORED center: its name and —if the user uploaded one— its logo. The name is not optional
 * because a center with no name cannot be identified on any screen; what is optional is the WHOLE
 * CENTER, which is what the `?` of whoever declares it says.
 */
export interface CostCenter {
  name: string;
  logo?: EntityLogo;
}

/** What the dialog holds while typing: the name always present, the logo or not. */
export interface CostCenterDraft {
  name: string;
  logo: EntityLogo | null;
}

/** The draft of a client that has not declared a center yet. */
export function emptyCostCenterDraft(): CostCenterDraft {
  return { name: "", logo: null };
}

/**
 * The draft preloaded with what is stored. With no center it gives the empty draft, for the same
 * reason as the company profile: the dialog opens showing what is there, and if an absent center gave
 * anything else, renaming an old client would look like it was erasing data it never had.
 */
export function costCenterDraftFrom(center: CostCenter | null | undefined): CostCenterDraft {
  if (!center) {
    return emptyCostCenterDraft();
  }
  return { name: center.name, logo: center.logo ?? null };
}

export type CostCenterCheck =
  | { ok: true; center: CostCenter | undefined }
  | { ok: false; message: string };

/**
 * Validates the draft and returns the center to be stored, `undefined` if the user declared none, or
 * the reason for the rejection.
 *
 * The two rules that can be wrong:
 *
 * - **Completely empty is legitimate** and gives `undefined`, not a center with a blank name: the
 *   center is optional, and a stored `{ name: "" }` would turn «this client has no center» into two
 *   different questions — the same reason `withCenterLogo` discards the empty registry.
 * - **A logo with no name is REJECTED.** A logo is an image with no label: it cannot be named in the
 *   selector, nor in the dialog, nor in the heading this file composes, so storing it would leave an
 *   identity no screen can say out loud. The name is asked for instead of silently discarding the
 *   logo, which is what would make a file the user uploaded disappear.
 *
 * The name goes through `normalizeEntityName`, the same trimming and the same 60-character cap as the
 * workspace's: they are labels of the same paper and two different caps could not be justified
 * separately.
 */
export function checkCostCenter(draft: CostCenterDraft): CostCenterCheck {
  const raw = draft.name.trim();
  if (raw.length === 0) {
    if (draft.logo) {
      return { ok: false, message: "Ponle nombre al centro de costo o quita su logo." };
    }
    return { ok: true, center: undefined };
  }

  const check = normalizeEntityName(raw, "centro de costo");
  if (!check.ok) {
    return { ok: false, message: check.message };
  }

  return {
    ok: true,
    center: { name: check.name, ...(draft.logo ? { logo: draft.logo } : {}) },
  };
}

/** What separates the workspace's name from its center's. The same middle dot with which
 *  `letterheadLines` separates the razón social from the RUC: one single dialect across all three
 *  papers. */
const HEADING_SEPARATOR = " · ";

/**
 * THE LABEL THAT HEADS THE PAPER, the only definition there is. With no center it is the workspace's
 * name as it is, which is what leaves every client that declares none untouched.
 */
export function costCenterHeading(name: string, center: CostCenter | null | undefined): string {
  if (!center || center.name.trim().length === 0) {
    return name;
  }
  return `${name}${HEADING_SEPARATOR}${center.name}`;
}

/**
 * The logo that goes on the LEFT of the letterhead and the one that goes on the RIGHT, resolved once
 * for the three surfaces that print them.
 *
 * The rule, written here and nowhere else: **the CLIENT's heads on the left and its CENTER's goes on
 * the right** — the same layout with which PyG and Ocupaciones stamp their sheets, where the
 * workspace's logo opens and that sheet's center closes. With no center, or with a center that
 * uploaded no logo, there is no second logo and the client's stays where it always was.
 *
 * That this function exists instead of an `if` on each surface is what matters: asking «and what if
 * this client has no center?» in the PDF, in the Excel and in the report is exactly how two of the
 * three end up answering differently.
 */
export function letterheadLogos(
  clientLogo: EntityLogo | null | undefined,
  center: CostCenter | null | undefined,
): { left: EntityLogo | undefined; right: EntityLogo | undefined } {
  return { left: clientLogo ?? undefined, right: center?.logo ?? undefined };
}
