"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  ClientNameDialog,
  DEFAULT_ENTITY_LABELS,
  type EntityLabels,
} from "@/components/dashboard/active-client";
import {
  checkCompanyProfile,
  companyDraftFrom,
  emptyCompanyDraft,
  type CompanyDraft,
  type CompanyField,
  type CompanyProfile,
} from "@/lib/company-profile";
import {
  checkCostCenter,
  costCenterDraftFrom,
  emptyCostCenterDraft,
  type CostCenter,
  type CostCenterDraft,
} from "@/lib/cost-center";
import { withCenterLogo } from "@/lib/logos";
import {
  findByName,
  normalizeEntityName,
  type CenterLogos,
  type CenterOption,
  type EntityLogo,
  type NamedEntity,
} from "@/lib/workspaces";

/**
 * A workspace as this dialog reads it: its name, its logo and —in the modules that have centers—
 * theirs plus the logos already uploaded for them. The last two are optional, which is what lets Rol
 * de Pagos use this hook without ever learning they exist.
 */
export type NameableEntity = NamedEntity & {
  centerLogos?: CenterLogos;
  centerOptions?: readonly CenterOption[];
  /** The company profile, in the modules that ask for it. Like the two above: whoever does not use
   *  it neither declares it nor learns it exists. */
  company?: CompanyProfile;
  /** The declared cost center, in the modules that ask for it. Same as the profile. */
  costCenter?: CostCenter;
};

export interface EntityNaming {
  openCreate: () => void;
  openRename: (id: string) => void;
  /** The modal, already mounted and controlled. The caller only has to render it. */
  dialog: ReactNode;
}

/**
 * The name dialog's state and validation, shared by the TWO places that create a workspace in each
 * module —the header's selector and the tab's empty state— and by both modules. Only one is on
 * screen at a time, but the rules of a name —trimmed, non-empty, ≤60, unique ignoring case and
 * accents— have to be the same everywhere, and the message has to be able to NAME whoever already
 * uses it: «Ya existe un hotel llamado «Manor»» is what separates a useful rejection from an
 * «invalid name».
 *
 * It is generic because the rules live in `@/lib/workspaces` and none of them knows whether the
 * subject is a client or a hotel; the only thing that changes is the words, and those arrive in
 * `labels`.
 */
