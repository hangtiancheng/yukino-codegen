import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseStorageObjectKey } from "./storage-object-key.js";

export type StoragePutInput = Readonly<{
  contentType: string;
  key: string;
  value: Buffer;
}>;

export type StorageAdapter = Readonly<{
  putObject: (input: StoragePutInput) => Promise<string>;
}>;

export const createLocalStorageAdapter = (
  rootDir: string,
  publicBaseUrl: string,
): StorageAdapter => ({
  putObject: async (input) => {
    const key = parseStorageObjectKey(input.key);
    const filePath = join(rootDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.value);
    return `${publicBaseUrl.replace(/\/$/u, "")}/${key}`;
  },
});
