export interface Sealed {
  iv: number[];
  data: number[];
}

export interface VaultConfig {
  id: "vault";
  salt: number[];
  iterations: number;
  check: Sealed;
}

const encoder = new TextEncoder();
export const VAULT_PASSWORD_MIN_LENGTH = 6;

async function derive(password: string, salt: number[], iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function seal(key: CryptoKey, id: string, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(id) },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return { iv: [...iv], data: [...new Uint8Array(data)] };
}

export async function unseal<T>(key: CryptoKey, id: string, value: Sealed): Promise<T> {
  const data = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(value.iv), additionalData: encoder.encode(id) },
    key,
    new Uint8Array(value.data),
  );
  return JSON.parse(new TextDecoder().decode(data)) as T;
}

export async function createVault(
  password: string,
): Promise<{ key: CryptoKey; config: VaultConfig }> {
  if (password.length < VAULT_PASSWORD_MIN_LENGTH)
    throw new Error(`Usa una contraseña de al menos ${VAULT_PASSWORD_MIN_LENGTH} caracteres.`);
  const salt = [...crypto.getRandomValues(new Uint8Array(16))];
  const iterations = 600_000;
  const key = await derive(password, salt, iterations);
  return {
    key,
    config: {
      id: "vault",
      salt,
      iterations,
      check: await seal(key, "vault-check", "liderboard-credentials-v1"),
    },
  };
}

export async function openVault(password: string, config: VaultConfig): Promise<CryptoKey> {
  const key = await derive(password, config.salt, config.iterations);
  try {
    if ((await unseal<string>(key, "vault-check", config.check)) !== "liderboard-credentials-v1")
      throw new Error();
  } catch {
    throw new Error("La contraseña del espacio no es correcta.");
  }
  return key;
}
