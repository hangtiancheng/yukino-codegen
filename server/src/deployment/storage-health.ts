import { randomUUID } from "node:crypto";
import type { HealthCheck } from "../observability/index.js";
import type { MinioStorageClient } from "./minio-storage-adapter.js";
import type { StorageAdapter } from "./storage-adapter.js";

export type StorageHealthProbe = Readonly<{
  check: () => Promise<void>;
}>;

export const createStorageHealthCheck = (probe: StorageHealthProbe): HealthCheck => ({
  name: "storage",
  probe: async () => {
    try {
      await probe.check();
      return "up";
    } catch {
      return "down";
    }
  },
});

export const createStorageWriteHealthProbe = (storage: StorageAdapter): StorageHealthProbe => ({
  check: async () => {
    await storage.putObject({
      contentType: "text/plain",
      key: `health/${randomUUID()}.txt`,
      value: Buffer.from("ok"),
    });
  },
});

export const createMinioStorageHealthProbe = (
  client: MinioStorageClient,
  bucket: string,
): StorageHealthProbe => ({
  check: async () => {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      throw new Error("Object storage bucket does not exist");
    }
  },
});
