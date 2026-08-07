"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  ClientNameDialog,
  DEFAULT_ENTITY_LABELS,
  type EntityLabels,
} from "@/components/dashboard/active-client";
import {
  findByName,
  normalizeEntityName,
  type EntityLogo,
  type NamedEntity,
} from "@/lib/workspaces";

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
}: {
  entities: readonly NamedEntity[];
  labels?: EntityLabels;
  onCreate: (name: string, logo?: EntityLogo) => Promise<unknown>;
  onRename: (id: string, name: string, logo: EntityLogo | null) => Promise<unknown>;
}): EntityNaming {
  const [naming, setNaming] = useState<{ mode: "create" | "rename"; id?: string } | null>(null);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<EntityLogo | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openCreate = useCallback(() => {
    setName("");
    setLogo(null);
    setNameError(null);
    setNaming({ mode: "create" });
  }, []);

  const openRename = useCallback(
    (id: string) => {
      const entity = entities.find((candidate) => candidate.id === id);
      setName(entity?.name ?? "");
      // El logo guardado se precarga, así que el diálogo abre mostrando lo que hay: si no, cada
      // renombrado parecería estar quitándolo, y guardar lo quitaría de verdad.
      setLogo(entity?.logo ?? null);
      setNameError(null);
      setNaming({ mode: "rename", id });
    },
    [entities],
  );

  const submit = useCallback(async () => {
    if (!naming) {
      return;
    }
    const check = normalizeEntityName(name, labels.subject);
    if (!check.ok) {
      setNameError(check.message);
      return;
    }
    const taken = findByName(check.name, entities, naming.id);
    if (taken) {
      setNameError(`Ya existe un ${labels.subject} llamado «${taken.name}».`);
      return;
    }
    setBusy(true);
    try {
      if (naming.mode === "create") {
        await onCreate(check.name, logo ?? undefined);
      } else if (naming.id) {
        await onRename(naming.id, check.name, logo);
      }
      setNaming(null);
    } finally {
      setBusy(false);
    }
  }, [naming, name, logo, entities, labels.subject, onCreate, onRename]);

  const dialog = (
    <ClientNameDialog
      open={naming !== null}
      mode={naming?.mode ?? "create"}
      value={name}
      logo={logo}
      error={nameError}
      busy={busy}
      labels={labels}
      onChange={(next) => {
        setName(next);
        setNameError(null);
      }}
      onLogoChange={setLogo}
      onSubmit={() => void submit()}
      onCancel={() => setNaming(null)}
    />
  );

  return { openCreate, openRename, dialog };
}
