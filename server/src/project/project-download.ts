import { createReadStream, existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import archiver, { type Archiver } from "archiver";
import { ErrorCode, HttpError } from "../common/index.js";

const EXCLUDED_NAMES = new Set([
  "node_modules",
  ".git",
  ".yukino",
  "dist",
  "build",
  ".DS_Store",
  ".env",
  "target",
  ".mvn",
  ".idea",
  ".vscode",
]);

const EXCLUDED_EXTENSIONS = [".log", ".tmp", ".cache"];

export type DownloadEntry = Readonly<{
  archivePath: string;
  fullPath: string;
}>;

const isIncludedPart = (name: string): boolean =>
  !EXCLUDED_NAMES.has(name) &&
  !EXCLUDED_EXTENSIONS.some((extension) =>
    name.toLowerCase().endsWith(extension),
  );

const assertProjectDir = (projectDir: string): void => {
  if (!existsSync(projectDir)) {
    throw new HttpError(
      ErrorCode.NotFoundError,
      "Project directory not found",
      404,
    );
  }
  if (!statSync(projectDir).isDirectory()) {
    throw new HttpError(
      ErrorCode.ParamsError,
      "Project path is not a directory",
    );
  }
};

const listEntries = async (
  projectDir: string,
  currentDir: string,
): Promise<DownloadEntry[]> => {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const results = await Promise.all(
    entries
      .filter((entry) => isIncludedPart(entry.name))
      .map(async (entry) => {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) return listEntries(projectDir, fullPath);
        return [
          {
            archivePath: relative(projectDir, fullPath),
            fullPath,
          },
        ];
      }),
  );
  return results.flat();
};

export const listProjectDownloadEntries = async (
  projectDir: string,
): Promise<DownloadEntry[]> => {
  assertProjectDir(projectDir);
  return listEntries(projectDir, projectDir);
};

export const createProjectZipStream = async (
  projectDir: string,
): Promise<Archiver> => {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const entries = await listProjectDownloadEntries(projectDir);
  for (const entry of entries) {
    archive.append(createReadStream(entry.fullPath), {
      name: entry.archivePath,
    });
  }
  await archive.finalize();
  return archive;
};
