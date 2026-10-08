import { Client, type ClientOptions } from "minio";
import type { StorageAdapter } from "./storage-adapter.js";
import { parseStorageObjectKey } from "./storage-object-key.js";

type MinioMetadata = Readonly<Record<string, string>>;

export type MinioStorageClient = Readonly<{
  bucketExists: (bucketName: string) => Promise<boolean>;
  putObject: (
    bucketName: string,
    objectName: string,
    value: Buffer,
    size: number,
    metaData: MinioMetadata,
  ) => Promise<unknown>;
  statObject: (bucketName: string, objectName: string) => Promise<unknown>;
}>;

export type MinioStorageAdapterConfig = Readonly<{
  accessKey: string;
  bucket: string;
  endPoint: string;
  port?: number;
  publicBaseUrl: string;
  region?: string;
  secretKey: string;
  useSSL: boolean;
}>;

const createClientOptions = (config: MinioStorageAdapterConfig): ClientOptions => ({
  accessKey: config.accessKey,
  endPoint: config.endPoint,
  pathStyle: true,
  secretKey: config.secretKey,
  useSSL: config.useSSL,
  ...(config.port !== undefined && { port: config.port }),
  ...(config.region !== undefined && { region: config.region }),
});

export const createMinioStorageClient = (config: MinioStorageAdapterConfig): MinioStorageClient =>
  new Client(createClientOptions(config));

export const createMinioSdkStorageAdapter = (
  client: MinioStorageClient,
  bucket: string,
  publicBaseUrl: string,
): StorageAdapter => ({
  putObject: async (input) => {
    const key = parseStorageObjectKey(input.key);
    await client.putObject(bucket, key, input.value, input.value.length, {
      "Content-Type": input.contentType,
    });
    return `${publicBaseUrl.replace(/\/$/u, "")}/${key}`;
  },
});
