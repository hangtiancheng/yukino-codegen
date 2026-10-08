import { z } from "zod";

export const isoTimestampSchema = z
  .string()
  .min(1, "timestamp must be a non-empty string");

export const optionalTimestampSchema = isoTimestampSchema.optional();

export const positiveIntSchema = z.number().int().positive();

export const nonNegativeIntSchema = z.number().int().nonnegative();

export type IsoTimestamp = z.infer<typeof isoTimestampSchema>;