export function useEntityNaming({
  entities,
  labels = DEFAULT_ENTITY_LABELS,
  onCreate,
  onRename,
  withCompany = false,
  withCostCenter = false,
  allowDuplicateNames = false,
}: {
  entities: readonly NameableEntity[];
  labels?: EntityLabels;
  onCreate: (
    name: string,
    logo?: EntityLogo,
    company?: CompanyProfile,
    costCenter?: CostCenter,
  ) => Promise<unknown>;
  onRename: (
    id: string,
    name: string,
    logo: EntityLogo | null,
    centerLogos: CenterLogos | undefined,
    company?: CompanyProfile,
    /** `null` is «this client no longer has a center»; `undefined`, «this module does not ask». */
    costCenter?: CostCenter | null,
  ) => Promise<unknown>;
  /**
   * Also asks for the letterhead's company data, and REQUIRES it to save. Off by default, which is
   * what leaves PyG's dialog and Ocupaciones' exactly as they were: they send no profile, receive
   * none and their form does not mention it.
   */
  withCompany?: boolean;
  /**
   * Also asks for the cost center —name and logo—, which unlike the profile is OPTIONAL to save:
   * emptying its name is how it gets removed. Off by default, which is what leaves PyG's dialog and
   * Ocupaciones' exactly as they were.
   */
  withCostCenter?: boolean;
  /**
   * Allows creating and renaming workspaces named the SAME as another. Off by default, which is the
   * long-standing rule and the one PyG and Ocupaciones follow: there the name is the only thing that
   * tells one client from another in the selector, and two identical rows make deleting or renaming
   * the wrong one unavoidable.
   *
   * Rol de Pagos switches it on at the firm's request: it keeps the payroll of several units of the
   * same company and calls them all by the company's name. The price —two rows that read alike— is
   * theirs and is accepted; what softens it is the cost center, which when declared travels in the
   * row's label.
   */
  allowDuplicateNames?: boolean;
}): EntityNaming {
  const [naming, setNaming] = useState<{ mode: "create" | "rename"; id?: string } | null>(null);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<EntityLogo | null>(null);
  const [centerLogos, setCenterLogos] = useState<CenterLogos | undefined>(undefined);
  const [company, setCompany] = useState<CompanyDraft>(emptyCompanyDraft);
  const [costCenter, setCostCenter] = useState<CostCenterDraft>(emptyCostCenterDraft);
  const [nameError, setNameError] = useState<string | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [costCenterError, setCostCenterError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openCreate = useCallback(() => {
    setName("");
    setLogo(null);
    // A new workspace is born empty, so it has no centers to give a logo to yet.
    setCenterLogos(undefined);
    setCompany(emptyCompanyDraft());
    setCostCenter(emptyCostCenterDraft());
    setNameError(null);
    setCompanyError(null);
    setCostCenterError(null);
    setNaming({ mode: "create" });
  }, []);

  const openRename = useCallback(
    (id: string) => {
      const entity = entities.find((candidate) => candidate.id === id);
      setName(entity?.name ?? "");
      // The stored logo is preloaded, so the dialog opens showing what is there: otherwise every
      // rename would look like it was removing it, and saving would remove it for real. The same
      // holds, multiplied by the number of centers, for theirs.
      setLogo(entity?.logo ?? null);
      setCenterLogos(entity?.centerLogos);
      // What is stored is preloaded for the same reason as the logo: otherwise every edit would look
      // like it was emptying the letterhead. An old client opens with the fields blank, which is
      // exactly what the «missing data» notice offers to fill in.
      setCompany(companyDraftFrom(entity?.company));
      setCostCenter(costCenterDraftFrom(entity?.costCenter));
      setNameError(null);
      setCompanyError(null);
      setCostCenterError(null);
      setNaming({ mode: "rename", id });
    },
    [entities],
  );

  const editing = naming?.id ? entities.find((entity) => entity.id === naming.id) : undefined;

  const submit = useCallback(async () => {
    if (!naming) {
      return;
    }
    const check = normalizeEntityName(name, labels.subject);
    if (!check.ok) {
      setNameError(check.message);
      return;
    }
    const taken = allowDuplicateNames ? undefined : findByName(check.name, entities, naming.id);
    if (taken) {
      setNameError(`Ya existe un ${labels.subject} llamado «${taken.name}».`);
      return;
    }
    // The profile is validated WHOLE here and not while typing: the button is already off if a
    // required field is missing, so the only thing that can fail at this point is the RUC.
    let profile: CompanyProfile | undefined;
    if (withCompany) {
      const companyCheck = checkCompanyProfile(company);
      if (!companyCheck.ok) {
        setCompanyError(companyCheck.message);
        return;
      }
      profile = companyCheck.profile;
    }
    // The center is validated here and not while typing for the same reason as the RUC: the only
    // thing that can fail —a logo with no name— is a state you pass through while filling the form,
    // and switching «Guardar» off in it would suggest something required is missing when the whole
    // center is optional.
    let center: CostCenter | undefined;
    if (withCostCenter) {
      const centerCheck = checkCostCenter(costCenter);
      if (!centerCheck.ok) {
        setCostCenterError(centerCheck.message);
        return;
      }
      center = centerCheck.center;
    }

    setBusy(true);
    try {
      if (naming.mode === "create") {
        await onCreate(check.name, logo ?? undefined, profile, center);
      } else if (naming.id) {
        // `null` when the module asks for it and the user left it empty: that is what ERASES the
        // stored center. Without `withCostCenter` it goes `undefined`, which is «do not touch it».
        await onRename(
          naming.id,
          check.name,
          logo,
          centerLogos,
          profile,
          withCostCenter ? (center ?? null) : undefined,
        );
      }
      setNaming(null);
    } finally {
      setBusy(false);
    }
  }, [
    naming,
    name,
    logo,
    centerLogos,
    company,
    withCompany,
    costCenter,
    withCostCenter,
    allowDuplicateNames,
    entities,
    labels.subject,
    onCreate,
    onRename,
  ]);

  const changeCompanyField = useCallback((field: CompanyField, value: string) => {
    setCompany((current) => ({ ...current, [field]: value }));
    setCompanyError(null);
  }, []);

  const changeCostCenter = useCallback((draft: CostCenterDraft) => {
    setCostCenter(draft);
    setCostCenterError(null);
  }, []);

  const dialog = (
    <ClientNameDialog
      open={naming !== null}
      mode={naming?.mode ?? "create"}
      value={name}
      logo={logo}
      {...(editing?.centerOptions ? { centers: editing.centerOptions } : {})}
      centerLogos={centerLogos}
      {...(withCompany ? { company, onCompanyChange: changeCompanyField } : {})}
      companyError={companyError}
      {...(withCostCenter ? { costCenter, onCostCenterChange: changeCostCenter } : {})}
      costCenterError={costCenterError}
      error={nameError}
      busy={busy}
      labels={labels}
      onChange={(next) => {
        setName(next);
        setNameError(null);
      }}
      onLogoChange={setLogo}
      onCenterLogoChange={(centerId, next) =>
        setCenterLogos((current) => withCenterLogo(current, centerId, next))
      }
      onSubmit={() => void submit()}
      onCancel={() => setNaming(null)}
    />
  );

  return { openCreate, openRename, dialog };
}
