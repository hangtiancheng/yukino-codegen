import { Group, Panel, Separator } from "react-resizable-panels";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Files,
  Search,
  TerminalSquare,
  X,
  RotateCw,
  LockKeyhole,
  Braces,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/shared/ui";
import { useWorkspace } from "./workspace-context";
import { languageForPath } from "./workspace-paths";
import type { WorkspaceNode } from "./workspace-tree";
import { CodeEditorPanel } from "./code-editor-panel";
import { FileExplorer } from "./file-explorer";
import { WorkspaceTerminal } from "./workspace-terminal";

export type CodeWorkspaceProps = {
  readonly active: boolean;
};

export function CodeWorkspace({ active }: CodeWorkspaceProps): ReactNode {
  const workspace = useWorkspace();
  const [explorerVisible, setExplorerVisible] = useState(true);
  const [terminalVisible, setTerminalVisible] = useState(true);
  const [terminalSession, setTerminalSession] = useState(0);
  const [quickOpen, setQuickOpen] = useState(false);
  const [query, setQuery] = useState("");
  const paths = useMemo(
    () =>
      filePaths(workspace.tree)
        .filter((path) => path.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 80),
    [workspace.tree, query],
  );
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        setQuickOpen(true);
      }
      if (event.key === "`") {
        event.preventDefault();
        setTerminalVisible((visible) => !visible);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
  const open = (path: string): void => {
    workspace.openFile(path);
    setQuickOpen(false);
    setQuery("");
  };
  const dirtyCount = workspace.openPaths.filter(
    (path) => workspace.getFileState(path)?.dirty,
  ).length;
  return (
    <div className="bg-ctp-base text-ctp-text flex h-full min-h-0 flex-col">
      <div className="border-ctp-crust bg-ctp-mantle flex h-9 shrink-0 items-center justify-center border-b px-3">
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          className="border-ctp-surface0 text-ctp-subtext0 flex h-6 w-full max-w-md items-center gap-2 rounded border px-2 text-xs"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Go to file…</span>
          <kbd>Ctrl/⌘ P</kbd>
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Editor panels"
          className="border-ctp-crust bg-ctp-mantle flex w-11 shrink-0 flex-col items-center gap-2 border-r py-2"
        >
          <Button
            variant={explorerVisible ? "secondary" : "ghost"}
            size="icon-sm"
            title="Explorer"
            aria-label="Toggle explorer"
            aria-pressed={explorerVisible}
            onClick={() => setExplorerVisible((visible) => !visible)}
          >
            <Files />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Go to file"
            aria-label="Go to file"
            onClick={() => setQuickOpen(true)}
          >
            <Search />
          </Button>
          <Button
            variant={terminalVisible ? "secondary" : "ghost"}
            size="icon-sm"
            title="Terminal (Ctrl/⌘ + `)"
            aria-label="Toggle terminal"
            aria-pressed={terminalVisible}
            onClick={() => setTerminalVisible((visible) => !visible)}
          >
            <TerminalSquare />
          </Button>
        </nav>
        <Group orientation="horizontal" className="h-full min-h-0 flex-1">
          {explorerVisible ? (
            <>
              <Panel
                id="workspace-explorer"
                defaultSize="24%"
                minSize="14%"
                className="bg-ctp-mantle min-h-0"
              >
                <FileExplorer />
              </Panel>
              <Separator className="bg-border hover:bg-primary/50 w-px cursor-col-resize" />
            </>
          ) : null}
          <Panel id="workspace-main" minSize="30%" className="min-h-0">
            <Group orientation="vertical" className="h-full min-h-0">
              <Panel
                id="workspace-editor"
                defaultSize="68%"
                minSize="20%"
                className="min-h-0"
              >
                <CodeEditorPanel active={active} />
              </Panel>
              {terminalVisible ? (
                <>
                  <Separator className="bg-border hover:bg-primary/50 h-px cursor-row-resize" />
                  <Panel
                    id="workspace-terminal"
                    defaultSize="32%"
                    minSize="10%"
                    className="min-h-0"
                  >
                    <div className="flex h-full min-h-0 flex-col">
                      <div className="border-ctp-crust bg-ctp-mantle flex h-8 shrink-0 items-center gap-2 border-b px-3 text-[11px]">
                        <span className="border-ctp-blue border-b py-1 font-medium">
                          TERMINAL
                        </span>
                        <span className="text-ctp-overlay0 ml-auto">bash</span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Restart terminal"
                          title="Restart terminal"
                          disabled={
                            !workspace.canEdit || workspace.agentRunning
                          }
                          onClick={() =>
                            setTerminalSession((session) => session + 1)
                          }
                        >
                          <RotateCw />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Hide terminal"
                          onClick={() => setTerminalVisible(false)}
                        >
                          <X />
                        </Button>
                      </div>
                      <div className="min-h-0 flex-1">
                        {workspace.canEdit ? (
                          <WorkspaceTerminal key={terminalSession} />
                        ) : (
                          <p className="text-ctp-overlay0 p-3 text-xs">
                            Terminal access requires owner or admin permissions.
                          </p>
                        )}
                      </div>
                    </div>
                  </Panel>
                </>
              ) : null}
            </Group>
          </Panel>
        </Group>
      </div>
      <div className="border-ctp-crust bg-ctp-mantle text-ctp-subtext0 flex h-6 shrink-0 items-center gap-3 border-t px-3 text-[11px]">
        <Braces className="size-3" />
        <span className="min-w-0 flex-1 truncate">
          {workspace.activePath ?? "Workspace"}
        </span>
        {dirtyCount > 0 ? <span>{dirtyCount} unsaved</span> : null}
        {!workspace.canEdit || workspace.agentRunning ? (
          <span className="flex items-center gap-1">
            <LockKeyhole className="size-3" />
            Read only
          </span>
        ) : (
          <span>UTF-8</span>
        )}
        {workspace.activePath === undefined ? null : (
          <span>{languageForPath(workspace.activePath)}</span>
        )}
      </div>
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Go to file</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search files by name…"
            aria-label="Search workspace files"
            onKeyDown={(event) => {
              if (event.key === "Enter" && paths[0] !== undefined)
                open(paths[0]);
            }}
          />
          <div
            className="max-h-80 overflow-auto"
            role="list"
            aria-label="Matching files"
          >
            {paths.length === 0 ? (
              <p className="text-muted-foreground p-2 text-sm">
                No files found.
              </p>
            ) : (
              paths.map((path) => (
                <button
                  key={path}
                  type="button"
                  role="listitem"
                  className="hover:bg-muted focus:bg-muted block w-full truncate rounded px-2 py-1.5 text-left font-mono text-xs"
                  onClick={() => open(path)}
                >
                  {path}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function filePaths(nodes: readonly WorkspaceNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === "directory" ? filePaths(node.children) : [node.path],
  );
}
