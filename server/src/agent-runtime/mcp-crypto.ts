import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { ErrorCode, HttpError } from "../common/index.js";
import { env } from "../config/index.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const AUTH_TAG_BYTES = 16;

let cachedKey: Buffer | undefined;

const resolveKey = (): Buffer => {
  if (cachedKey !== undefined) return cachedKey;
  const decoded = Buffer.from(env.MCP_SECRET_KEY, "base64");
  if (decoded.byteLength !== KEY_BYTES) {
    throw new HttpError(
      ErrorCode.SystemError,
      "MCP_SECRET_KEY must be a base64-encoded 32-byte key",
      500,
    );
  }
  cachedKey = decoded;
  return decoded;
};

/**
 * Encrypts a UTF-8 plaintext with AES-256-GCM. The output packs
 * iv || authTag || ciphertext and is base64-encoded for storage. Secrets are
 * never logged; callers persist the returned opaque string only.
 */
export const encryptSecret = (plaintext: string): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, resolveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
};

export const decryptSecret = (packed: string): string => {
  const buffer = Buffer.from(packed, "base64");
  if (buffer.byteLength < IV_BYTES + AUTH_TAG_BYTES) {
    throw new HttpError(ErrorCode.SystemError, "Corrupted MCP secret payload", 500);
  }
  const iv = buffer.subarray(0, IV_BYTES);
  const authTag = buffer.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = buffer.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, resolveKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};

export type StringMap = Readonly<Record<string, string>>;

export const encryptStringMap = (value: StringMap | undefined): string | null =>
  value === undefined || Object.keys(value).length === 0
    ? null
    : encryptSecret(JSON.stringify(value));

export const decryptStringMap = (packed: string | null): StringMap | undefined => {
  if (packed === null) return undefined;
  const parsed: unknown = JSON.parse(decryptSecret(packed));
  if (parsed === null || typeof parsed !== "object") return undefined;
  return parsed as StringMap;
};

/** Constant-time comparison helper for optional secret revalidation flows. */
export const secretsEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer)
  );
};
