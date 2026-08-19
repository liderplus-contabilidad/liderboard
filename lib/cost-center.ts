/**
 * EL CENTRO DE COSTO DE UN WORKSPACE — un nombre más específico que el del cliente, con su propio
 * logo, para el papel que ese centro emite.
 *
 * Vive en `lib/` y no dentro de un módulo por la misma razón que `lib/company-profile.ts`: quien lo
 * CAPTURA es el diálogo compartido del header (`ClientNameDialog`, de `components/dashboard/`), y un
 * componente del dashboard que importara de Rol de Pagos invertiría la dependencia. Es la vecindad
 * de `lib/workspaces.ts` y `lib/logos.ts` — las reglas genéricas de la identidad de un workspace,
 * que cada módulo decide si usa. Hoy solo lo cablea Rol de Pagos.
 *
 * **NO es la estructura de centros de PyG ni de Ocupaciones**, y esa diferencia es lo que justifica
 * un archivo aparte de `CenterLogos`. Allí un centro es una fila que sale de los datos —un slug de
 * los datasets, la mitad de una clave— y puede haber muchos, así que sus logos se guardan por
 * `centerId` en un registro. Aquí el centro es UNO, opcional, y lo declara el usuario al crear el
 * cliente: no hay lista que recorrer, ni nada de dónde derivarlo, ni jerarquía que mantener.
 *
 * **La regla que sostiene el archivo es `costCenterHeading`**: devuelve el rótulo YA compuesto que
 * encabeza los papeles del cliente. Las tres superficies que lo imprimen —el comprobante en PDF, la
 * hoja `GENERAL` del rol y el informe de Sueldos por Áreas— reciben esa cadena y la escriben;
 * ninguna sabe que las dos mitades se unen con un punto medio. El modo de fallo real de esto no es
 * que el rótulo salga mal: es que salga de DOS maneras —con `·` en el PDF y con guion en el Excel—
 * sin que ninguna cifra lo delate. Es el mismo argumento de `letterheadLines`.
 */
import { normalizeEntityName, type EntityLogo } from "@/lib/workspaces";

/**
 * El centro GUARDADO: su nombre y —si el usuario subió uno— su logo. El nombre no es opcional
 * porque un centro sin nombre no se puede identificar en ninguna pantalla; lo opcional es el CENTRO
 * ENTERO, que es lo que dice el `?` de quien lo declara.
 */
export interface CostCenter {
  name: string;
  logo?: EntityLogo;
}

/** Lo que el diálogo tiene en la mano mientras se teclea: el nombre siempre presente, el logo o no. */
export interface CostCenterDraft {
  name: string;
  logo: EntityLogo | null;
}

/** El borrador de un cliente que todavía no declaró centro. */
export function emptyCostCenterDraft(): CostCenterDraft {
  return { name: "", logo: null };
}

/**
 * El borrador precargado con lo guardado. Sin centro da el borrador vacío, por lo mismo que el
 * perfil de empresa: el diálogo abre mostrando lo que hay, y si un centro ausente diera otra cosa,
 * renombrar un cliente antiguo parecería estar borrándole datos que nunca tuvo.
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
 * Valida el borrador y devuelve el centro que se guarda, `undefined` si el usuario no declaró
 * ninguno, o el motivo del rechazo.
 *
 * Las dos reglas que pueden estar mal:
 *
 * - **Vacío del todo es legítimo** y da `undefined`, no un centro con el nombre en blanco: el
 *   centro es opcional, y un `{ name: "" }` guardado convertiría «este cliente no tiene centro» en
 *   dos preguntas distintas — la misma razón por la que `withCenterLogo` descarta el registro vacío.
 * - **Un logo sin nombre se RECHAZA.** Un logo es una imagen sin rótulo: no se puede nombrar en el
 *   selector, ni en el diálogo, ni en el encabezado que este archivo compone, así que guardarlo
 *   dejaría una identidad que ninguna pantalla puede decir en voz alta. Se pide el nombre en vez de
 *   descartar el logo en silencio, que es lo que haría desaparecer un archivo que el usuario subió.
 *
 * El nombre pasa por `normalizeEntityName`, el mismo recorte y el mismo tope de 60 que el del
 * workspace: son rótulos del mismo papel y dos topes distintos no se podrían justificar por
 * separado.
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

/** Lo que separa el nombre del workspace del de su centro. El mismo punto medio con el que
 *  `letterheadLines` separa la razón social del RUC: un solo dialecto en los tres papeles. */
const HEADING_SEPARATOR = " · ";

/**
 * EL RÓTULO QUE ENCABEZA EL PAPEL, la única definición que hay. Sin centro es el nombre del
 * workspace tal cual, que es lo que deja intacto a todo cliente que no declare ninguno.
 */
export function costCenterHeading(name: string, center: CostCenter | null | undefined): string {
  if (!center || center.name.trim().length === 0) {
    return name;
  }
  return `${name}${HEADING_SEPARATOR}${center.name}`;
}

/**
 * El logo que va a la IZQUIERDA del membrete y el que va a la DERECHA, resueltos de una vez para
 * las tres superficies que los imprimen.
 *
 * La regla, escrita aquí y en ningún otro sitio: **el del CLIENTE encabeza a la izquierda y el de
 * su CENTRO va a la derecha** — el mismo reparto con el que PyG y Ocupaciones timbran sus hojas,
 * donde el logo del workspace abre y el del centro de esa hoja cierra. Sin centro, o con un centro
 * que no subió logo, no hay segundo logo y el del cliente se queda donde siempre estuvo.
 *
 * Que exista esta función y no un `if` en cada superficie es lo que importa: preguntar «¿y si este
 * cliente no tiene centro?» en el PDF, en el Excel y en el informe es exactamente cómo dos de los
 * tres acaban respondiendo distinto.
 */
export function letterheadLogos(
  clientLogo: EntityLogo | null | undefined,
  center: CostCenter | null | undefined,
): { left: EntityLogo | undefined; right: EntityLogo | undefined } {
  return { left: clientLogo ?? undefined, right: center?.logo ?? undefined };
}
