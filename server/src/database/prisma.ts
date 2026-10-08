import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/index.js";
import { PrismaClient } from "../generated/prisma/client.js";

const defaultDatabaseUrl =
  "postgresql://root:pass@localhost:5432/yukino_codegen";

export const createPrismaClient = (
  databaseUrl = env.DATABASE_URL ?? defaultDatabaseUrl,
) => {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
};

export type PrismaDatabaseClient = ReturnType<typeof createPrismaClient>;
