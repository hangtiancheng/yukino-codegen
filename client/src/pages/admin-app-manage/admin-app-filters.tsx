import { type ReactNode } from "react";
import { Button, TextField } from "@/shared/ui";
import { type AdminAppFilterValues } from "./admin-app-query";

export type AdminAppFiltersProps = {
  readonly values: AdminAppFilterValues;
  readonly onChange: (values: AdminAppFilterValues) => void;
  readonly onSubmit: () => void;
  readonly onReset: () => void;
};

export function AdminAppFilters({
  values,
  onChange,
  onSubmit,
  onReset,
}: AdminAppFiltersProps): ReactNode {
  return (
    <form
      className="border-border/80 bg-card shadow-soft grid gap-3.5 rounded-xl border p-3.5 md:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <TextField
        label="App ID"
        inputMode="numeric"
        value={values.id}
        onChange={(event) => onChange({ ...values, id: event.target.value })}
      />
      <TextField
        label="App name"
        value={values.appName}
        onChange={(event) =>
          onChange({ ...values, appName: event.target.value })
        }
      />
      <TextField
        label="Creator ID"
        inputMode="numeric"
        value={values.userId}
        onChange={(event) =>
          onChange({ ...values, userId: event.target.value })
        }
      />
      <div className="flex items-end gap-2 md:col-span-3 md:justify-end">
        <Button type="submit">Search</Button>
        <Button type="button" variant="outline" onClick={onReset}>
          Reset
        </Button>
      </div>
    </form>
  );
}
