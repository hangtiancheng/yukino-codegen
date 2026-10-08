import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import {
  Button,
  ConfirmationDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/shared/ui";
import { parentPath } from "./workspace-paths";
import { useWorkspace } from "./workspace-context";
import type { WorkspaceNode } from "./workspace-tree";

type NamePrompt = {
  readonly kind: "file" | "folder" | "rename";
  readonly targetPath: string;
  readonly initialValue: string;
};

/**
 * Recursive project explorer with create/rename/delete/refresh actions and
 * dirty/conflict badges. All mutations are disabled while the agent is running
 * so its file writes are not raced by the user.
 */
export function FileExplorer(): ReactNode {
  const workspace = useWorkspace();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selectedDir, setSelectedDir] = useState("");
  const [prompt, setPrompt] = useState<NamePrompt>();
  const [deleteTarget, setDeleteTarget] = useState<string>();
  const disabled = workspace.agentRunning || workspace.busy;

  const runMutation = (operation: Promise<void>): void => {
    void operation.catch((cause: unknown) => {
      toast.error(
        cause instanceof Error ? cause.message : "Workspace operation failed",
      );
    });
  };

  const toggle = (path: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const submitPrompt = (name: string): void => {
    if (prompt === undefined) return;
    const trimmed = name.trim();
    const current = prompt;
    setPrompt(undefined);
    if (trimmed === "") return;
    if (current.kind === "file") {
      runMutation(workspace.createFile(selectedDir, trimmed));
    } else if (current.kind === "folder") {
      runMutation(workspace.createDirectory(selectedDir, trimmed));
    } else {
      if (trimmed === current.targetPath) return;
      runMutation(workspace.renamePath(current.targetPath, trimmed));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-ctp-crust flex items-center justify-between gap-1 border-b px-2 py-1.5">
        <span className="text-ctp-overlay0 truncate text-xs font-medium">
          {selectedDir === "" ? "Explorer" : selectedDir}
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton
            label="New file"
            onClick={() =>
              setPrompt({ kind: "file", targetPath: "", initialValue: "" })
            }
            disabled={disabled}
          >
            <FilePlus />
          </IconButton>
          <IconButton
            label="New folder"
            onClick={() =>
              setPrompt({ kind: "folder", targetPath: "", initialValue: "" })
            }
            disabled={disabled}
          >
            <FolderPlus />
          </IconButton>
          <IconButton
            label="Refresh"
            onClick={workspace.refreshTree}
            disabled={disabled}
          >
            <RefreshCw />
          </IconButton>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {workspace.treeLoading && workspace.tree.length === 0 ? (
          <p className="text-ctp-overlay0 px-3 py-2 text-xs">Loading…</p>
        ) : null}
        {!workspace.treeLoading && workspace.tree.length === 0 ? (
          <p className="text-ctp-overlay0 px-3 py-2 text-xs">No files yet.</p>
        ) : null}
        <ul>
          {workspace.tree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              collapsed={collapsed}
              selectedDir={selectedDir}
              activePath={workspace.activePath}
              onToggle={toggle}
              onSelectDir={setSelectedDir}
              onOpen={workspace.openFile}
              onRename={(path) =>
                setPrompt({
                  kind: "rename",
                  targetPath: path,
                  initialValue: path,
                })
              }
              onDelete={setDeleteTarget}
              getBadge={(path) => {
                const file = workspace.getFileState(path);
                if (file?.conflict !== undefined) return "conflict";
                if (file?.dirty === true) return "dirty";
                return "none";
              }}
            />
          ))}
        </ul>
      </div>
      <NamePromptDialog prompt={prompt} onSubmit={submitPrompt} />
      <ConfirmationDialog
        open={deleteTarget !== undefined}
        title="Delete file"
        description={
          deleteTarget === undefined
            ? ""
            : `Delete ${deleteTarget}? This cannot be undone.`
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget !== undefined) {
            runMutation(workspace.deletePath(deleteTarget));
          }
          setDeleteTarget(undefined);
        }}
        onCancel={() => setDeleteTarget(undefined)}
      />
    </div>
  );
}

