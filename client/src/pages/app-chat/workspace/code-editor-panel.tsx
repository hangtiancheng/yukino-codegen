import { Save, SaveAll, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button, Spinner } from "@/shared/ui";
import { CATPPUCCIN_THEME_NAME } from "./catppuccin-theme";
import { loadMonaco, type MonacoModule } from "./monaco-loader";
import { baseName, languageForPath } from "./workspace-paths";
import { useWorkspace } from "./workspace-context";
import type { WorkspaceFileState } from "./workspace-types";
import type * as Monaco from "monaco-editor";

const EDITOR_THEME = CATPPUCCIN_THEME_NAME;

type LatestRefs = {
  activePath: string | undefined;
  saveFile: (path: string) => Promise<void>;
  updateFileContents: (path: string, contents: string) => void;
};

function reportWorkspaceError(operation: Promise<void>): void {
  void operation.catch((cause: unknown) => {
    toast.error(
      cause instanceof Error ? cause.message : "Workspace operation failed",
    );
  });
}

export type CodeEditorPanelProps = {
  /** Whether the Code tab is currently visible, used to trigger relayout. */
  readonly active: boolean;
};

/**
 * Monaco-backed editor with an open-file tab strip. Monaco itself is imported
 * lazily on first mount and then stays resident. Conflicting files switch to a
 * diff editor with Accept Agent / Keep Local resolution.
 */
