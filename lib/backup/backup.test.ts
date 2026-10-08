import { describe, expect, it, vi } from "vitest";
import {
  backupFilename,
  parseBackup,
  serializeBackup,
  validateBackup,
  type BackupAdapter,
} from "./index";
import { cashFlowBackupEnvelopeFixture } from "@/lib/cash-flow/backup/fixtures";
import { cashFlowBackupAdapter } from "@/lib/cash-flow/backup";

describe("backup transport", () => {
  it("preserves all JSON values, null, zero, decimals, and optional absence", () => {
    const envelope = cashFlowBackupEnvelopeFixture();
    envelope.tables.clients[1].logo = undefined;
    const parsed = parseBackup(
      serializeBackup(envelope, cashFlowBackupAdapter),
      cashFlowBackupAdapter,
    );
    expect(parsed).toEqual(JSON.parse(JSON.stringify(envelope)));
    expect(parsed.tables.clients[1]).not.toHaveProperty("logo");
    expect(parsed.tables.payables[0].approved).toBe(0);
    expect(parsed.tables.payables[1].approved).toBeNull();
    expect(parsed.tables.flows[0].balances["deleted-account"]).toBe(-50.75);
    expect(backupFilename(parsed)).toBe(
      "liderboard-cash-flow-2026-10-08T14-15-16-123Z.backup.json",
    );
  });
  it.each([
    ["format", "excel"],
    ["module", "payroll"],
    ["formatVersion", 2],
    ["dataVersion", 2],
    ["databaseVersion", 4],
    ["createdAt", "2026-10-08"],
    ["createdAt", "2026-02-30T14:15:16.123Z"],
    ["createdAt", "2026-10-08T14:15:16+00:00"],
  ])("rejects unsupported %s = %s before persistence", (field, value) => {
    const restore = vi.fn();
    const adapter: BackupAdapter<unknown, unknown> = { ...cashFlowBackupAdapter, restore };
    const envelope = { ...cashFlowBackupEnvelopeFixture(), [field]: value };
    expect(() => parseBackup(JSON.stringify(envelope), adapter)).toThrow();
    expect(restore).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON, missing fields and unknown envelope fields", () => {
    for (const text of ["{broken", "null", "[]", "{}"])
      expect(() => parseBackup(text, cashFlowBackupAdapter)).toThrow();
    const envelope = cashFlowBackupEnvelopeFixture();
    expect(() =>
      validateBackup({ ...envelope, declaredTotals: {} }, cashFlowBackupAdapter),
    ).toThrow();
    expect(() =>
      validateBackup({ ...envelope, tables: undefined }, cashFlowBackupAdapter),
    ).toThrow();
  });
  it("rejects nonfinite amounts rather than silently serializing them as null", () => {
    const envelope = cashFlowBackupEnvelopeFixture();
    envelope.tables.payables[0].amount = Infinity;
    expect(() => serializeBackup(envelope, cashFlowBackupAdapter)).toThrow();
  });
});
