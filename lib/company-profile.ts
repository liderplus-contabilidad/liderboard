/**
 * EL PERFIL DE EMPRESA DE UN WORKSPACE — lo que el papel de la firma imprime bajo su logo: la razón
 * social, dónde está la empresa y cómo llamarla.
 *
 * Vive en `lib/` y no en `lib/payroll/` porque quien lo CAPTURA es el diálogo compartido del header
 * (`ClientNameDialog`), que es de `components/dashboard/` y lo usan los tres módulos: si el tipo
 * viviera dentro de un módulo, un componente del dashboard tendría que importar de Rol de Pagos y la
 * dependencia quedaría invertida. Es la misma vecindad de `lib/logos.ts` y `lib/workspaces.ts` — las
 * reglas genéricas de la identidad de un workspace, que cada módulo decide si usa. Hoy solo lo cablea
 * Rol de Pagos.
 *
 * **La regla que sostiene todo el archivo es `letterheadLines`**: devuelve LÍNEAS ya compuestas, no
 * campos. Las tres superficies que imprimen el membrete —la pantalla, el comprobante en PDF y el
 * Excel del período— reciben ese array y lo escriben; ninguna sabe que la ubicación se une con ` / `
 * ni que el RUC acompaña a la razón social. El modo de fallo real de esto no es que una dirección
 * salga mal: es que salga de DOS maneras, con coma en una pantalla y con barra en un archivo, sin
 * que ninguna cifra lo delate.
 *
 * El nombre del cliente NO es una de esas líneas. Es la primera línea del membrete en las tres, ya
 * viaja por su cuenta a las tres, y mezclarlo obligaría a cada una a saber que esa línea se pinta
 * distinto.
 */

/** Los ocho campos, por su nombre. El borrador del diálogo es un `string` por cada uno. */
export type CompanyField =
  | "legalName"
  | "taxId"
  | "province"
  | "canton"
  | "parish"
  | "address"
  | "phones"
  | "email";

/**
 * El perfil GUARDADO. Los seis del membrete son obligatorios en el formulario y por eso no son
 * opcionales aquí; el RUC y el correo sí, y cuando no vienen el campo NO se escribe —una cadena
 * vacía guardada y un campo ausente dirían lo mismo, y dejar los dos convierte «esta empresa no
 * declaró RUC» en dos preguntas distintas—.
 */
export interface CompanyProfile {
  legalName: string;
  province: string;
  canton: string;
  parish: string;
  address: string;
  phones: string;
  taxId?: string;
  email?: string;
}

/** Lo que el diálogo tiene en la mano mientras se teclea: los ocho campos, siempre presentes. */
export type CompanyDraft = Record<CompanyField, string>;

/**
 * El tope de un campo, en caracteres. Uno solo para los ocho: el más largo de todos es la dirección
 * («LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA», 39) y 120 le deja el triple, mientras que un tope por
 * campo serían siete números que nadie puede justificar por separado.
 */
export const MAX_COMPANY_FIELD_LENGTH = 120;

/** Los trece dígitos de un RUC ecuatoriano. Se comprueba el LARGO y nada más: el dígito verificador
 *  tiene tres algoritmos según el tipo de contribuyente, y rechazar un RUC válido por implementar
 *  mal uno de ellos es peor que aceptar uno inventado en un membrete. */
const TAX_ID_PATTERN = /^\d{13}$/;
const TAX_ID_LENGTH_WORD = "trece";

export interface CompanyFieldSpec {
  id: CompanyField;
  /** El rótulo del campo en el diálogo. */
  label: string;
  /** Cómo lo nombra el rechazo: «Falta la parroquia.» Va aparte del rótulo porque lleva artículo. */
  missing: string;
  required: boolean;
  /** Un ejemplo real del archivo del cliente, para que el campo diga qué espera sin una nota. */
  placeholder: string;
  /** Los que piden la fila entera de la rejilla del diálogo, porque su contenido es largo. */
  wide?: boolean;
}

/**
 * EL CATÁLOGO — el orden en que se piden, cuáles son obligatorios y cómo se llaman. Una sola lista
 * en vez de ocho campos escritos a mano en el diálogo, por lo mismo que `concepts.ts` y `journal.ts`
 * son catálogos: un campo nuevo se añade aquí y el formulario, la validación y el borrador vacío lo
 * heredan a la vez, en vez de en tres sitios que pueden separarse.
 */
export const COMPANY_FIELDS: readonly CompanyFieldSpec[] = [
  {
    id: "legalName",
    label: "Razón social",
    missing: "Falta la razón social.",
    required: true,
    placeholder: "DELICMAR S.A.S.",
    wide: true,
  },
  {
    id: "taxId",
    label: "RUC",
    missing: "Falta el RUC.",
    required: false,
    placeholder: "1891234567001",
  },
  {
    id: "phones",
    label: "Teléfonos",
    missing: "Faltan los teléfonos.",
    required: true,
    placeholder: "0991045439 - 0958780660",
  },
  {
    id: "province",
    label: "Provincia",
    missing: "Falta la provincia.",
    required: true,
    placeholder: "TUNGURAHUA",
  },
  {
    id: "canton",
    label: "Cantón",
    missing: "Falta el cantón.",
    required: true,
    placeholder: "AMBATO",
  },
  {
    id: "parish",
    label: "Parroquia",
    missing: "Falta la parroquia.",
    required: true,
    placeholder: "AMBATO",
  },
  {
    id: "address",
    label: "Dirección",
    missing: "Falta la dirección.",
    required: true,
    placeholder: "LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
    wide: true,
  },
  {
    id: "email",
    label: "Correo electrónico",
    missing: "Falta el correo.",
    required: false,
    placeholder: "nomina@delicmar.com",
  },
];

