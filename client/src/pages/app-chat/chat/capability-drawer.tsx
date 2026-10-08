import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { AppId } from "@/shared/schemas";
import {
  Badge,
  Button,
  Checkbox,
  Field,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import {
  clearAgentMemory,
  createMcpServer,
  deleteMcpServer,
  getAgentSettings,
  listAgentMemory,
  listAgentSessions,
  listAgentSkills,
  listMcpServers,
  mcpTransports,
  type McpCreateInput,
  type McpTransport,
  PERMISSION_MODES,
  type PermissionMode,
  reloadAgentSkills,
  resumeAgentSession,
  testMcpServer,
  updateAgentSettings,
} from "./capability-api";

const formatPermissionMode = (mode: string): string =>
  mode.replace(/_/g, " ").toLowerCase();

export type CapabilityDrawerProps = {
  readonly appId: AppId;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly canManage: boolean;
  readonly onNewSession: () => void;
  readonly onPermissionModeChange?: (mode: PermissionMode) => void;
};

export function CapabilityDrawer({
  appId,
  open,
  onClose,
  canManage,
  onNewSession,
  onPermissionModeChange,
}: CapabilityDrawerProps): ReactNode {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base">Capabilities</SheetTitle>
        </SheetHeader>
        <Tabs
          defaultValue="mcp"
          className="min-h-0 flex-1 gap-0 overflow-hidden"
        >
          <TabsList className="mx-4 mt-3 mb-1 w-auto justify-start">
            <TabsTrigger value="mcp">MCP</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
            <TabsTrigger value="memory">Memory</TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <TabsContent value="mcp">
              <McpTab appId={appId} canManage={canManage} />
            </TabsContent>
            <TabsContent value="skills">
              <SkillsTab appId={appId} canManage={canManage} />
            </TabsContent>
            <TabsContent value="settings">
              <SettingsTab
                appId={appId}
                canManage={canManage}
                onPermissionModeChange={onPermissionModeChange}
              />
            </TabsContent>
            <TabsContent value="sessions">
              <SessionsTab
                appId={appId}
                canManage={canManage}
                onNewSession={onNewSession}
              />
            </TabsContent>
            <TabsContent value="memory">
              <MemoryTab appId={appId} canManage={canManage} />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function useAsync<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    load()
      .then((value) => setData(value))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Request failed"),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, loading, error, reload, setData };
}

function StatusLine({
  loading,
  error,
}: {
  readonly loading: boolean;
  readonly error: string | undefined;
}): ReactNode {
  if (loading) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner aria-hidden="true" /> Loading…
      </p>
    );
  }
  if (error !== undefined)
    return <p className="text-destructive text-sm">{error}</p>;
  return null;
}

