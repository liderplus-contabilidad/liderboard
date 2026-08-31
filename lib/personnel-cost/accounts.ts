/**
 * **THE map**, and the only place the twenty-one rows of «Análisis costo personal» are written down:
 * which concept, in which group, and which MicroPlus account it reads.
 *
 * The report it replaces is a sheet of the firm's own workbook (`COMPARATIVO NOMINA A 2026.xlsx`,
 * rows 59–87) where the accounts are not written at all — the accountant annotated exactly ONE of the
 * twenty-one, `5.2.02.`, and carried the rest in his head. Writing them here is most of what this
 * module adds: a figure whose account nobody can name is a figure nobody can check.
 *
 * **Three shapes of row, and they are the whole vocabulary** (`ConceptSource`):
 *
 * - `account` — the rollup of one MicroPlus code, which is nineteen of the twenty-one.
 * - `captured` — the nómina of the owning family, which no chart of accounts separates. It is the
 *   ONE figure this module persists (`db.ts`), and it exists because the workbook writes it as a hard
 *   number in the cell.
 * - `account-less-captured` — «Administración» minus that capture. In the workbook it is literally
 *   `=26302.69-D61`, the total of administrative payroll with the family's part taken out. Modelling
 *   it as its own shape is what makes the PAIR always sum the loaded account: the same anchoring
 *   `twinWriteFor` gives PyG's segmented expenses.
 *
 * **The codes are MicroPlus' own, with the trailing dot already stripped** (`normalizeMicroplusCode`):
 * the parser stores `5.2.02` for a parent account, so that is what `AnalyticsSource.valuesByCode`
 * answers to. A code this client's plan does not have is NOT an error — the row reads `null`, like a
 * month never loaded, and `derive.ts` reports it.
 *
 * **The LABELS are the workbook's and not the plan's.** The plan calls `5.2.02` «MANO DE OBRA DIRECTA
 * / FARMACIA/ LABORATORIO/MANO DE OBRA DIRECTA» — a name that repeats itself because it was built to
 * be read next to its siblings in a tree, not alone in a row. What the accountant reads in his own
 * comparativo is «MANO DE OBRA DIRECTA FARMACIA/ LABORATORIO», and that is what this screen says.
 */

/** The three groups of the comparativo, in the order column A of the workbook merges them. */
export type PersonnelGroupId = "afiliados" | "no-afiliados" | "honorarios-medicos";

/**
 * The two SUPER-groups: the pair the workbook's third percentage column computes, and the reading
 * the whole report exists for — 27 % of sales in staff on the payroll against 23 % in outside fees.
 */
export type PersonnelSectionId = "planta" | "externos";

/** Where a row's twelve monthly figures come from. */
export type ConceptSource =
  | { kind: "account"; code: string }
  | { kind: "captured" }
  | { kind: "account-less-captured"; code: string };

export interface PersonnelConcept {
  /** Stable, independent of the copy: the React key, the grid's row key and what a test names. */
  id: string;
  label: string;
  group: PersonnelGroupId;
  source: ConceptSource;
}

export interface PersonnelGroup {
  id: PersonnelGroupId;
  label: string;
  section: PersonnelSectionId;
}

export interface PersonnelSection {
  id: PersonnelSectionId;
  label: string;
  /** Which groups it sums, said in words — what the row and the tile put under the figure. */
  hint: string;
}

export const PERSONNEL_GROUPS: readonly PersonnelGroup[] = [
  { id: "afiliados", label: "Afiliados", section: "planta" },
  { id: "no-afiliados", label: "No afiliados", section: "planta" },
  { id: "honorarios-medicos", label: "Honorarios médicos", section: "externos" },
];

export const PERSONNEL_SECTIONS: readonly PersonnelSection[] = [
  { id: "planta", label: "Planta", hint: "Afiliados + no afiliados" },
  { id: "externos", label: "Externos", hint: "Honorarios médicos" },
];

/**
 * The account the family's nómina is carved OUT of, named once so nothing else has to spell it.
 *
 * It is `5.5.01.01`, «GASTOS NOMINA / ADMINISTRACION», and the workbook's own arithmetic is what
 * identifies it: January writes `18,313.53` for the family and `=26302.69-D61` for the rest, and
 * `18,313.53 + 7,989.16 = 26,302.69`.
 */
export const ADMIN_PAYROLL_CODE = "5.5.01.01";

