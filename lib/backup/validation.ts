import { BackupError } from "./index";

export type Validator = (value: unknown, path: string) => void;
type Fields = Record<string, Validator>;

export function invalid(path: string): never {
  throw new BackupError("validation", `El respaldo contiene un dato no válido en ${path}.`);
}

export function recordValue(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(path);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(path);
  return value as Record<string, unknown>;
}

/** Closed objects make an unversioned future field a rejection instead of silent loss. */
export function objectFields(
  value: unknown,
  path: string,
  required: Fields,
  optional: Fields = {},
): Record<string, unknown> {
  const record = recordValue(value, path);
  for (const key of Object.keys(record)) {
    if (!Object.hasOwn(required, key) && !Object.hasOwn(optional, key)) invalid(`${path}.${key}`);
  }
  for (const [key, check] of Object.entries(required)) {
    if (!Object.hasOwn(record, key)) invalid(`${path}.${key}`);
    check(record[key], `${path}.${key}`);
  }
  // Dexie can hold optional undefined properties; JSON represents them by absence.
  for (const [key, check] of Object.entries(optional)) {
    if (Object.hasOwn(record, key) && record[key] !== undefined)
      check(record[key], `${path}.${key}`);
  }
  return record;
}

export const stringValue: Validator = (value, path) => {
  if (typeof value !== "string") invalid(path);
};
export const idValue: Validator = (value, path) => {
  stringValue(value, path);
  if (!(value as string).trim()) invalid(path);
};
export const finiteNumber: Validator = (value, path) => {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(path);
};
export const booleanValue: Validator = (value, path) => {
  if (typeof value !== "boolean") invalid(path);
};
export const positiveNumber: Validator = (value, path) => {
  finiteNumber(value, path);
  if ((value as number) <= 0) invalid(path);
};
export const nullable =
  (check: Validator): Validator =>
  (value, path) => {
    if (value !== null) check(value, path);
  };
export const enumValue =
  (...values: string[]): Validator =>
  (value, path) => {
    if (typeof value !== "string" || !values.includes(value)) invalid(path);
  };
export const arrayValue =
  (check: Validator): Validator =>
  (value, path) => {
    if (!Array.isArray(value)) invalid(path);
    value.forEach((item, index) => check(item, `${path}[${index}]`));
  };
export const dictionaryValue =
  (check: Validator): Validator =>
  (value, path) => {
    for (const [key, item] of Object.entries(recordValue(value, path)))
      check(item, `${path}.${key}`);
  };

export const isoDate: Validator = (value, path) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(path);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid(path);
};

export const isoTimestamp: Validator = (value, path) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  )
    invalid(path);
  const date = new Date(value);
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== canonical) invalid(path);
};