/** Los seis que el alta exige, en el orden en que se piden. */
export const REQUIRED_COMPANY_FIELDS: readonly CompanyField[] = COMPANY_FIELDS.filter(
  (field) => field.required,
).map((field) => field.id);

/** Recorta y colapsa espacios, la misma normalización que `normalizeEntityName` aplica al nombre. */
function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/** El borrador de un cliente que todavía no tiene perfil. */
export function emptyCompanyDraft(): CompanyDraft {
  return Object.fromEntries(COMPANY_FIELDS.map((field) => [field.id, ""])) as CompanyDraft;
}

/**
 * El borrador precargado con lo guardado. Sin perfil da el borrador vacío: el diálogo abre mostrando
 * lo que hay, y si un perfil ausente diera otra cosa, renombrar un cliente antiguo parecería estar
 * borrándole datos que nunca tuvo.
 */
export function companyDraftFrom(profile: CompanyProfile | null | undefined): CompanyDraft {
  const draft = emptyCompanyDraft();
  if (!profile) {
    return draft;
  }
  for (const field of COMPANY_FIELDS) {
    draft[field.id] = profile[field.id] ?? "";
  }
  return draft;
}

/**
 * El mensaje del PRIMER campo obligatorio que falta, o `null` si están los seis. Es lo que apaga el
 * botón del diálogo mientras se teclea, y va aparte de `checkCompanyProfile` porque juzga otra cosa:
 * aquel valida el perfil ENTERO al enviar —RUC incluido—, y un RUC a medio teclear no puede apagar
 * un botón que el usuario todavía no ha pulsado.
 */
export function firstMissingCompanyField(draft: CompanyDraft): string | null {
  for (const field of COMPANY_FIELDS) {
    if (field.required && clean(draft[field.id]).length === 0) {
      return field.missing;
    }
  }
  return null;
}

export type CompanyProfileCheck =
  | { ok: true; profile: CompanyProfile }
  | { ok: false; field: CompanyField; message: string };

/**
 * Valida el borrador y devuelve el perfil que se guarda, o el PRIMER campo que falla con su
 * mensaje. Devuelve el campo además del mensaje porque el diálogo tiene que poder señalar el input
 * que lo produjo: un rechazo que solo dice la frase obliga a buscar cuál de los ocho es.
 *
 * Recorre `COMPANY_FIELDS` en su orden, así que el rechazo señala el primer hueco de arriba abajo,
 * que es por donde el usuario va llenando.
 */
export function checkCompanyProfile(draft: CompanyDraft): CompanyProfileCheck {
  const values = {} as Record<CompanyField, string>;

  for (const field of COMPANY_FIELDS) {
    const value = clean(draft[field.id]);
    if (value.length === 0) {
      if (field.required) {
        return { ok: false, field: field.id, message: field.missing };
      }
      values[field.id] = "";
      continue;
    }
    if (value.length > MAX_COMPANY_FIELD_LENGTH) {
      return {
        ok: false,
        field: field.id,
        message: `${field.label} no puede pasar de ${MAX_COMPANY_FIELD_LENGTH} caracteres.`,
      };
    }
    values[field.id] = value;
  }

  if (values.taxId.length > 0 && !TAX_ID_PATTERN.test(values.taxId)) {
    return {
      ok: false,
      field: "taxId",
      message: `El RUC son ${TAX_ID_LENGTH_WORD} dígitos, sin espacios ni guiones.`,
    };
  }

  return {
    ok: true,
    profile: {
      legalName: values.legalName,
      province: values.province,
      canton: values.canton,
      parish: values.parish,
      address: values.address,
      phones: values.phones,
      ...(values.taxId ? { taxId: values.taxId } : {}),
      ...(values.email ? { email: values.email } : {}),
    },
  };
}

/** Lo que separa la razón social del RUC en su línea. Un punto medio y no tres espacios: el HTML
 *  colapsa los espacios y la pantalla diría una cosa donde el PDF y el Excel dicen otra. */
const TAX_ID_SEPARATOR = " · ";

/** Lo que une provincia, cantón, parroquia y dirección, como en el papel del contador. */
const LOCATION_SEPARATOR = " / ";

/**
 * LAS LÍNEAS DEL MEMBRETE, la única definición que hay. Un campo opcional ausente no produce línea
 * ni separador: el bloque tiene tantas líneas como datos hay, porque un separador colgando o una
 * línea en blanco se leen como un dato que falta cuando lo que pasa es que ese dato no existe.
 */
export function letterheadLines(profile: CompanyProfile | null | undefined): string[] {
  if (!profile) {
    return [];
  }
  const location = [profile.province, profile.canton, profile.parish, profile.address]
    .map(clean)
    .filter((part) => part.length > 0)
    .join(LOCATION_SEPARATOR);

  return [
    profile.taxId
      ? `${profile.legalName}${TAX_ID_SEPARATOR}RUC ${profile.taxId}`
      : profile.legalName,
    location,
    profile.phones,
    profile.email ?? "",
  ].filter((line) => line.length > 0);
}
