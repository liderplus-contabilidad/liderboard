export interface BackupEnvelope<T> {
  format: "liderboard-backup";
  formatVersion: 1;
  module: string;
  dataVersion: number;
  databaseVersion: number;
  createdAt: string;
  tables: T;
}

/** Persistence is composed by the module's db.ts; the transport never invokes it. */
export interface BackupAdapter<T, S> {
  module: string;
  dataVersion: number;
  databaseVersion: number;
  validateTables(tables: unknown): T;
  summarize(tables: T): S;
  capture?: () => Promise<BackupEnvelope<T>>;
  restore?: (envelope: BackupEnvelope<T>) => Promise<void>;
}

import { objectFields, isoTimestamp, stringValue, finiteNumber } from "./validation";

export type BackupErrorCode = "json" | "format" | "module" | "compatibility" | "validation";

export class BackupError extends Error {
  constructor(
    public readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BackupError";
  }
}

export function validateBackup<T, S>(
  value: unknown,
  adapter: BackupAdapter<T, S>,
): BackupEnvelope<T> {
  const envelope = objectFields(value, "respaldo", {
    format: stringValue,
    formatVersion: finiteNumber,
    module: stringValue,
    dataVersion: finiteNumber,
    databaseVersion: finiteNumber,
    createdAt: isoTimestamp,
    tables: () => {},
  });
  if (envelope.format !== "liderboard-backup") {
    throw new BackupError("format", "Este archivo no es un respaldo de Liderboard.");
  }
  if (envelope.module !== adapter.module) {
    throw new BackupError("module", "Este respaldo pertenece a otro módulo.");
  }
  if (
    envelope.formatVersion !== 1 ||
    envelope.dataVersion !== adapter.dataVersion ||
    envelope.databaseVersion !== adapter.databaseVersion
  ) {
    throw new BackupError(
      "compatibility",
      "La versión de este respaldo no es compatible con esta versión de Liderboard.",
    );
  }
  adapter.validateTables(envelope.tables);
  return value as BackupEnvelope<T>;
}
export function parseBackup<T, S>(text: string, adapter: BackupAdapter<T, S>): BackupEnvelope<T> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BackupError(
      "json",
      "No se pudo leer el respaldo: el archivo no contiene JSON válido.",
    );
  }
  return validateBackup(value, adapter);
}
export function serializeBackup<T, S>(
  envelope: BackupEnvelope<T>,
  adapter: BackupAdapter<T, S>,
): string {
  validateBackup(envelope, adapter);
  try {
    return JSON.stringify(envelope, null, 2);
  } catch {
    throw new BackupError("validation", "No se pudo serializar el respaldo.");
  }
}
export function backupFilename<T>(envelope: BackupEnvelope<T>): string {
  isoTimestamp(envelope.createdAt, "createdAt");
  if (!/^[a-z0-9-]+$/.test(envelope.module))
    throw new BackupError("module", "El módulo del respaldo no es válido.");
  return `liderboard-${envelope.module}-${envelope.createdAt.replaceAll(":", "-").replace(".", "-")}.backup.json`;
}
