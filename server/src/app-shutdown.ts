type RedisShutdownClient = Readonly<{
  quit: () => Promise<unknown>;
}>;

type DatabaseShutdownClient = Readonly<{
  $disconnect: () => Promise<void>;
}>;

export type DefaultShutdownInput = Readonly<{
  database: DatabaseShutdownClient;
  redisClient?: RedisShutdownClient;
}>;

export const createDefaultShutdown =
  (input: DefaultShutdownInput): (() => Promise<void>) =>
  async () => {
    if (input.redisClient !== undefined) {
      await input.redisClient.quit();
    }
    await input.database.$disconnect();
  };
