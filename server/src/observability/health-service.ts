export type HealthStatus = "down" | "up";

export type HealthCheck = Readonly<{
  name: "database" | "modelProvider" | "redis" | "storage";
  probe: () => Promise<HealthStatus>;
}>;

export type HealthReport = Readonly<{
  checks: Readonly<Record<HealthCheck["name"], HealthStatus>>;
  status: HealthStatus;
}>;

export type HealthService = Readonly<{
  check: () => Promise<HealthReport>;
}>;

type HealthCheckResult = readonly [HealthCheck["name"], HealthStatus];

const emptyChecks: HealthReport["checks"] = {
  database: "up",
  modelProvider: "up",
  redis: "up",
  storage: "up",
};

export const createHealthService = (checks: readonly HealthCheck[] = []): HealthService => ({
  check: async () => {
    const entries = await Promise.all(
      checks.map(async (check): Promise<HealthCheckResult> => [check.name, await check.probe()]),
    );
    const result: Record<HealthCheck["name"], HealthStatus> = {
      ...emptyChecks,
    };
    for (const [name, status] of entries) {
      result[name] = status;
    }
    return {
      checks: result,
      status: Object.values(result).every((status) => status === "up") ? "up" : "down",
    };
  },
});

export const createStaticHealthCheck = (
  name: HealthCheck["name"],
  status: HealthStatus = "up",
): HealthCheck => ({
  name,
  probe: async () => status,
});
