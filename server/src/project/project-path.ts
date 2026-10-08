import { mkdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { ErrorCode, HttpError } from "../common/index.js";

export const resolveInsideBase = (baseDir: string, relativePath: string): string => {
  if (relativePath.trim().length === 0) {
    throw new HttpError(ErrorCode.ParamsError, "Path cannot be empty");
  }
  if (relativePath.startsWith("/") || relativePath.startsWith("\\")) {
    throw new HttpError(ErrorCode.ParamsError, "Absolute paths are not allowed");
  }
  const base = resolve(baseDir);
  const target = resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw new HttpError(ErrorCode.ParamsError, "Path traversal is not allowed");
  }
  return target;
};

export const ensureParentDir = async (filePath: string): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
};

export const buildCodeOutputDir = (rootDir: string, appId: string): string =>
  resolve(rootDir, "tmp", "code_output", appId);
