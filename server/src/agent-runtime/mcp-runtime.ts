import { type Config, MCP } from "@yukino.js/yukino";

export type McpTestResult = Readonly<{
  connected: boolean;
  toolCount: number;
  error?: string;
}>;

export const testMcpConnection = async (config: Config.MCPServerConfig): Promise<McpTestResult> => {
  const manager = new MCP.Manager.MCPManager();
  try {
    const result = await manager.connectAll([config]);
    const connected = result.servers.includes(config.name);
    const failure = result.errors.find((entry) => entry.serverName === config.name);
    return {
      connected,
      toolCount: result.tools.filter((tool) => tool.serverName === config.name).length,
      ...(failure !== undefined && { error: String(failure.error) }),
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "unknown error",
      toolCount: 0,
    };
  } finally {
    await manager.disconnectAll().catch(() => {});
  }
};
