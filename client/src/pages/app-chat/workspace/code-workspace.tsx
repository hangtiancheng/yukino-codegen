import { Group, Panel, Separator } from "react-resizable-panels";
import { type ReactNode } from "react";
import { CodeEditorPanel } from "./code-editor-panel";
import { FileExplorer } from "./file-explorer";
import { WorkspaceTerminal } from "./workspace-terminal";

export type CodeWorkspaceProps = {
  /** Whether the Code tab is visible, forwarded so Monaco can relayout. */
  readonly active: boolean;
};

/**
 * Resizable IDE layout: a file explorer beside a stacked editor and terminal.
 */
export function CodeWorkspace({ active }: CodeWorkspaceProps): ReactNode {
  return (
    <Group orientation="horizontal" className="h-full min-h-0">
      <Panel
        id="workspace-explorer"
        defaultSize="24%"
        minSize="14%"
        className="bg-ctp-mantle min-h-0"
      >
        <FileExplorer />
      </Panel>
      <Separator className="bg-border hover:bg-primary/50 w-px cursor-col-resize" />
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
          <Separator className="bg-border hover:bg-primary/50 h-px cursor-row-resize" />
          <Panel
            id="workspace-terminal"
            defaultSize="32%"
            minSize="10%"
            className="min-h-0"
          >
            <WorkspaceTerminal />
          </Panel>
        </Group>
      </Panel>
    </Group>
  );
}
