import { type ServerType, serve } from "@hono/node-server";
import { createApp, createDefaultDependencies } from "./app.js";
import { env } from "./config/index.js";

const closeServer = (server: ServerType): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error?: Error) => {
      if (error === undefined) {
        resolve();
        return;
      }
      reject(error);
    });
  });

const dependencies = createDefaultDependencies();
const { app, injectWebSocket } = createApp(dependencies);
const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server listening on http://localhost:${String(info.port)}/${env.BASE_URL}`);
  },
);
injectWebSocket(server);

let shuttingDown = false;

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down gracefully`);
  try {
    await closeServer(server);
    await dependencies.shutdown?.();
  } catch (error: unknown) {
    console.error("Graceful shutdown failed", error);
    process.exitCode = 1;
  }
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
