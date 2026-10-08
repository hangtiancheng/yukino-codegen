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
import { type AdminUserFilterValues } from "./admin-user-query";

const ALL_ROLES = "all";

const ROLE_ITEMS = [
  { value: ALL_ROLES, label: "All roles" },
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

export type AdminUserFiltersProps = {
  readonly values: AdminUserFilterValues;
  readonly onChange: (values: AdminUserFilterValues) => void;
  readonly onSubmit: () => void;
  readonly onReset: () => void;
};

export function AdminUserFilters({
  values,
  onChange,
  onSubmit,
  onReset,
}: AdminUserFiltersProps): ReactNode {
  return (
    <form
      className="border-border/80 bg-card shadow-soft grid gap-3.5 rounded-xl border p-3.5 md:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <TextField
        label="User ID"
        inputMode="numeric"
        value={values.id}
        onChange={(event) => onChange({ ...values, id: event.target.value })}
      />
      <TextField
        label="Account"
        value={values.userAccount}
        onChange={(event) =>
          onChange({ ...values, userAccount: event.target.value })
        }
      />
      <TextField
        label="Username"
        value={values.username}
        onChange={(event) =>
          onChange({ ...values, username: event.target.value })
        }
      />
      <div className="text-foreground flex flex-col gap-1.5 text-sm font-medium">
        Role
        <Select
          items={ROLE_ITEMS}
          value={values.userRole === "" ? ALL_ROLES : values.userRole}
          onValueChange={(value) =>
            onChange({ ...values, userRole: parseRole(value ?? "") })
          }
        >
          <SelectTrigger aria-label="Role" className="w-full font-normal">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_ITEMS.map((item) => (
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

function parseRole(value: string): AdminUserFilterValues["userRole"] {
  if (value === "user" || value === "admin") {
    return value;
  }
  return "";
}
