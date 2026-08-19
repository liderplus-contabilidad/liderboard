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
 * Un workspace tal como este diálogo lo lee: su nombre, su logo y —en los módulos que tienen
 * centros— los suyos y los logos que ya les subió. Los dos últimos son opcionales, que es lo que
 * deja a Rol de Pagos usando este hook sin enterarse de que existen.
 */
export type NameableEntity = NamedEntity & {
  centerLogos?: CenterLogos;
  centerOptions?: readonly CenterOption[];
  /** El perfil de empresa, en los módulos que lo piden. Como los dos de arriba: quien no lo use ni
   *  lo declara ni se entera de que existe. */
  company?: CompanyProfile;
  /** El centro de costo declarado, en los módulos que lo piden. Igual que el perfil. */
  costCenter?: CostCenter;
};

export interface EntityNaming {
  openCreate: () => void;
  openRename: (id: string) => void;
  /** El modal, ya montado y controlado. El llamador solo tiene que rendirlo. */
  dialog: ReactNode;
}

/**
 * El estado y la validación del diálogo de nombre, compartidos por los DOS sitios que crean un
 * workspace en cada módulo —el selector del header y el vacío de la pestaña— y por los dos módulos.
 * Solo uno está en pantalla a la vez, pero las reglas del nombre —recortado, no vacío, ≤60, único
 * ignorando mayúsculas y acentos— tienen que ser las mismas en todos, y el mensaje tiene que poder
 * NOMBRAR a quien ya lo usa: «Ya existe un hotel llamado «Manor»» es lo que distingue un rechazo
 * útil de un «nombre inválido».
 *
 * Es genérico porque las reglas viven en `@/lib/workspaces` y ninguna sabe si el sujeto es un
 * cliente o un hotel; lo único que cambia son las palabras, y esas llegan en `labels`.
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
    /** `null` es «este cliente ya no tiene centro»; `undefined`, «este módulo no los pide». */
    costCenter?: CostCenter | null,
  ) => Promise<unknown>;
  /**
   * Pide además los datos de la empresa del membrete, y los EXIGE para guardar. Apagado por
   * defecto, que es lo que deja el diálogo de PyG y el de Ocupaciones exactamente como estaban: no
   * envían perfil, no lo reciben y su formulario no lo menciona.
   */
  withCompany?: boolean;
  /**
   * Pide además el centro de costo —nombre y logo—, que a diferencia del perfil es OPCIONAL para
   * guardar: vaciar su nombre es cómo se quita. Apagado por defecto, que es lo que deja el diálogo
   * de PyG y el de Ocupaciones exactamente como estaban.
   */
  withCostCenter?: boolean;
  /**
   * Deja crear y renombrar workspaces que se llamen IGUAL que otro. Apagado por defecto, que es la
   * regla de siempre y la que siguen PyG y Ocupaciones: allí el nombre es lo único que distingue a
   * un cliente de otro en el selector, y dos filas idénticas hacen que borrar o renombrar la
   * equivocada deje de ser evitable.
   *
   * Rol de Pagos lo enciende a pedido de la firma: lleva la nómina de varias unidades de una misma
   * empresa y las llama a todas por el nombre de la empresa. El precio —dos filas que se leen
   * igual— es suyo y está aceptado; lo que lo amortigua es el centro de costo, que cuando se
   * declara viaja en el rótulo de la fila.
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
    // Un workspace nuevo nace vacío, así que no tiene centros a los que ponerle logo todavía.
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
      // El logo guardado se precarga, así que el diálogo abre mostrando lo que hay: si no, cada
      // renombrado parecería estar quitándolo, y guardar lo quitaría de verdad. Lo mismo vale, y
      // multiplicado por el número de centros, para los suyos.
      setLogo(entity?.logo ?? null);
      setCenterLogos(entity?.centerLogos);
      // Lo guardado se precarga por el mismo motivo que el logo: si no, cada edición parecería
      // estar vaciando el membrete. Un cliente antiguo abre con los campos en blanco, que es
      // exactamente lo que el aviso de «faltan los datos» ofrece completar.
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
    // El perfil se valida ENTERO aquí y no mientras se teclea: el botón ya está apagado si falta un
    // obligatorio, así que lo único que puede fallar en este punto es el RUC.
    let profile: CompanyProfile | undefined;
    if (withCompany) {
      const companyCheck = checkCompanyProfile(company);
      if (!companyCheck.ok) {
        setCompanyError(companyCheck.message);
        return;
      }
      profile = companyCheck.profile;
    }
    // El centro se valida aquí y no mientras se teclea por lo mismo que el RUC: lo único que puede
    // fallar —un logo sin nombre— es un estado por el que se pasa llenando el formulario, y apagar
    // «Guardar» en él haría creer que falta algo obligatorio cuando el centro entero es opcional.
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
        // `null` cuando el módulo lo pide y el usuario lo dejó vacío: es lo que BORRA el centro
        // guardado. Sin `withCostCenter` va `undefined`, que es «no lo toques».
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