function NamePromptDialog({
  prompt,
  onSubmit,
}: {
  readonly prompt: NamePrompt | undefined;
  readonly onSubmit: (name: string) => void;
}): ReactNode {
  const [value, setValue] = useState("");
  const [openKey, setOpenKey] = useState<string>();

  const dialogKey =
    prompt === undefined ? undefined : `${prompt.kind}:${prompt.targetPath}`;
  if (dialogKey !== openKey) {
    setOpenKey(dialogKey);
    if (dialogKey !== undefined) setValue(prompt?.initialValue ?? "");
  }

  const title =
    prompt?.kind === "file"
      ? "New file"
      : prompt?.kind === "folder"
        ? "New folder"
        : "Rename";

  return (
    <Dialog
      open={prompt !== undefined}
      onOpenChange={(next) => {
        if (!next) onSubmit("");
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {prompt?.kind === "rename"
              ? "Enter the new name for this path."
              : "Relative to the selected directory."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(value);
          }}
        >
          <Input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={
              prompt?.kind === "folder" ? "folder-name" : "file-name.tsx"
            }
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onSubmit("")}>
              Cancel
            </Button>
            <Button type="submit" disabled={value.trim().length === 0}>
              {prompt?.kind === "rename" ? "Rename" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type BadgeKind = "none" | "dirty" | "conflict";

type TreeItemProps = {
  readonly node: WorkspaceNode;
  readonly depth: number;
  readonly collapsed: ReadonlySet<string>;
  readonly selectedDir: string;
  readonly activePath: string | undefined;
  readonly onToggle: (path: string) => void;
  readonly onSelectDir: (path: string) => void;
  readonly onOpen: (path: string) => void;
  readonly onRename: (path: string) => void;
  readonly onDelete: (path: string) => void;
  readonly getBadge: (path: string) => BadgeKind;
};

function TreeItem({
  node,
  depth,
  collapsed,
  selectedDir,
  activePath,
  onToggle,
  onSelectDir,
  onOpen,
  onRename,
  onDelete,
  getBadge,
}: TreeItemProps): ReactNode {
  const indent = { paddingLeft: `${depth * 11 + 8}px` };
  if (node.kind === "directory") {
    const isCollapsed = collapsed.has(node.path);
    return (
      <li>
        <div
          className={cn(
            "group flex items-center gap-1 py-1 pr-2 text-sm",
            "hover:bg-ctp-crust",
            selectedDir === node.path && "bg-ctp-crust/70",
          )}
          style={indent}
        >
          <button
            type="button"
            className="text-ctp-text flex min-w-0 flex-1 items-center gap-1 text-left"
            onClick={() => {
              onToggle(node.path);
              onSelectDir(node.path);
            }}
          >
            {isCollapsed ? (
              <ChevronRight
                className="text-ctp-overlay0 size-4 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <ChevronDown
                className="text-ctp-overlay0 size-4 shrink-0"
                aria-hidden="true"
              />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          <NodeActions
            onRename={() => onRename(node.path)}
            onDelete={() => onDelete(node.path)}
          />
        </div>
        {isCollapsed ? null : (
          <ul>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                collapsed={collapsed}
                selectedDir={selectedDir}
                activePath={activePath}
                onToggle={onToggle}
                onSelectDir={onSelectDir}
                onOpen={onOpen}
                onRename={onRename}
                onDelete={onDelete}
                getBadge={getBadge}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }
  const badge = getBadge(node.path);
  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 py-1 pr-2 text-sm",
          "hover:bg-ctp-crust",
          activePath === node.path && "bg-ctp-surface0/70",
        )}
        style={indent}
      >
        <button
          type="button"
          className="text-ctp-text flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => {
            onSelectDir(parentPath(node.path));
            onOpen(node.path);
          }}
        >
          <span className="truncate">{node.name}</span>
          {badge === "dirty" ? (
            <span
              className="bg-ctp-yellow size-1.5 shrink-0 rounded-full"
              aria-label="Unsaved changes"
            />
          ) : null}
          {badge === "conflict" ? (
            <span className="text-ctp-red shrink-0 text-[10px] font-semibold uppercase">
              conflict
            </span>
          ) : null}
        </button>
        <NodeActions
          onRename={() => onRename(node.path)}
          onDelete={() => onDelete(node.path)}
        />
      </div>
    </li>
  );
}

function NodeActions({
  onRename,
  onDelete,
}: {
  readonly onRename: () => void;
  readonly onDelete: () => void;
}): ReactNode {
  return (
    <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
      <IconButton label="Rename" onClick={onRename} disabled={false}>
        <Pencil />
      </IconButton>
      <IconButton label="Delete" onClick={onDelete} disabled={false}>
        <Trash2 />
      </IconButton>
    </span>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="hover:bg-ctp-crust hover:text-ctp-text text-ctp-overlay0"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
