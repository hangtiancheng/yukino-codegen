import { useForm } from "@tanstack/react-form";
import { type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getZodFieldError } from "@/shared/lib";
import { useRegister } from "@/shared/query";
import { userRegisterRequestSchema } from "@/shared/schemas";
import { AuthCard, LoadingButton, TextField } from "@/shared/ui";
import { getConfirmPasswordError } from "./confirm-password-error";

export function UserRegisterPage(): ReactNode {
  const navigate = useNavigate();
  const registerMutation = useRegister();

  const form = useForm({
    defaultValues: {
      userAccount: "",
      userPassword: "",
      checkPassword: "",
    },
    validators: {
      onSubmit: userRegisterRequestSchema,
    },
    onSubmit: ({ value }) => {
      const request = userRegisterRequestSchema.parse(value);
      registerMutation.mutate(request, {
        onSuccess: () => {
          toast.success("Registration successful");
          navigate("/user/login", { replace: true });
        },
        onError: () => {
          toast.error("Registration failed, please retry");
        },
      });
    },
  });

  return (
    <div className="relative flex min-h-[80vh] items-center justify-center px-4 py-10">
      <div
        className="bg-grid-sage pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,black,transparent)]"
        aria-hidden="true"
      />
      <AuthCard
        title="Create account"
        description="Create complete apps without writing code"
        footer={
          <span>
            Already have an account?{" "}
            <Link
              to="/user/login"
              className="text-primary font-medium hover:underline"
            >
              Login
            </Link>
          </span>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="userAccount">
            {(field) => (
              <TextField
                label="Account"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="Enter account"
                autoComplete="username"
                errorMessage={getZodFieldError(
                  userRegisterRequestSchema.shape.userAccount,
                  field.state.value,
                  field.state.meta.isTouched,
                )}
              />
            )}
          </form.Field>
          <form.Field name="userPassword">
            {(field) => (
              <TextField
                label="Password"
                name={field.name}
                type="password"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="Enter password"
                autoComplete="new-password"
                errorMessage={getZodFieldError(
                  userRegisterRequestSchema.shape.userPassword,
                  field.state.value,
                  field.state.meta.isTouched,
                )}
              />
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.userPassword}>
            {(password) => (
              <form.Field name="checkPassword">
                {(field) => (
                  <TextField
                    label="Confirm Password"
                    name={field.name}
                    type="password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    errorMessage={getConfirmPasswordError(
                      field.state.value,
                      password,
                      field.state.meta.isTouched,
                    )}
                  />
                )}
              </form.Field>
            )}
          </form.Subscribe>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <LoadingButton
                type="submit"
                className="mt-1 w-full"
                disabled={!canSubmit}
                isLoading={isSubmitting || registerMutation.isPending}
              >
                Register
              </LoadingButton>
            )}
          </form.Subscribe>
        </form>
      </AuthCard>
    </div>
  );
}
