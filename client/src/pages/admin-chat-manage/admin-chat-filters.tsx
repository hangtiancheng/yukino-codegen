import { type ReactNode } from "react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextField,
} from "@/shared/ui";
import { type AdminChatFilterValues } from "./admin-chat-query";

const ALL_MESSAGES = "all";

const MESSAGE_TYPE_ITEMS = [
  { value: ALL_MESSAGES, label: "All messages" },
  { value: "user", label: "User" },
  { value: "ai", label: "AI" },
];

export type AdminChatFiltersProps = {
  readonly values: AdminChatFilterValues;
  readonly onChange: (values: AdminChatFilterValues) => void;
  readonly onSubmit: () => void;
  readonly onReset: () => void;
};

export function AdminChatFilters({
  values,
  onChange,
  onSubmit,
  onReset,
}: AdminChatFiltersProps): ReactNode {
  return (
    <form
      className="border-border/80 bg-card shadow-soft grid gap-3.5 rounded-xl border p-3.5 md:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <TextField
        label="App ID"
        inputMode="numeric"
        value={values.appId}
        onChange={(event) => onChange({ ...values, appId: event.target.value })}
      />
      <TextField
        label="User ID"
        inputMode="numeric"
        value={values.userId}
        onChange={(event) =>
          onChange({ ...values, userId: event.target.value })
        }
      />
      <TextField
        label="Message"
        value={values.message}
        onChange={(event) =>
          onChange({ ...values, message: event.target.value })
        }
      />
      <div className="text-foreground flex flex-col gap-1.5 text-sm font-medium">
        Message type
        <Select
          items={MESSAGE_TYPE_ITEMS}
          value={values.messageType === "" ? ALL_MESSAGES : values.messageType}
          onValueChange={(value) =>
            onChange({ ...values, messageType: parseMessageType(value ?? "") })
          }
        >
          <SelectTrigger
            aria-label="Message type"
            className="w-full font-normal"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESSAGE_TYPE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end gap-2 md:col-span-4 md:justify-end">
        <Button type="submit">Search</Button>
        <Button type="button" variant="outline" onClick={onReset}>
          Reset
        </Button>
      </div>
    </form>
  );
}

function parseMessageType(value: string): AdminChatFilterValues["messageType"] {
  if (value === "user" || value === "ai") {
    return value;
  }
  return "";
}
