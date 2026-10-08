import { z } from "zod";

const storageObjectKeySchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^(?!\/)(?!.*\/\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u);

export const parseStorageObjectKey = (key: string): string => storageObjectKeySchema.parse(key);