export function CodeEditorPanel({ active }: CodeEditorPanelProps): ReactNode {
  const workspace = useWorkspace();
  const hostRef = useRef<HTMLDivElement>(null);
  const diffHostRef = useRef<HTMLDivElement>(null);
  const monacoRef = useRef<MonacoModule | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const diffEditorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(
    null,
  );
  const modelsRef = useRef<Map<string, Monaco.editor.ITextModel>>(new Map());
  const diffModelsRef = useRef<{
    original: Monaco.editor.ITextModel;
    modified: Monaco.editor.ITextModel;
  } | null>(null);
  const appliedRevisionRef = useRef<Map<string, number>>(new Map());
  const applyingExternalRef = useRef(false);
  const latestRef = useRef<LatestRefs>({
    activePath: undefined,
    saveFile: workspace.saveFile,
    updateFileContents: workspace.updateFileContents,
  });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string>();

  const { activePath, agentRunning } = workspace;
  const activeFile =
    activePath !== undefined ? workspace.getFileState(activePath) : undefined;
  const hasConflict = activeFile?.conflict !== undefined;

  latestRef.current = {
    activePath,
    saveFile: workspace.saveFile,
    updateFileContents: workspace.updateFileContents,
  };

  useEffect(() => {
    let cancelled = false;
    const models = modelsRef.current;
    void loadMonaco()
      .then((monaco) => {
        if (cancelled) return;
        monacoRef.current = monaco;
        const host = hostRef.current;
        if (host === null) return;
        const editor = monaco.editor.create(host, {
          automaticLayout: true,
          theme: EDITOR_THEME,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          tabSize: 2,
          readOnly: false,
        });
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          const path = latestRef.current.activePath;
          if (path !== undefined) {
            reportWorkspaceError(latestRef.current.saveFile(path));
          }
        });
        editorRef.current = editor;
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : "Failed to load editor",
        );
      });
    return () => {
      cancelled = true;
      diffModelsRef.current?.original.dispose();
      diffModelsRef.current?.modified.dispose();
      diffModelsRef.current = null;
      diffEditorRef.current?.dispose();
      diffEditorRef.current = null;
      editorRef.current?.dispose();
      editorRef.current = null;
      for (const model of models.values()) model.dispose();
      models.clear();
    };
  }, []);

  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!ready || monaco === null || editor === null) return;

    if (hasConflict && activeFile !== undefined && activePath !== undefined) {
      const conflict = activeFile.conflict;
      if (conflict === undefined) return;
      const diffEditor = ensureDiffEditor(monaco, diffHostRef, diffEditorRef);
      if (diffEditor === null) return;
      disposeDiffModels(diffModelsRef);
      const language = languageForPath(activePath);
      const original = monaco.editor.createModel(conflict.server, language);
      const modified = monaco.editor.createModel(conflict.local, language);
      diffModelsRef.current = { original, modified };
      diffEditor.setModel({ original, modified });
      diffEditor.layout();
      return;
    }

    disposeDiffModels(diffModelsRef);
    diffEditorRef.current?.setModel(null);

    const readOnly = agentRunning || (activeFile?.binary ?? false);
    editor.updateOptions({ readOnly });

    if (
      activeFile === undefined ||
      activeFile.binary ||
      activePath === undefined
    ) {
      editor.setModel(null);
      return;
    }

    const model = ensureModel(
      monaco,
      activePath,
      activeFile,
      modelsRef,
      appliedRevisionRef,
      applyingExternalRef,
      latestRef,
    );
    editor.setModel(model);
    syncModel(
      activePath,
      activeFile,
      modelsRef,
      appliedRevisionRef,
      applyingExternalRef,
    );
    editor.layout();
  }, [ready, activePath, hasConflict, activeFile, agentRunning]);

  useEffect(() => {
    if (!active || !ready) return;
    editorRef.current?.layout();
    diffEditorRef.current?.layout();
  }, [active, ready]);

  return (
    <div className="bg-ctp-base flex h-full min-h-0 flex-col">
      <div className="border-ctp-crust flex items-center gap-1 overflow-x-auto border-b">
        <div className="flex min-w-0 flex-1 items-center">
          {workspace.openPaths.length === 0 ? (
            <span className="text-ctp-overlay0 px-3 py-2 text-xs">
              Select a file to edit
            </span>
          ) : (
            workspace.openPaths.map((path) => {
              const file = workspace.getFileState(path);
              return (
                <div
                  key={path}
                  className={cn(
                    "border-ctp-crust flex items-center gap-1 border-r px-3 py-1.5 text-xs",
                    activePath === path
                      ? "bg-ctp-base text-ctp-text"
                      : "bg-ctp-mantle text-ctp-subtext0 hover:bg-ctp-crust",
                  )}
                >
                  <button
                    type="button"
                    className="max-w-40 truncate"
                    onClick={() => workspace.setActivePath(path)}
                  >
                    {baseName(path)}
                  </button>
                  {file?.conflict !== undefined ? (
                    <span className="text-ctp-red text-[10px] font-semibold">
                      !
                    </span>
                  ) : file?.dirty === true ? (
                    <span className="bg-ctp-yellow size-1.5 rounded-full" />
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Close ${baseName(path)}`}
                    className="hover:text-ctp-text"
                    onClick={() => workspace.closeFile(path)}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 px-2">
          {hasConflict && activePath !== undefined ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={agentRunning || workspace.busy}
                onClick={() =>
                  reportWorkspaceError(workspace.acceptAgentChanges(activePath))
                }
              >
                Accept Agent
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={agentRunning || workspace.busy}
                onClick={() =>
                  reportWorkspaceError(
                    workspace.keepLocalChanges(
                      activePath,
                      diffModelsRef.current?.modified.getValue(),
                    ),
                  )
                }
              >
                Keep Local
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Save"
                title="Save (Cmd/Ctrl+S)"
                disabled={
                  agentRunning ||
                  workspace.busy ||
                  activePath === undefined ||
                  activeFile?.dirty !== true
                }
                onClick={() => {
                  if (activePath !== undefined) {
                    reportWorkspaceError(workspace.saveFile(activePath));
                  }
                }}
              >
                <Save className="size-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Save all"
                title="Save all"
                disabled={agentRunning || workspace.busy}
                onClick={() => reportWorkspaceError(workspace.saveAll())}
              >
                <SaveAll className="size-4" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={hostRef}
          className={cn("h-full w-full", hasConflict && "hidden")}
        />
        <div
          ref={diffHostRef}
          className={cn("h-full w-full", !hasConflict && "hidden")}
        />
        {loadError !== undefined ? (
          <div className="text-ctp-red absolute inset-0 flex items-center justify-center p-4 text-sm">
            {loadError}
          </div>
        ) : !ready ? (
          <div className="text-ctp-overlay0 absolute inset-0 flex items-center justify-center gap-2 text-sm">
            <Spinner className="size-5" aria-hidden="true" />
            Loading editor…
          </div>
        ) : activeFile?.binary === true ? (
          <div className="text-ctp-overlay0 absolute inset-0 flex items-center justify-center p-4 text-sm">
            Binary file — read only.
          </div>
        ) : workspace.openPaths.length === 0 ? (
          <div className="text-ctp-overlay0 absolute inset-0 flex items-center justify-center p-4 text-sm">
            No file open.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ensureDiffEditor(
  monaco: MonacoModule,
  hostRef: RefObject<HTMLDivElement | null>,
  diffEditorRef: RefObject<Monaco.editor.IStandaloneDiffEditor | null>,
): Monaco.editor.IStandaloneDiffEditor | null {
  if (diffEditorRef.current !== null) return diffEditorRef.current;
  const host = hostRef.current;
  if (host === null) return null;
  const diffEditor = monaco.editor.createDiffEditor(host, {
    automaticLayout: true,
    theme: EDITOR_THEME,
    readOnly: false,
    originalEditable: false,
    renderSideBySide: true,
    minimap: { enabled: false },
    fontSize: 13,
  });
  diffEditorRef.current = diffEditor;
  return diffEditor;
}

function disposeDiffModels(
  diffModelsRef: RefObject<{
    original: Monaco.editor.ITextModel;
    modified: Monaco.editor.ITextModel;
  } | null>,
): void {
  diffModelsRef.current?.original.dispose();
  diffModelsRef.current?.modified.dispose();
  diffModelsRef.current = null;
}

function ensureModel(
  monaco: MonacoModule,
  path: string,
  file: WorkspaceFileState,
  modelsRef: RefObject<Map<string, Monaco.editor.ITextModel>>,
  appliedRevisionRef: RefObject<Map<string, number>>,
  applyingExternalRef: RefObject<boolean>,
  latestRef: RefObject<LatestRefs>,
): Monaco.editor.ITextModel {
  const existing = modelsRef.current.get(path);
  if (existing !== undefined) return existing;
  const uri = monaco.Uri.parse(`inmemory://workspace/${path}`);
  const created =
    monaco.editor.getModel(uri) ??
    monaco.editor.createModel(file.contents, languageForPath(path), uri);
  modelsRef.current.set(path, created);
  appliedRevisionRef.current.set(path, file.revision);
  created.onDidChangeContent(() => {
    if (applyingExternalRef.current) return;
    latestRef.current.updateFileContents(path, created.getValue());
  });
  return created;
}

function syncModel(
  path: string,
  file: WorkspaceFileState,
  modelsRef: RefObject<Map<string, Monaco.editor.ITextModel>>,
  appliedRevisionRef: RefObject<Map<string, number>>,
  applyingExternalRef: RefObject<boolean>,
): void {
  if (appliedRevisionRef.current.get(path) === file.revision) return;
  const model = modelsRef.current.get(path);
  if (model === undefined) return;
  applyingExternalRef.current = true;
  if (model.getValue() !== file.contents) model.setValue(file.contents);
  applyingExternalRef.current = false;
  appliedRevisionRef.current.set(path, file.revision);
}
