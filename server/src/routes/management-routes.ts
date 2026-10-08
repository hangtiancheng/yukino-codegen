import { Hono } from "hono";
import type { HealthService, MetricsService } from "../observability/index.js";
import type { AppHonoEnv } from "../session/index.js";

export type ManagementRoutesDeps = Readonly<{
  healthService: HealthService;
  metricsService: MetricsService;
}>;

export const createManagementRoutes = ({
  healthService,
  metricsService,
}: ManagementRoutesDeps) =>
  new Hono<AppHonoEnv>()
    .get("/prometheus", (c) => {
      c.header("Content-Type", metricsService.contentType);
      return c.text(metricsService.render());
    })
    .get("/health", async (c) => {
      const report = await healthService.check();
      return c.json(report, report.status === "up" ? 200 : 503);
    })
    .get("/info", (c) =>
      c.json({
        app: { name: "yukino-codegen", version: "0.1.0" },
      }),
    );

export type ManagementRoutes = ReturnType<typeof createManagementRoutes>;
