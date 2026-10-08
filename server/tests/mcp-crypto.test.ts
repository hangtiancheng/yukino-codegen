import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  decryptStringMap,
  encryptSecret,
  encryptStringMap,
  secretsEqual,
} from "../src/agent-runtime/mcp-crypto.js";
import { HttpError } from "../src/common/index.js";

// AES-256-GCM secret helpers. MCP_SECRET_KEY is pinned in vitest.config.ts so the
// key resolves to a valid 32-byte value deterministically across runs.

describe("encryptSecret / decryptSecret", () => {
  it("round-trips arbitrary plaintext", () => {
    const plaintext = "super-secret-token=abc123!@#";
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
  });

  it("round-trips an empty string", () => {
    expect(decryptSecret(encryptSecret(""))).toBe("");
  });

  it("produces a base64 payload that does not contain the plaintext", () => {
    const packed = encryptSecret("PLAINTEXT_MARKER");
    expect(packed).not.toContain("PLAINTEXT_MARKER");
  });

  it("uses a random IV: two encryptions differ but both decrypt", () => {
    const plaintext = "same-input";
    const a = encryptSecret(plaintext);
    const b = encryptSecret(plaintext);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(plaintext);
    expect(decryptSecret(b)).toBe(plaintext);
  });

  it("throws on a too-short (corrupt) payload", () => {
    const tooShort = Buffer.from("short").toString("base64");
    const run = () => decryptSecret(tooShort);
    expect(run).toThrow(HttpError);
    expect(run).toThrow("Corrupted MCP secret payload");
  });

  it("throws when the auth tag / ciphertext is tampered with", () => {
    const packed = encryptSecret("integrity-protected");
    const raw = Buffer.from(packed, "base64");
    // Flip a bit inside the auth-tag region (bytes 12..27) to trigger GCM failure.
    raw[13] = (raw[13] ?? 0) ^ 0xff;
    const tampered = raw.toString("base64");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("encryptStringMap / decryptStringMap", () => {
  it("round-trips a populated map", () => {
    const map = { API_KEY: "k-123", Region: "us-east-1" };
    const packed = encryptStringMap(map);
    expect(typeof packed).toBe("string");
    expect(decryptStringMap(packed)).toEqual(map);
  });

  it("returns null for undefined and empty maps", () => {
    expect(encryptStringMap(undefined)).toBeNull();
    expect(encryptStringMap({})).toBeNull();
  });

  it("returns undefined when decrypting null", () => {
    expect(decryptStringMap(null)).toBeUndefined();
  });

  it("uses a random IV yet both ciphertexts decrypt to the same map", () => {
    const map = { token: "abc" };
    const first = encryptStringMap(map) as string;
    const second = encryptStringMap(map) as string;
    expect(first).not.toBe(second);
    expect(decryptStringMap(first)).toEqual(map);
    expect(decryptStringMap(second)).toEqual(map);
  });

  it("does not leak values in the encrypted payload", () => {
    const packed = encryptStringMap({ secret: "TOP_SECRET_VALUE" }) as string;
    expect(packed).not.toContain("TOP_SECRET_VALUE");
    expect(packed).not.toContain("secret");
  });

  it("throws when the underlying ciphertext is tampered with", () => {
    const packed = encryptStringMap({ a: "1" }) as string;
    const raw = Buffer.from(packed, "base64");
    const last = raw.length - 1;
    raw[last] = (raw[last] ?? 0) ^ 0xff;
    expect(() => decryptStringMap(raw.toString("base64"))).toThrow();
  });

  it("returns undefined when the decrypted JSON is not an object", () => {
    // A well-formed ciphertext whose plaintext is a JSON primitive/null.
    expect(decryptStringMap(encryptSecret(JSON.stringify(42)))).toBeUndefined();
    expect(decryptStringMap(encryptSecret(JSON.stringify(null)))).toBeUndefined();
  });
});

describe("secretsEqual", () => {
  it("returns true for identical strings", () => {
    expect(secretsEqual("hunter2", "hunter2")).toBe(true);
  });

  it("returns false for differing strings of equal length", () => {
    expect(secretsEqual("aaaa", "aaab")).toBe(false);
  });

  it("returns false for differing lengths", () => {
    expect(secretsEqual("short", "longer-string")).toBe(false);
  });
});
