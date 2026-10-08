import { env } from "./config/index.js";
import {
  createLocalStorageAdapter,
  createMinioSdkStorageAdapter,
  createMinioStorageClient,
  createMinioStorageHealthProbe,
  createStorageWriteHealthProbe,
  type MinioStorageAdapterConfig,
  type StorageAdapter,
  type StorageHealthProbe,
} from "./deployment/index.js";

export type ConfiguredStorage = Readonly<{
  healthProbe: StorageHealthProbe;
  storage: StorageAdapter;
}>;

const createMinioStorageConfig = (): MinioStorageAdapterConfig => {
  if (env.STORAGE_MINIO_ACCESS_KEY === undefined || env.STORAGE_MINIO_SECRET_KEY === undefined) {
    throw new Error("MinIO storage requires access key and secret key");
  }
  return {
    accessKey: env.STORAGE_MINIO_ACCESS_KEY,
    bucket: env.STORAGE_MINIO_BUCKET,
    endPoint: env.STORAGE_MINIO_ENDPOINT,
    publicBaseUrl: env.STORAGE_MINIO_PUBLIC_BASE_URL,
    secretKey: env.STORAGE_MINIO_SECRET_KEY,
    useSSL: env.STORAGE_MINIO_USE_SSL,
    ...(env.STORAGE_MINIO_PORT !== undefined && { port: env.STORAGE_MINIO_PORT }),
    ...(env.STORAGE_MINIO_REGION !== undefined && { region: env.STORAGE_MINIO_REGION }),
  };
};

export const createConfiguredStorage = (): ConfiguredStorage => {
  if (env.STORAGE_DRIVER === "local") {
    const storage = createLocalStorageAdapter(
      env.STORAGE_LOCAL_ROOT_DIR,
      env.STORAGE_LOCAL_PUBLIC_BASE_URL,
    );
    return { healthProbe: createStorageWriteHealthProbe(storage), storage };
  }
  const minioConfig = createMinioStorageConfig();
  const client = createMinioStorageClient(minioConfig);
  return {
    healthProbe: createMinioStorageHealthProbe(client, minioConfig.bucket),
    storage: createMinioSdkStorageAdapter(client, minioConfig.bucket, minioConfig.publicBaseUrl),
  };
};
