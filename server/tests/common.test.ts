import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
  generateSessionId,
  hashPassword,
  idSchema,
  idStringSchema,
  pageRequestSchema,
  sortOrderSchema,
  toOffset,
  verifyPassword,
  verifyPasswordWithUpgrade,
} from "../src/common/index.js";
import { env } from "../src/config/index.js";

describe("idSchema", () => {
  it("accepts positive bigint, number, and numeric-string and normalizes to bigint", () => {
    expect(idSchema.parse(5n)).toBe(5n);
    expect(idSchema.parse(5)).toBe(5n);
    expect(idSchema.parse("5")).toBe(5n);
    expect(idSchema.parse(String(Number.MAX_SAFE_INTEGER))).toBe(BigInt(Number.MAX_SAFE_INTEGER));
  });

  it("rejects zero, negatives, and non-integers", () => {
    expect(idSchema.safeParse(0).success).toBe(false);
    expect(idSchema.safeParse(0n).success).toBe(false);
    expect(idSchema.safeParse(-1).success).toBe(false);
    expect(idSchema.safeParse(1.5).success).toBe(false);
  });

  it("rejects malformed numeric strings", () => {
    expect(idSchema.safeParse("0").success).toBe(false);
    expect(idSchema.safeParse("01").success).toBe(false);
    expect(idSchema.safeParse("12a").success).toBe(false);
  });

  it("rejects a number beyond the safe-integer range", () => {
    expect(idSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
  });

  it("idStringSchema validates positive integer strings only", () => {
    expect(idStringSchema.safeParse("123").success).toBe(true);
    expect(idStringSchema.safeParse("0").success).toBe(false);
    expect(idStringSchema.safeParse("12a").success).toBe(false);
  });
});

describe("pagination", () => {
  it("applies defaults for current and pageSize", () => {
    expect(pageRequestSchema.parse({})).toMatchObject({ current: 1, pageSize: 10 });
  });

  it("computes skip/take offsets", () => {
    expect(toOffset({ current: 1, pageSize: 10 })).toEqual({ skip: 0, take: 10 });
    expect(toOffset({ current: 3, pageSize: 10 })).toEqual({ skip: 20, take: 10 });
    expect(toOffset({ current: 2, pageSize: 20 })).toEqual({ skip: 20, take: 20 });
  });

  it("enforces bounds on current and pageSize", () => {
    expect(pageRequestSchema.safeParse({ current: 0 }).success).toBe(false);
    expect(pageRequestSchema.safeParse({ pageSize: 21 }).success).toBe(false);
    expect(pageRequestSchema.safeParse({ pageSize: 0 }).success).toBe(false);
  });

  it("sortOrderSchema accepts ascend/descend only", () => {
    expect(sortOrderSchema.safeParse("ascend").success).toBe(true);
    expect(sortOrderSchema.safeParse("descend").success).toBe(true);
    expect(sortOrderSchema.safeParse("asc").success).toBe(false);
  });
});

describe("base-response", () => {
  it("builds a success response with data and code 0", () => {
    expect(createSuccessResponse({ hello: "world" })).toEqual({
      code: ErrorCode.Success,
      data: { hello: "world" },
      message: "ok",
    });
  });

  it("builds an error response with no data key", () => {
    const response = createErrorResponse(ErrorCode.ParamsError, "bad request");
    expect(response).toEqual({ code: ErrorCode.ParamsError, message: "bad request" });
    expect("data" in response).toBe(false);
  });
});

describe("password hashing", () => {
  it("hashPassword produces a verifiable scrypt hash needing no rehash", () => {
    const hashed = hashPassword("correct horse battery staple");
    expect(hashed.startsWith("scrypt$v1$")).toBe(true);
    const result = verifyPasswordWithUpgrade("correct horse battery staple", hashed);
    expect(result).toEqual({ needsRehash: false, valid: true });
    expect(verifyPassword("wrong password", hashed)).toBe(false);
  });

  it("verifies a legacy md5 hash and flags it for rehash", () => {
    const plain = "legacy-pass";
    const legacy = createHash("md5")
      .update(plain + env.PASSWORD_SALT)
      .digest("hex");
    const result = verifyPasswordWithUpgrade(plain, legacy);
    expect(result).toEqual({ needsRehash: true, valid: true });
    expect(verifyPasswordWithUpgrade("nope", legacy)).toEqual({ needsRehash: true, valid: false });
  });

  it("rejects an unrecognized hash format", () => {
    expect(verifyPasswordWithUpgrade("x", "not-a-real-hash")).toEqual({
      needsRehash: false,
      valid: false,
    });
  });

  it("generateSessionId returns unique 64-char hex tokens", () => {
    const a = generateSessionId();
    const b = generateSessionId();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
