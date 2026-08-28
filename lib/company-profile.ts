/**
 * A WORKSPACE'S COMPANY PROFILE — what the firm's paper prints under its logo: the razón social,
 * where the company is and how to reach it.
 *
 * It lives in `lib/` and not in `lib/payroll/` because what CAPTURES it is the header's shared dialog
 * (`ClientNameDialog`), which belongs to `components/dashboard/` and is used by all three modules: if
 * the type lived inside a module, a dashboard component would have to import from Rol de Pagos and
 * the dependency would be inverted. It is the same neighbourhood as `lib/logos.ts` and
 * `lib/workspaces.ts` — the generic rules of a workspace's identity, which each module decides
 * whether to use. Today only Rol de Pagos wires it.
 *
 * **The rule that holds the whole file up is `letterheadLines`**: it returns already composed LINES,
 * not fields. The three surfaces that print the letterhead —the screen, the payslip in PDF and the
 * período's Excel— receive that array and write it; none of them knows the location is joined with
 * ` / ` or that the RUC accompanies the razón social. The real failure mode of this is not an address
 * coming out wrong: it is it coming out in TWO ways, with a comma on one screen and with a slash in a
 * file, without any figure giving it away.
 *
 * The client's name is NOT one of those lines. It is the first line of the letterhead in all three,
 * it already travels on its own to all three, and mixing it in would force each one to know that line
 * is painted differently.
 */

/** The eight fields, by name. The dialog's draft is one `string` per field. */
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
 * The STORED profile. The six of the letterhead are required in the form and that is why they are not
 * optional here; the RUC and the email are, and when they do not arrive the field is NOT written —a
 * stored empty string and an absent field would say the same thing, and keeping both turns «this
 * company declared no RUC» into two different questions—.
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

/** What the dialog holds while typing: the eight fields, always present. */
export type CompanyDraft = Record<CompanyField, string>;

/**
 * A field's cap, in characters. One single cap for all eight: the longest of them all is the address
 * («LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA», 39) and 120 leaves it triple the room, whereas a cap
 * per field would be seven numbers nobody could justify separately.
 */
export const MAX_COMPANY_FIELD_LENGTH = 120;

/** The thirteen digits of an Ecuadorian RUC. The LENGTH is checked and nothing else: the check digit
 *  has three algorithms depending on the type of taxpayer, and rejecting a valid RUC through
 *  implementing one of them badly is worse than accepting an invented one on a letterhead. */
const TAX_ID_PATTERN = /^\d{13}$/;
const TAX_ID_LENGTH_WORD = "trece";

export interface CompanyFieldSpec {
  id: CompanyField;
  /** The field's label in the dialog. */
  label: string;
  /** How the rejection names it: «Falta la parroquia.» It goes apart from the label because it
   *  carries an article. */
  missing: string;
  required: boolean;
  /** A real example from the client's file, so the field says what it expects without a note. */
  placeholder: string;
  /** The ones that ask for the dialog grid's whole row, because their content is long. */
  wide?: boolean;
}

/**
 * THE CATALOGUE — the order in which they are asked for, which are required and what they are called.
 * One single list instead of eight fields written by hand in the dialog, for the same reason
 * `concepts.ts` and `journal.ts` are catalogues: a new field is added here and the form, the
 * validation and the empty draft inherit it at once, instead of in three places that can drift apart.
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

/** The six the creation requires, in the order they are asked for. */
export const REQUIRED_COMPANY_FIELDS: readonly CompanyField[] = COMPANY_FIELDS.filter(
  (field) => field.required,
).map((field) => field.id);

/** Trims and collapses whitespace, the same normalization `normalizeEntityName` applies to the
 *  name. */
function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/** The draft of a client that does not have a profile yet. */
export function emptyCompanyDraft(): CompanyDraft {
  return Object.fromEntries(COMPANY_FIELDS.map((field) => [field.id, ""])) as CompanyDraft;
}

/**
 * The draft preloaded with what is stored. With no profile it gives the empty draft: the dialog opens
 * showing what is there, and if an absent profile gave anything else, renaming an old client would
 * look like it was erasing data it never had.
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
 * The message of the FIRST required field that is missing, or `null` if all six are there. It is what
 * switches the dialog's button off while typing, and it is separate from `checkCompanyProfile`
 * because it judges something else: that one validates the WHOLE profile on submit —RUC included—,
 * and a half-typed RUC cannot switch off a button the user has not pressed yet.
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
 * Validates the draft and returns the profile to be stored, or the FIRST field that fails with its
 * message. It returns the field as well as the message because the dialog has to be able to point at
 * the input that produced it: a rejection that only states the phrase forces you to work out which of
 * the eight it is.
 *
 * It walks `COMPANY_FIELDS` in its order, so the rejection points at the first gap from top to
 * bottom, which is the way the user fills it in.
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

/** What separates the razón social from the RUC on its line. A middle dot and not three spaces: HTML
 *  collapses spaces and the screen would say one thing where the PDF and the Excel say another. */
const TAX_ID_SEPARATOR = " · ";

/** What joins provincia, cantón, parroquia and dirección, as on the accountant's paper. */
const LOCATION_SEPARATOR = " / ";

/**
 * THE LETTERHEAD'S LINES, the only definition there is. An absent optional field produces neither a
 * line nor a separator: the block has as many lines as there are data, because a dangling separator
 * or a blank line reads as a missing datum when what is happening is that the datum does not exist.
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
