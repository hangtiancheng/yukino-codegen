import type { RefObject } from "react";
import type { VisualEditorElementInfo } from "@/shared/schemas";
import type { PreviewRuntimeError } from "../build-error-context";
import type { PreviewStatus } from "../preview-status";
import type { WorkspaceNode } from "./workspace-tree";

/** A conflict recorded when local edits and agent output both diverged. */
export type WorkspaceConflict = {
  readonly path: string;
  readonly base: string;
  readonly local: string;
  readonly server: string;
};

/** Editor-facing state for a single open file. */
export type WorkspaceFileState = {
  readonly path: string;
  readonly binary: boolean;
  /** Current editor contents (empty string for binary files). */
  readonly contents: string;
  /** Last-synced server contents used as the merge base. */
  readonly baseText: string;
  /** Local FNV hash of {@link baseText}; edits are dirty when their hash differs. */
  readonly baseHash: string;
  /** Server content hash of the base revision, sent as the write expectedHash. */
  readonly serverHash: string | null;
  readonly dirty: boolean;
  /** Bumped only on external updates so the editor knows to reset its model. */
  readonly revision: number;
  readonly conflict: WorkspaceConflict | undefined;
};

/** xterm-facing surface passed to {@link WorkspaceController.attachTerminal}. */
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

/**
 * The unified Preview/Code workspace controller. Owns the WebContainer
 * lifecycle, the source tree and its hashes, editor buffers with conflict
 * state, the integrated terminal, and the preview/visual-editor state, exposed
 * through {@link useWorkspace} so the panel and its children stay in sync.
 */
export type WorkspaceController = {
  // Preview lifecycle.
  readonly previewUrl: string | undefined;
  readonly status: PreviewStatus;
  readonly error: string | undefined;
  readonly logs: string;
  readonly reloadPreview: () => void;
  readonly clearError: () => void;
  readonly resync: () => void;
  readonly resyncAfterAgent: () => void;

  // Visual editor (state preserved across resyncs).
  readonly iframeRef: RefObject<HTMLIFrameElement | null>;
  readonly editMode: boolean;
  readonly selectedElement: VisualEditorElementInfo | undefined;
  readonly toggleEditMode: () => void;
  readonly clearSelection: () => void;
  readonly handleIframeLoad: () => void;

  // Preview runtime errors (state preserved across resyncs).
  readonly previewError: PreviewRuntimeError | undefined;
  readonly clearPreviewError: () => void;

  // Source tree and files.
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

  // Conflict resolution.
  readonly acceptAgentChanges: (path: string) => Promise<void>;
  readonly keepLocalChanges: (
    path: string,
    currentContents?: string,
  ) => Promise<void>;

  // Integrated terminal.
  readonly attachTerminal: (surface: TerminalSurface) => TerminalHandle;
  readonly flushTerminalSync: () => Promise<void>;

  // Status flags.
  readonly agentRunning: boolean;
  readonly busy: boolean;
};

export type { WorkspaceNode };