function McpTab({
  appId,
  canManage,
}: {
  readonly appId: AppId;
  readonly canManage: boolean;
}): ReactNode {
  const { data, loading, error, reload } = useAsync(() =>
    listMcpServers(appId),
  );
  const [adding, setAdding] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  if (!canManage) {
    return (
      <p className="text-muted-foreground text-sm">
        Owner or admin access required.
      </p>
    );
  }

  const runTest = (id: string): void => {
    setTestResult((current) => ({ ...current, [id]: "testing…" }));
    testMcpServer(appId, id)
      .then((result) =>
        setTestResult((current) => ({
          ...current,
          [id]: result.connected
            ? `connected · ${String(result.toolCount)} tools`
            : (result.error ?? "failed"),
        })),
      )
      .catch((cause: unknown) =>
        setTestResult((current) => ({
          ...current,
          [id]: cause instanceof Error ? cause.message : "failed",
        })),
      );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">MCP servers</h3>
        <div className="flex gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={reload}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setAdding((value) => !value)}
          >
            <Plus data-icon="inline-start" />
            Add
          </Button>
        </div>
      </div>
      <StatusLine loading={loading} error={error} />
      {adding ? (
        <McpForm
          appId={appId}
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      ) : null}
      <ul className="flex flex-col gap-2">
        {(data ?? []).map((server) => (
          <li
            key={server.id}
            className="border-border rounded-lg border p-2.5 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{server.name}</span>
              <span className="text-muted-foreground/70 text-[10px] uppercase">
                {server.transport}
              </span>
              <Badge
                variant={
                  server.status === "CONNECTED"
                    ? "success"
                    : server.status === "ERROR"
                      ? "destructive"
                      : "secondary"
                }
                className="ml-auto text-[10px]"
              >
                {server.status.toLowerCase()}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 truncate font-mono text-xs">
              {server.command ?? server.url ?? ""}
            </p>
            {testResult[server.id] !== undefined ? (
              <p className="text-muted-foreground mt-1 text-xs">
                {testResult[server.id]}
              </p>
            ) : null}
            <div className="mt-2 flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => runTest(server.id)}
              >
                Test
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete ${server.name}`}
                onClick={() => {
                  void deleteMcpServer(appId, server.id).then(reload);
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
        {!loading && (data ?? []).length === 0 ? (
          <li className="text-muted-foreground text-sm">
            No MCP servers configured.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

type KeyValue = { key: string; value: string };

function McpForm({
  appId,
  onDone,
}: {
  readonly appId: AppId;
  readonly onDone: () => void;
}): ReactNode {
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("stdio");
  const [command, setCommand] = useState("");
  const [url, setUrl] = useState("");
  const [secrets, setSecrets] = useState<KeyValue[]>([]);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = (): void => {
    setSaving(true);
    setError(undefined);
    const secretMap = Object.fromEntries(
      secrets
        .filter((row) => row.key.trim().length > 0)
        .map((row) => [row.key.trim(), row.value]),
    );
    const [cmd, ...args] = command.trim().split(/\s+/u).filter(Boolean);
    const body: McpCreateInput = {
      name: name.trim(),
      transport,
      ...(transport === "stdio"
        ? {
            command: cmd ?? "",
            args,
            ...(Object.keys(secretMap).length > 0 && { env: secretMap }),
          }
        : {
            url: url.trim(),
            ...(Object.keys(secretMap).length > 0 && { headers: secretMap }),
          }),
    };
    createMcpServer(appId, body)
      .then(() => onDone())
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "Failed to create server",
        ),
      )
      .finally(() => setSaving(false));
  };

  return (
    <div className="border-border bg-muted/20 flex flex-col gap-2 rounded-lg border p-3">
      <Input
        placeholder="Name (letters, digits, . _ -)"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Select
        items={mcpTransports.map((item) => ({ value: item, label: item }))}
        value={transport}
        onValueChange={(value) =>
          setTransport(mcpTransports.find((item) => item === value) ?? "stdio")
        }
      >
        <SelectTrigger className="w-full" aria-label="Transport">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {mcpTransports.map((value) => (
            <SelectItem key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {transport === "stdio" ? (
        <Input
          className="font-mono"
          placeholder="Command, e.g. npx -y @modelcontextprotocol/server-filesystem ."
          value={command}
          onChange={(event) => setCommand(event.target.value)}
        />
      ) : (
        <Input
          className="font-mono"
          placeholder="https://server.example.com/sse"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      )}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            {transport === "stdio" ? "Env" : "Headers"} (secret)
          </span>
          <Button
            type="button"
            variant="link"
            size="xs"
            className="text-primary"
            onClick={() =>
              setSecrets((rows) => [...rows, { key: "", value: "" }])
            }
          >
            Add entry
          </Button>
        </div>
        {secrets.map((row, index) => (
          <div key={index} className="flex gap-1">
            <Input
              className="w-1/3 text-xs"
              placeholder="KEY"
              value={row.key}
              onChange={(event) =>
                setSecrets((rows) =>
                  rows.map((item, i) =>
                    i === index ? { ...item, key: event.target.value } : item,
                  ),
                )
              }
            />
            <Input
              className="flex-1 text-xs"
              placeholder="value"
              type="password"
              value={row.value}
              onChange={(event) =>
                setSecrets((rows) =>
                  rows.map((item, i) =>
                    i === index ? { ...item, value: event.target.value } : item,
                  ),
                )
              }
            />
          </div>
        ))}
      </div>
      {error !== undefined ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : null}
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={saving || name.trim().length === 0}
          onClick={submit}
        >
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Create
        </Button>
      </div>
    </div>
  );
}

function SkillsTab({
  appId,
  canManage,
}: {
  readonly appId: AppId;
  readonly canManage: boolean;
}): ReactNode {
  const { data, loading, error, setData } = useAsync(() =>
    listAgentSkills(appId),
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Skills ({(data ?? []).length})
        </h3>
        {canManage ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void reloadAgentSkills(appId).then(setData);
            }}
          >
            <RefreshCw data-icon="inline-start" />
            Reload
          </Button>
        ) : null}
      </div>
      <StatusLine loading={loading} error={error} />
      <ul className="flex flex-col gap-1.5">
        {(data ?? []).map((skill) => (
          <li
            key={skill.name}
            className="border-border rounded-lg border p-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">/{skill.name}</span>
              <span className="text-muted-foreground/70 text-[10px] uppercase">
                {skill.mode}
              </span>
            </div>
            {skill.description.length > 0 ? (
              <p className="text-muted-foreground mt-0.5 text-xs">
                {skill.description}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsTab({
  appId,
  canManage,
  onPermissionModeChange,
}: {
  readonly appId: AppId;
  readonly canManage: boolean;
  readonly onPermissionModeChange?:
    ((mode: PermissionMode) => void) | undefined;
}): ReactNode {
  const { data, loading, error, setData } = useAsync(() =>
    getAgentSettings(appId),
  );
  const [saving, setSaving] = useState(false);

  const patch = (body: Parameters<typeof updateAgentSettings>[1]): void => {
    setSaving(true);
    updateAgentSettings(appId, body)
      .then((next) => {
        setData(next);
        onPermissionModeChange?.(next.permissionMode);
      })
      .catch((cause: unknown) =>
        toast.error(
          cause instanceof Error ? cause.message : "Failed to update settings",
        ),
      )
      .finally(() => setSaving(false));
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">Settings</h3>
      <StatusLine loading={loading} error={error} />
      {data !== undefined ? (
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel className="text-muted-foreground text-xs">
              Permission mode
            </FieldLabel>
            <Select
              items={PERMISSION_MODES.map((mode) => ({
                value: mode,
                label: formatPermissionMode(mode),
              }))}
              value={data.permissionMode}
              disabled={!canManage || saving}
              onValueChange={(value) =>
                patch({
                  permissionMode:
                    PERMISSION_MODES.find((mode) => mode === value) ??
                    "BYPASS_PERMISSIONS",
                })
              }
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERMISSION_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {formatPermissionMode(mode)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {(["sandboxEnabled", "memoryEnabled", "hooksEnabled"] as const).map(
            (key) => (
              <Field key={key} orientation="horizontal">
                <Checkbox
                  checked={data[key]}
                  disabled={!canManage || saving}
                  onCheckedChange={(checked) =>
                    patch({ [key]: checked === true })
                  }
                />
                <FieldLabel className="text-sm font-normal">
                  {key.replace(/Enabled$/, "")}
                </FieldLabel>
              </Field>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function SessionsTab({
  appId,
  canManage,
  onNewSession,
}: {
  readonly appId: AppId;
  readonly canManage: boolean;
  readonly onNewSession: () => void;
}): ReactNode {
  const { data, loading, error, reload } = useAsync(() =>
    listAgentSessions(appId),
  );
  const [resumingId, setResumingId] = useState<string>();

  const resume = async (sessionId: string): Promise<void> => {
    setResumingId(sessionId);
    try {
      await resumeAgentSession(appId, sessionId);
      reload();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Unable to resume session",
      );
    } finally {
      setResumingId(undefined);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Sessions</h3>
        {canManage ? (
          <Button size="sm" variant="secondary" onClick={onNewSession}>
            <Plus data-icon="inline-start" />
            New
          </Button>
        ) : null}
      </div>
      <StatusLine loading={loading} error={error} />
      <ul className="flex flex-col gap-1.5">
        {(data ?? []).map((session) => (
          <li
            key={session.id}
            className="border-border rounded-lg border p-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="truncate font-mono text-xs">
                {session.id.slice(0, 8)}
              </span>
              <span className="text-muted-foreground/70 text-[10px] uppercase">
                {session.status.toLowerCase()}
              </span>
              {canManage ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  disabled={
                    resumingId !== undefined ||
                    session.status === "RUNNING" ||
                    session.status === "WAITING"
                  }
                  onClick={() => {
                    void resume(session.id);
                  }}
                >
                  {resumingId === session.id ? "Resuming…" : "Resume"}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MemoryTab({
  appId,
  canManage,
}: {
  readonly appId: AppId;
  readonly canManage: boolean;
}): ReactNode {
  const { data, loading, error, reload } = useAsync(() =>
    listAgentMemory(appId),
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Memory ({(data ?? []).length})
        </h3>
        {canManage && (data ?? []).length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void clearAgentMemory(appId).then(reload);
            }}
          >
            <Trash2 data-icon="inline-start" />
            Clear
          </Button>
        ) : null}
      </div>
      <StatusLine loading={loading} error={error} />
      <ul className="flex flex-col gap-1.5">
        {(data ?? []).map((file) => (
          <li
            key={file.path}
            className="border-border rounded-lg border p-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{file.name}</span>
              <span className="text-muted-foreground/70 text-[10px] uppercase">
                {file.type}
              </span>
            </div>
            {file.description.length > 0 ? (
              <p className="text-muted-foreground mt-0.5 text-xs">
                {file.description}
              </p>
            ) : null}
          </li>
        ))}
        {!loading && (data ?? []).length === 0 ? (
          <li className="text-muted-foreground text-sm">No memory files.</li>
        ) : null}
      </ul>
    </div>
  );
}
