import { type ReactNode } from "react";
import { Badge, Button, DataTable, type DataTableColumn } from "@/shared/ui";
import { type ChatHistory } from "@/shared/schemas";
import { formatTimestamp } from "../admin-shared/format-admin-value";

export type AdminChatTableProps = {
  readonly messages: ReadonlyArray<ChatHistory>;
  readonly onViewChat: (message: ChatHistory) => void;
};

export function AdminChatTable({
  messages,
  onViewChat,
}: AdminChatTableProps): ReactNode {
  return (
    <DataTable
      records={messages}
      columns={chatColumns(onViewChat)}
      getRowKey={(message) => message.id}
    />
  );
}

function chatColumns(
  onViewChat: (message: ChatHistory) => void,
): ReadonlyArray<DataTableColumn<ChatHistory>> {
  return [
    { key: "id", header: "ID", render: (message) => message.id },
    { key: "app", header: "App ID", render: (message) => message.appId },
    { key: "user", header: "User ID", render: (message) => message.userId },
    {
      key: "type",
      header: "Type",
      render: (message) => (
        <Badge variant={message.messageType === "ai" ? "default" : "secondary"}>
          {message.messageType}
        </Badge>
      ),
    },
    {
      key: "message",
      header: "Message",
      render: (message) => (
        <details className="max-w-lg">
          <summary className="text-foreground cursor-pointer truncate">
            {message.message}
          </summary>
          <pre className="bg-secondary text-secondary-foreground mt-2 max-h-48 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap">
            {message.message}
          </pre>
        </details>
      ),
    },
    {
      key: "created",
      header: "Created",
      render: (message) => formatTimestamp(message.createTime),
    },
    {
      key: "actions",
      header: "Actions",
      render: (message) => (
        <Button size="sm" variant="outline" onClick={() => onViewChat(message)}>
          View chat
        </Button>
      ),
    },
  ];
}
