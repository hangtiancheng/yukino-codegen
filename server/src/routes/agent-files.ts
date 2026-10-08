import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import {
  buildAppFileTree,
  createProjectDirectory,
  deleteProjectEntry,
  type RuntimeManager,
  renameProjectEntry,
  writeProjectFile,
} from "../agent-runtime/index.js";
import type { AppService } from "../app-module/index.js";
import { createSuccessResponse } from "../common/index.js";
import type { AppHonoEnv } from "../session/index.js";
import { requireWritable, resolveAppAccess } from "./agent-shared.js";

export type AgentFileRoutesDeps = Readonly<{
  manager: RuntimeManager;
  appService: AppService;
}>;

const pathSchema = z.string().min(1).max(1024);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

const writeFileSchema = z.object({
  path: pathSchema,
  contents: z.string().max(10 * 1024 * 1024),
  encoding: z.enum(["utf8", "base64"]).optional(),
  expectedHash: hashSchema.nullable().optional(),
});

const directorySchema = z.object({ path: pathSchema });
const renameSchema = z.object({
  from: pathSchema,
  to: pathSchema,
  expectedHash: hashSchema.nullable().optional(),
});
const deleteSchema = z.object({
  path: pathSchema,
  recursive: z.boolean().optional(),
  expectedHash: hashSchema.nullable().optional(),
});

/**
 * Project file API under `/app/files/:appId`. The GET tree (each file annotated
 * with a sha256) is available to any authenticated observer. Mutations are
 * owner/admin only, run under the same lock as agent turns, and broadcast a
 * files_changed event so connected clients refresh.
 */
export const registerAgentFileRoutes = (
  router: Hono<AppHonoEnv>,
  deps: AgentFileRoutesDeps,
): void => {
  const { appService, manager } = deps;

  router
    .get("/files/:appId", async (c) => {
      const access = await resolveAppAccess(c, appService);
      const tree = await buildAppFileTree(manager.workDirFor(access.appId));
      return c.json(createSuccessResponse(tree));
    })
    .put("/files/:appId/file", zValidator("json", writeFileSchema), async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      const input = c.req.valid("json");
      const runtime = await manager.getOrCreate(access.ownerId, access.appId);
      const result = await runtime.runExclusive((workDir) => writeProjectFile(workDir, input));
      if (result.conflict) {
        return c.json(
          createSuccessResponse({
            status: "conflict",
            conflict: {
              path: result.path,
              expectedHash: result.expectedHash,
              actualHash: result.actualHash,
            },
          }),
        );
      }
      runtime.notifyFilesChanged([result.path]);
      return c.json(
        createSuccessResponse({ status: "ok", result: { path: result.path, hash: result.hash } }),
      );
    })
    .post("/files/:appId/directory", zValidator("json", directorySchema), async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      const { path } = c.req.valid("json");
      const runtime = await manager.getOrCreate(access.ownerId, access.appId);
      await runtime.runExclusive((workDir) => createProjectDirectory(workDir, path));
      runtime.notifyFilesChanged([path]);
      return c.json(createSuccessResponse({ status: "ok", result: { path } }));
    })
    .post("/files/:appId/rename", zValidator("json", renameSchema), async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      const input = c.req.valid("json");
      const runtime = await manager.getOrCreate(access.ownerId, access.appId);
      const result = await runtime.runExclusive((workDir) => renameProjectEntry(workDir, input));
      if (result.conflict) {
        return c.json(createSuccessResponse({ status: "conflict", conflict: result }));
      }
      runtime.notifyFilesChanged([input.from, input.to]);
      return c.json(createSuccessResponse({ status: "ok", result }));
    })
    .delete("/files/:appId/entry", zValidator("json", deleteSchema), async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      const input = c.req.valid("json");
      const runtime = await manager.getOrCreate(access.ownerId, access.appId);
      const result = await runtime.runExclusive((workDir) => deleteProjectEntry(workDir, input));
      if (result.conflict) {
        return c.json(createSuccessResponse({ status: "conflict", conflict: result }));
      }
      runtime.notifyFilesChanged([input.path]);
      return c.json(createSuccessResponse({ status: "ok", result }));
    });
};
