import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { env } from "../config/index.js";

const scryptPrefix = "scrypt$v1";
const scryptKeyLength = 32;
const scryptOptions = {
  N: 16_384,
  maxmem: 32 * 1024 * 1024,
  p: 1,
  r: 8,
} as const;

const legacyMd5Pattern = /^[a-f0-9]{32}$/u;

const hashLegacyPassword = (plain: string): string =>
  createHash("md5")
    .update(plain + env.PASSWORD_SALT)
    .digest("hex");

const safeEqualHex = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export const hashPassword = (plain: string): string => {
  const salt = randomBytes(16).toString("base64url");
  return [
    scryptPrefix,
    scryptOptions.N.toString(),
    scryptOptions.r.toString(),
    scryptOptions.p.toString(),
    salt,
    scryptSync(plain, salt, scryptKeyLength, scryptOptions).toString("base64url"),
  ].join("$");
};

const verifyScryptPassword = (plain: string, hashed: string): boolean => {
  const [prefix, version, cost, blockSize, parallelization, salt, expected] = hashed.split("$");
  if (
    prefix !== "scrypt" ||
    version !== "v1" ||
    cost === undefined ||
    blockSize === undefined ||
    parallelization === undefined ||
    salt === undefined ||
    expected === undefined
  ) {
    return false;
  }
  try {
    const expectedBuffer = Buffer.from(expected, "base64url");
    const actual = scryptSync(plain, salt, expectedBuffer.length, {
      N: Number.parseInt(cost, 10),
      p: Number.parseInt(parallelization, 10),
      r: Number.parseInt(blockSize, 10),
    });
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  } catch {
    return false;
  }
};

export type PasswordVerificationResult = Readonly<{
  needsRehash: boolean;
  valid: boolean;
}>;

export const verifyPasswordWithUpgrade = (
  plain: string,
  hashed: string,
): PasswordVerificationResult => {
  if (hashed.startsWith(scryptPrefix)) {
    return { needsRehash: false, valid: verifyScryptPassword(plain, hashed) };
  }
  if (legacyMd5Pattern.test(hashed)) {
    return {
      needsRehash: true,
      valid: safeEqualHex(hashLegacyPassword(plain), hashed),
    };
  }
  return { needsRehash: false, valid: false };
};

export const verifyPassword = (plain: string, hashed: string): boolean =>
  verifyPasswordWithUpgrade(plain, hashed).valid;

export const generateSessionId = (): string => randomBytes(32).toString("hex");