export const PERSONNEL_CONCEPTS: readonly PersonnelConcept[] = [
  // ── Afiliados: quien está en la nómina de la clínica ──────────────────────────────────────────
  {
    id: "familia",
    label: "Administración (Familia Durán)",
    group: "afiliados",
    source: { kind: "captured" },
  },
  {
    id: "administracion",
    label: "Administración",
    group: "afiliados",
    source: { kind: "account-less-captured", code: ADMIN_PAYROLL_CODE },
  },
  {
    id: "mano-obra-directa",
    label: "Mano de obra directa · Farmacia / Laboratorio",
    group: "afiliados",
    source: { kind: "account", code: "5.2.02" },
  },
  {
    id: "mano-obra-indirecta",
    label: "Mano de obra indirecta · Admisiones / Caja / Información",
    group: "afiliados",
    source: { kind: "account", code: "5.3.02" },
  },

  // ── No afiliados: honorarios de quien atiende EN la clínica ───────────────────────────────────
  {
    id: "honorarios-medicos-planta",
    label: "Honorarios Médicos-Planta",
    group: "no-afiliados",
    source: { kind: "account", code: "5.2.04.01.01" },
  },
  {
    id: "honorarios-imagenologia-planta",
    label: "Honorarios de Imagenología-Planta",
    group: "no-afiliados",
    source: { kind: "account", code: "5.2.04.01.02" },
  },
  {
    id: "honorarios-enfermeria-planta",
    label: "Honorarios Enfermería-Planta",
    group: "no-afiliados",
    source: { kind: "account", code: "5.2.04.01.03" },
  },
  {
    id: "honorarios-laboratorio-planta",
    label: "Honorarios Profesionales Laboratorio-Planta",
    group: "no-afiliados",
    source: { kind: "account", code: "5.2.04.01.04" },
  },
  {
    id: "honorarios-fisioterapia-planta",
    label: "Honorarios Fisioterapia-Planta",
    group: "no-afiliados",
    source: { kind: "account", code: "5.2.04.01.05" },
  },
  {
    id: "honorarios-farmacia-planta",
    label: "Honorarios Prof. Farmacia-Bioquímico-Planta",
    group: "no-afiliados",
    source: { kind: "account", code: "5.2.04.01.06" },
  },
  {
    id: "honorarios-otros-planta",
    label: "Honorarios Profesionales Otros-Planta",
    group: "no-afiliados",
    source: { kind: "account", code: "5.2.04.01.07" },
  },
  {
    // The one row of the group that does NOT hang from 5.2.04: the accountant's fee sits in
    // administrative expenses, and the comparativo counts it as staff cost all the same.
    id: "honorarios-asesoria-contable",
    label: "Honorarios Asesoría Contable",
    group: "no-afiliados",
    source: { kind: "account", code: "5.5.01.02.01.01" },
  },
  {
    id: "servicios-prestados-planta",
    label: "Servicios Prestados-Planta",
    group: "no-afiliados",
    source: { kind: "account", code: "5.2.05.01.01" },
  },

  // ── Honorarios médicos: quien factura DESDE fuera ─────────────────────────────────────────────
  {
    id: "honorarios-medicos-externos",
    label: "Honorarios Médicos-Externos",
    group: "honorarios-medicos",
    source: { kind: "account", code: "5.3.03.01.01" },
  },
  {
    id: "honorarios-imagenologia-externos",
    label: "Honorarios de Imagenología-Externos",
    group: "honorarios-medicos",
    source: { kind: "account", code: "5.3.03.01.02" },
  },
  {
    id: "honorarios-enfermeria-externos",
    label: "Honorarios Enfermería-Externos",
    group: "honorarios-medicos",
    source: { kind: "account", code: "5.3.03.01.03" },
  },
  {
    id: "honorarios-laboratorio-externos",
    label: "Honorarios Profesionales Laboratorio-Externos",
    group: "honorarios-medicos",
    source: { kind: "account", code: "5.3.03.01.04" },
  },
  {
    id: "honorarios-fisioterapia-externos",
    label: "Honorarios Fisioterapia-Externos",
    group: "honorarios-medicos",
    source: { kind: "account", code: "5.3.03.01.05" },
  },
  {
    id: "honorarios-farmacia-externos",
    label: "Honorarios Prof. Farmacia-Bioquímico-Externos",
    group: "honorarios-medicos",
    source: { kind: "account", code: "5.3.03.01.06" },
  },
  {
    id: "honorarios-otros-externos",
    label: "Honorarios Profesionales Otros-Externos",
    group: "honorarios-medicos",
    source: { kind: "account", code: "5.3.03.01.07" },
  },
  {
    // Same exception as «Asesoría Contable», mirrored: an outside service billed under «OTROS
    // GASTOS» that the comparativo reads as an outside fee.
    id: "servicios-prestados-externos",
    label: "Servicios Prestados-Externos",
    group: "honorarios-medicos",
    source: { kind: "account", code: "5.3.03.17.06" },
  },
];

/**
 * Every MicroPlus code the map reads, deduplicated — what the adapter pulls off the analytics source
 * and nothing more. Deriving it from `PERSONNEL_CONCEPTS` rather than keeping a second list is what
 * makes adding a row a one-place change.
 */
export const PERSONNEL_ACCOUNT_CODES: readonly string[] = [
  ...new Set(
    PERSONNEL_CONCEPTS.flatMap((concept) =>
      concept.source.kind === "captured" ? [] : [concept.source.code],
    ),
  ),
];

/** The concepts of one group, in the map's order. */
export function conceptsOfGroup(group: PersonnelGroupId): PersonnelConcept[] {
  return PERSONNEL_CONCEPTS.filter((concept) => concept.group === group);
}

/** The groups a section sums, in the map's order. */
export function groupsOfSection(section: PersonnelSectionId): PersonnelGroup[] {
  return PERSONNEL_GROUPS.filter((group) => group.section === section);
}

export function findGroup(id: PersonnelGroupId): PersonnelGroup {
  const group = PERSONNEL_GROUPS.find((entry) => entry.id === id);
  if (!group) {
    throw new Error(`Grupo desconocido: ${id}`);
  }
  return group;
}
