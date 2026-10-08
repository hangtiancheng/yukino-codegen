import { z } from "zod";
import { ErrorCode } from "./error-code.js";

export const baseResponseSchema = z.object({
  code: z.enum(ErrorCode),
  data: z.unknown().optional(),
  message: z.string(),
});

export type BaseResponse<T> = Readonly<{
  code: ErrorCode;
  data?: T;
  message: string;
}>;

export const createSuccessResponse = <T>(data: T): BaseResponse<T> => ({
  code: ErrorCode.Success,
  data,
  message: "ok",
});

export const createErrorResponse = (code: ErrorCode, message: string): BaseResponse<never> => ({
  code,
  message,
});
