import type { RefObject } from "react";
import type { VisualEditorElementInfo } from "@/shared/schemas";
import type { PreviewRuntimeError } from "../build-error-context";
import type { PreviewStatus } from "../preview-status";
import type { WorkspaceNode } from "./workspace-tree";

export type WorkspaceConflict = {
  readonly path: string;
  readonly base: string;
  readonly local: string;
  readonly server: string;
};

export type WorkspaceFileState = {
  readonly path: string;
  readonly binary: boolean;
  readonly contents: string;
  readonly baseText: string;
  readonly baseHash: string;
  readonly serverHash: string | null;
  readonly dirty: boolean;
  readonly revision: number;
  readonly conflict: WorkspaceConflict | undefined;
};

export type TerminalSurface = {
  readonly cols: number;
  readonly rows: number;
  readonly onOutput: (chunk: string) => void;
  readonly onReady?: () => void;
};

export type TerminalHandle = {
  readonly write: (data: string) => void;
  readonly resize: (cols: number, rows: number) => void;
  readonly dispose: () => void;
};

export type WorkspaceController = {
  readonly previewUrl: string | undefined;
  readonly status: PreviewStatus;
  readonly error: string | undefined;
  readonly logs: string;
  readonly reloadPreview: () => void;
  readonly clearError: () => void;
  readonly resync: () => void;
  readonly resyncAfterAgent: () => void;

  readonly iframeRef: RefObject<HTMLIFrameElement | null>;
  readonly editMode: boolean;
  readonly selectedElement: VisualEditorElementInfo | undefined;
  readonly toggleEditMode: () => void;
  readonly clearSelection: () => void;
  readonly handleIframeLoad: () => void;

  readonly previewError: PreviewRuntimeError | undefined;
  readonly clearPreviewError: () => void;

  readonly tree: readonly WorkspaceNode[];
  readonly treeLoading: boolean;
  readonly refreshTree: () => void;
  readonly openPaths: readonly string[];
  readonly activePath: string | undefined;
  readonly openFile: (path: string) => void;
  readonly closeFile: (path: string) => void;
  readonly setActivePath: (path: string) => void;
  readonly getFileState: (path: string) => WorkspaceFileState | undefined;
  readonly updateFileContents: (path: string, contents: string) => void;
  readonly saveFile: (path: string) => Promise<void>;
  readonly saveAll: () => Promise<void>;
  readonly createFile: (parentDir: string, name: string) => Promise<void>;
  readonly createDirectory: (parentDir: string, name: string) => Promise<void>;
  readonly renamePath: (from: string, to: string) => Promise<void>;
  readonly deletePath: (path: string) => Promise<void>;

  readonly acceptAgentChanges: (path: string) => Promise<void>;
  readonly keepLocalChanges: (
    path: string,
    currentContents?: string,
  ) => Promise<void>;

  readonly attachTerminal: (surface: TerminalSurface) => TerminalHandle;
  readonly flushTerminalSync: () => Promise<void>;

  readonly agentRunning: boolean;
  readonly busy: boolean;
};

export type { WorkspaceNode };
