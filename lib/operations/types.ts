export interface SourceField {
  key: string;
  address: string;
  row: number;
  column: string;
  category: string;
  label: string;
  original: string;
}

export interface EditableRecord<T extends object> {
  id: string;
  original: T;
  edits: Partial<T>;
}

export interface CompanyValues {
  name: string;
  ruc: string;
  group: string;
  system: string;
  declarationDay: string;
  periodicity: string;
  notes: string;
}

export interface Company extends EditableRecord<CompanyValues> {
  fields: SourceField[];
  fieldEdits: Record<string, string>;
  customFields?: SourceField[];
  fieldTabs?: string[];
  fieldCategories?: Record<string, string>;
  taxEdits?: Partial<CompanyTaxValues>;
  fieldTypes?: Record<string, CompanyFieldType>;
  /** Older encrypted company details need one unlock before their public-data migration. */
  detailsPending?: boolean;
}

export interface CompanyFieldType {
  kind: "text" | "select" | "checkbox";
  options: string[];
}

export type CompanyTaxRegime = "general" | "entrepreneur" | "popular";
export interface CompanyTaxValues {
  regime: CompanyTaxRegime | "";
  isCompany: boolean;
  keepsAccounting: boolean;
  withholdingAgent: boolean;
  zeroDeclaration: boolean;
  zeroFourteenthDeclaration: boolean;
  dualActivity: boolean;
  incomePeriodicity: string;
}

export interface AccessValues {
  service: string;
  user: string;
  password: string;
  email: string;
  notes: string;
}

export interface Access extends EditableRecord<AccessValues> {
  companyId: string;
  fields: SourceField[];
  fieldEdits: Record<string, string>;
}

export type Interpretation = "unresolved" | "applies" | "completed" | "other";

export interface Obligation {
  id: string;
  companyId: string;
  category: string;
  label: string;
  source: SourceField;
  applies: boolean | null;
  interpretation: Interpretation;
  notes: string;
}

export interface TaskValues {
  title: string;
  dueOn: string | null;
  period: string;
  person: string;
  done: boolean;
  started?: boolean;
  preparationDays?: number;
  notes: string;
}

export interface ScheduleTask extends EditableRecord<TaskValues> {
  companyId: string;
  sourceObligationId?: string;
}

export interface SourceSnapshot {
  sheet: string;
  cells: SourceField[];
}

export interface KeysImport {
  kind: "keys";
  companies: Company[];
  accesses: Access[];
  obligations: Obligation[];
  source: SourceSnapshot;
  warnings: string[];
}

export interface ScheduleImport {
  kind: "schedule";
  companies: Company[];
  tasks: ScheduleTask[];
  warnings: string[];
}

export type OperationsImport = KeysImport | ScheduleImport;
