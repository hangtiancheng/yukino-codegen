import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createSuccessResponse } from "../common/index.js";
import {
  type AppHonoEnv,
  issueSession,
  requireAdmin,
  requireLogin,
  revokeSession,
  type SessionStore,
} from "../session/index.js";
import type { UserService } from "../user/index.js";
import {
  userAddSchema,
  userIdBodySchema,
  userIdQuerySchema,
  userLoginSchema,
  userPageQuerySchema,
  userRegisterSchema,
  userUpdateSchema,
} from "../user/index.js";

export type UserRoutesDeps = Readonly<{
  sessionStore: SessionStore;
  userService: UserService;
}>;

export const createUserRoutes = ({ sessionStore, userService }: UserRoutesDeps) =>
  new Hono<AppHonoEnv>()
    .post("/register", zValidator("json", userRegisterSchema), async (c) => {
      const id = await userService.register(c.req.valid("json"));
      return c.json(createSuccessResponse(id));
    })
    .post("/login", zValidator("json", userLoginSchema), async (c) => {
      const user = await userService.login(c.req.valid("json"));
      await issueSession(c, sessionStore, user);
      return c.json(createSuccessResponse(user));
    })
    .post("/logout", requireLogin, async (c) => {
      const ok = await revokeSession(c, sessionStore);
      return c.json(createSuccessResponse(ok));
    })
    .get("/get/login", requireLogin, (c) => {
      const user = c.get("user");
      return c.json(createSuccessResponse(user));
    })
    .get("/get", requireAdmin, zValidator("query", userIdQuerySchema), async (c) => {
      const { id } = c.req.valid("query");
      const user = await userService.getUserById(id);
      return c.json(createSuccessResponse(user));
    })
    .get("/get/vo", zValidator("query", userIdQuerySchema), async (c) => {
      const { id } = c.req.valid("query");
      const vo = await userService.getUserVoById(id);
      return c.json(createSuccessResponse(vo));
    })
    .post("/add", requireAdmin, zValidator("json", userAddSchema), async (c) => {
      const id = await userService.addUser(c.req.valid("json"));
      return c.json(createSuccessResponse(id));
    })
    .post("/update", requireAdmin, zValidator("json", userUpdateSchema), async (c) => {
      const ok = await userService.updateUser(c.req.valid("json"));
      return c.json(createSuccessResponse(ok));
    })
    .post("/delete", requireAdmin, zValidator("json", userIdBodySchema), async (c) => {
      const { id } = c.req.valid("json");
      const ok = await userService.deleteUser(id);
      return c.json(createSuccessResponse(ok));
    })
    .post("/list/page/vo", requireAdmin, zValidator("json", userPageQuerySchema), async (c) => {
      const result = await userService.listUserVoByPage(c.req.valid("json"));
      const records = result.records.map((record) => ({
        ...record,
        createTime: record.createTime.toISOString(),
      }));
      return c.json(createSuccessResponse({ ...result, records }));
    });

export type UserRoutes = ReturnType<typeof createUserRoutes>;
