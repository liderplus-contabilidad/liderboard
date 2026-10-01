import { describe, expect, it } from "vitest";
import { createVault, openVault, seal, unseal } from "./vault";

describe("local credential vault", () => {
  it("encrypts credentials with distinct IVs and authenticates their record identity", async () => {
    const { key, config } = await createVault("abc123");
    const first = await seal(key, "record-a", { password: "secret" });
    const second = await seal(key, "record-a", { password: "secret" });
    expect(first.iv).not.toEqual(second.iv);
    expect(JSON.stringify(first)).not.toContain("secret");
    const reopened = await openVault("abc123", config);
    expect(await unseal(reopened, "record-a", first)).toEqual({ password: "secret" });
    await expect(unseal(reopened, "record-b", first)).rejects.toThrow();
  });
  it("rejects passwords shorter than six characters", async () => {
    await expect(createVault("abc12")).rejects.toThrow("al menos 6 caracteres");
  });
  it("rejects a wrong password without returning decrypted values", async () => {
    const { config } = await createVault("a long test passphrase");
    await expect(openVault("a wrong passphrase", config)).rejects.toThrow();
  });
});
