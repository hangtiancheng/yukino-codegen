import { useForm } from "@tanstack/react-form";
import { type ReactNode } from "react";
import { getZodFieldError } from "@/shared/lib";
import { type AppVo } from "@/shared/schemas";
import { Button, LoadingButton, TextArea, TextField } from "@/shared/ui";
import {
  appCoverInputSchema,
  appEditFormSchema,
  type AppEditFormValues,
} from "./app-edit-form-schema";

export type AppEditFormProps = {
  readonly app: AppVo;
  readonly admin: boolean;
  readonly submitting: boolean;
  readonly onSubmit: (values: AppEditFormValues) => void;
  readonly onReset: () => void;
  readonly onOpenChat: () => void;
};

export function AppEditForm({
  app,
  admin,
  submitting,
  onSubmit,
  onReset,
  onOpenChat,
}: AppEditFormProps): ReactNode {
  const form = useForm({
    defaultValues: appEditFormSchema.parse({
      appName: app.appName,
      appCover: app.appCover ?? "",
      priority: app.priority ?? 0,
    }),
    validators: { onSubmit: appEditFormSchema },
    onSubmit: ({ value }) => onSubmit(appEditFormSchema.parse(value)),
  });

  return (
    <form
      className="border-border/80 bg-card shadow-soft grid gap-4 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field name="appName">
        {(field) => (
          <TextField
            label="App Name"
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            errorMessage={getZodFieldError(
              appEditFormSchema.shape.appName,
              field.state.value,
              field.state.meta.isTouched,
            )}
          />
        )}
      </form.Field>
      {admin ? (
        <>
          <form.Field name="appCover">
            {(field) => (
              <TextField
                label="App Cover URL"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                hint="Recommended size: 400 x 300."
                errorMessage={getZodFieldError(
                  appCoverInputSchema,
                  field.state.value,
                  field.state.meta.isTouched,
                )}
              />
            )}
          </form.Field>
          <form.Field name="priority">
            {(field) => (
              <TextField
                label="Priority"
                name={field.name}
                type="number"
                min={0}
                max={99}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) =>
                  field.handleChange(Number(event.target.value))
                }
                hint="Set to 99 for awesome app placement."
              />
            )}
          </form.Field>
        </>
      ) : null}
      <TextArea label="Initial Prompt" value={app.initPrompt} disabled />
      <div className="flex flex-wrap gap-2 pt-1">
        <LoadingButton type="submit" isLoading={submitting}>
          Save Changes
        </LoadingButton>
        <Button type="button" variant="outline" onClick={onReset}>
          Reset
        </Button>
        <Button type="button" variant="outline" onClick={onOpenChat}>
          Go to Chat
        </Button>
      </div>
    </form>
  );
}
